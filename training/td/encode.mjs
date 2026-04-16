// training/td/encode.mjs
// 98-dimensional state encoding for the compact CNN value network.
// Canonical form: always from the current player's perspective.
//
// Layout (98 values):
//   Board:   50 = 25 cells × 2 (rank, ownership)             → CNN reshapes to 2×5×5
//     Ch0: card rank normalized ((value-2)/12, 0 if empty)
//     Ch1: ownership (+1 mine, -1 opponent, 0 empty)
//   Cards:   39 = 3 channels × 13 ranks                      → CNN reshapes to 3×13
//     Ch0: opponent unseen    (max(0, 2-known) / 2)
//     Ch1: own unseen         (max(0, 2-known) / 2)
//     Ch2: own discard count  (count / 2 per rank)
//   Hand:     3 = card values in each hand slot               → scalar branch
//   Context:  6 = non-derivable game state                    → scalar branch
//     opp discard size, connected sizes (×2), legal moves, turn count, opening flag

import {
    BOARD_SIZE, HAND_SIZE, CARD_RANKS,
    getCardValue, getPlayerState, otherPlayer,
    getBoardMetrics, getLegalMoves
} from '../engine/core.mjs';

export const INPUT_SIZE = 98;

// Offsets for each section (used by CNN to slice the flat vector)
export const BOARD_OFFSET = 0;
export const BOARD_LEN = 50;
export const BOARD_CHANNELS = 2;
export const CARDS_OFFSET = 50;
export const CARDS_LEN = 39;
export const CARDS_CHANNELS = 3;
export const HAND_OFFSET = 89;
export const HAND_LEN = 3;
export const CONTEXT_OFFSET = 92;
export const CONTEXT_LEN = 6;

export const encodeState = (state, perspective) => {
    const out = new Float32Array(INPUT_SIZE);
    const opp = otherPlayer(perspective);
    let offset = 0;

    // ---- Board: 25 cells × 2 features = 50 ----
    // Ch0: rank normalized,  Ch1: ownership (+1 mine, -1 opp, 0 empty)
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = state.board[r][c];
            const base = offset + (r * BOARD_SIZE + c) * 2;
            if (cell) {
                out[base + 0] = (getCardValue(cell.card) - 2) / 12;
                out[base + 1] = cell.owner === perspective ? 1 : cell.owner === opp ? -1 : 0;
            }
        }
    }
    offset += 50;

    // ---- Card tracking: 3 channels × 13 ranks = 39 ----
    const oppKnown = {};
    const myKnown = {};
    const myDiscardCounts = {};
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            let cell = state.board[r][c];
            while (cell) {
                const counts = cell.owner === opp ? oppKnown : myKnown;
                counts[cell.card.rank] = (counts[cell.card.rank] || 0) + 1;
                cell = cell.coveredCell;
            }
        }
    }
    const myDiscard = state[`${perspective}Discard`];
    for (const card of myDiscard) {
        if (card) {
            myKnown[card.rank] = (myKnown[card.rank] || 0) + 1;
            myDiscardCounts[card.rank] = (myDiscardCounts[card.rank] || 0) + 1;
        }
    }
    const hand = state[`${perspective}Hand`];
    for (const card of hand) {
        if (card) myKnown[card.rank] = (myKnown[card.rank] || 0) + 1;
    }
    // Channel 0: opponent unseen
    for (let i = 0; i < CARD_RANKS.length; i++) {
        out[offset + i] = Math.max(0, 2 - (oppKnown[CARD_RANKS[i]] || 0)) / 2;
    }
    offset += 13;
    // Channel 1: own unseen
    for (let i = 0; i < CARD_RANKS.length; i++) {
        out[offset + i] = Math.max(0, 2 - (myKnown[CARD_RANKS[i]] || 0)) / 2;
    }
    offset += 13;
    // Channel 2: own discard distribution
    for (let i = 0; i < CARD_RANKS.length; i++) {
        out[offset + i] = (myDiscardCounts[CARD_RANKS[i]] || 0) / 2;
    }
    offset += 13;

    // ---- Hand: 3 values (raw card ranks, processed by FC merge) ----
    for (let i = 0; i < HAND_SIZE; i++) {
        const card = hand[i];
        out[offset + i] = card ? (getCardValue(card) - 2) / 12 : 0;
    }
    offset += 3;

    // ---- Context: 6 values (only non-derivable features) ----
    // Deck/discard sizes and scores are derivable from the board + card channels.
    // We keep only what requires BFS, move generation, or hidden information.
    const oppState = getPlayerState(state, opp);
    const selfMetrics = getBoardMetrics(state, perspective);
    const oppMetrics = getBoardMetrics(state, opp);
    const legalMoves = getLegalMoves(state, perspective);

    out[offset + 0] = oppState.discard.length / 23;        // hidden info (can't see which ranks)
    out[offset + 1] = selfMetrics.connected.size / 25;     // requires BFS from home row
    out[offset + 2] = oppMetrics.connected.size / 25;      // requires BFS from home row
    out[offset + 3] = Math.min(legalMoves.length, 50) / 50; // requires move generation
    out[offset + 4] = Math.min(state.turnCount ?? 0, 60) / 60; // game clock
    out[offset + 5] = state.openingMoveComplete ? 1 : 0;   // phase flag

    return out;
};
