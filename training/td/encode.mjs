// training/td/encode.mjs
// 103-dimensional state encoding for the TD-lambda value network.
// Canonical form: always from the current player's perspective.
//
// Layout (103 values):
//   Board:    75 = 25 cells × 3 (rank, is_mine, is_opponent)
//   Hand:      3 = rank of each hand card
//   Opponent: 13 = unseen copies per rank (2-A)
//   Context:  12 = deck/discard/score/connected/mobility/phase

import {
    BOARD_SIZE, HAND_SIZE, CARD_RANKS, CARD_VALUES,
    getCardValue, getPlayerState, otherPlayer,
    getScores, getBoardMetrics, getLegalMoves
} from '../engine/core.mjs';

export const INPUT_SIZE = 116;

export const encodeState = (state, perspective) => {
    const out = new Float32Array(INPUT_SIZE);
    const opp = otherPlayer(perspective);
    let offset = 0;

    // ---- Board: 25 cells × 3 features = 75 ----
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = state.board[r][c];
            const base = offset + (r * BOARD_SIZE + c) * 3;
            if (cell) {
                out[base + 0] = (getCardValue(cell.card) - 2) / 12; // rank normalized
                out[base + 1] = cell.owner === perspective ? 1 : 0;  // is mine
                out[base + 2] = cell.owner === opp ? 1 : 0;          // is opponent
            }
            // empty cells: all zeros (from Float32Array init)
        }
    }
    offset += 75;

    // ---- Hand: 3 values ----
    const hand = state[`${perspective}Hand`];
    for (let i = 0; i < HAND_SIZE; i++) {
        const card = hand[i];
        out[offset + i] = card ? (getCardValue(card) - 2) / 12 : 0;
    }
    offset += 3;

    // ---- Card tracking: 26 values (13 opponent + 13 own) ----
    // Separate inputs for each side — the network can weight them independently.
    // Combining them into one value would hide information (e.g., both having 0
    // unseen vs both having 2 unseen look the same when combined).
    const oppKnown = {};
    const myKnown = {};
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
    // NOTE: opponent discards are HIDDEN — we can't see which cards they discarded,
    // only how many (tracked in the context section as oppState.discard.length).
    // Only count opponent cards visible on the board.
    const myDiscard = state[`${perspective}Discard`];
    for (const card of myDiscard) {
        if (card) myKnown[card.rank] = (myKnown[card.rank] || 0) + 1;
    }
    const myHand = state[`${perspective}Hand`];
    for (const card of myHand) {
        if (card) myKnown[card.rank] = (myKnown[card.rank] || 0) + 1;
    }
    // Opponent unseen: 13 values
    for (let i = 0; i < CARD_RANKS.length; i++) {
        out[offset + i] = Math.max(0, 2 - (oppKnown[CARD_RANKS[i]] || 0)) / 2;
    }
    offset += 13;
    // Own unseen (in my deck, not yet drawn): 13 values
    for (let i = 0; i < CARD_RANKS.length; i++) {
        out[offset + i] = Math.max(0, 2 - (myKnown[CARD_RANKS[i]] || 0)) / 2;
    }
    offset += 13;

    // ---- Context: 12 values ----
    const selfState = getPlayerState(state, perspective);
    const oppState = getPlayerState(state, opp);
    const scores = getScores(state);
    const selfMetrics = getBoardMetrics(state, perspective);
    const oppMetrics = getBoardMetrics(state, opp);
    const legalMoves = getLegalMoves(state, perspective);

    out[offset + 0] = selfState.deck.length / 23;
    out[offset + 1] = oppState.deck.length / 23;
    out[offset + 2] = selfState.discard.length / 23;
    out[offset + 3] = oppState.discard.length / 23;
    out[offset + 4] = scores[perspective] / 25;
    out[offset + 5] = scores[opp] / 25;
    out[offset + 6] = (scores[perspective] - scores[opp]) / 25;
    out[offset + 7] = selfMetrics.connected.size / 25;
    out[offset + 8] = oppMetrics.connected.size / 25;
    out[offset + 9] = Math.min(legalMoves.length, 50) / 50;
    out[offset + 10] = Math.min(state.turnCount ?? 0, 60) / 60;
    out[offset + 11] = state.openingMoveComplete ? 1 : 0;

    return out;
};
