// training/engine/encoding.mjs
// State → Float32Array tensor encoder for the RL policy/value net.
// Canonical-form (always from the current player's perspective).
//
// Output shape: Float32Array(INPUT_SIZE = 256)
// Action space: ACTION_SIZE = 80
//
// Action encoding — we use a flat 80-dim output with mask:
//   action_index = slotIndex * 27 + target
//   where target ∈ [0, 24] = board cell (row * 5 + col),
//         target === 25   = discard,
//         target === 26   = unused (pad)
//   ⇒ 3 slots * 27 = 81, rounded down to 80 with the last pad dropped.
// For simplicity we use 3 * 27 = 81 and allocate 81 slots but expose
// ACTION_SIZE = 81 and rely on the mask to zero unused entries.

import {
    BOARD_SIZE, HAND_SIZE,
    CARD_VALUES, CARD_RANKS,
    getPlayerState, getHomeRow, otherPlayer, getCardValue,
    getConnectedCellKeys, getMovePhaseProfile, getScores,
    countUnknownHigherCards, getBoardMetrics, isValidMove, getLegalMoves
} from './core.mjs';

export const INPUT_SIZE = 256;
export const ACTION_SIZE = 81;
export const DISCARD_TARGET = 25;

/** Encode a game state from `perspective` player's view into a 256-float
 *  vector. The vector is returned as a fresh Float32Array; callers that
 *  need to reuse buffers should allocate themselves. */
export const encodeState = (state, perspective) => {
    const out = new Float32Array(INPUT_SIZE);
    const opp = otherPlayer(perspective);
    let offset = 0;

    // ---- Board planes (25 cells × 4 planes + rank + depth + own-connected + opp-connected)
    // Plane indexing: 0=empty, 1=own-top, 2=opp-top, 3=face-down
    const ownConnected = getConnectedCellKeys(state, perspective);
    const oppConnected = getConnectedCellKeys(state, opp);
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = state.board[r][c];
            const base = offset + (r * BOARD_SIZE + c) * 4;
            if (!cell) {
                out[base + 0] = 1;
            } else if (!cell.faceUp) {
                out[base + 3] = 1;
            } else if (cell.owner === perspective) {
                out[base + 1] = 1;
            } else {
                out[base + 2] = 1;
            }
        }
    }
    offset += 25 * 4; // 100

    // Rank normalized (0 if empty)
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = state.board[r][c];
            out[offset + r * BOARD_SIZE + c] = cell ? (getCardValue(cell.card) - 2) / 12 : 0;
        }
    }
    offset += 25; // 125

    // Stack depth capped at 5
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            let depth = 0;
            let cell = state.board[r][c];
            while (cell) { depth += 1; cell = cell.coveredCell; }
            out[offset + r * BOARD_SIZE + c] = Math.min(depth, 5) / 5;
        }
    }
    offset += 25; // 150

    // Own-connected flag
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            out[offset + r * BOARD_SIZE + c] = ownConnected.has(`${r},${c}`) ? 1 : 0;
        }
    }
    offset += 25; // 175

    // Opp-connected flag
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            out[offset + r * BOARD_SIZE + c] = oppConnected.has(`${r},${c}`) ? 1 : 0;
        }
    }
    offset += 25; // 200

    // ---- Own hand (3 × 2: present, rank normalized)
    const ownHand = state[`${perspective}Hand`];
    for (let i = 0; i < HAND_SIZE; i++) {
        const card = ownHand[i];
        out[offset + i * 2 + 0] = card ? 1 : 0;
        out[offset + i * 2 + 1] = card ? (getCardValue(card) - 2) / 12 : 0;
    }
    offset += 6; // 206

    // ---- Globals (12)
    const selfState = getPlayerState(state, perspective);
    const oppState = getPlayerState(state, opp);
    const scores = getScores(state);
    out[offset + 0] = selfState.deck.length / 23;
    out[offset + 1] = oppState.deck.length / 23;
    out[offset + 2] = selfState.discard.length / 23;
    out[offset + 3] = oppState.discard.length / 23;
    out[offset + 4] = scores[perspective] / 25;
    out[offset + 5] = scores[opp] / 25;
    out[offset + 6] = Math.min(state.turnCount, 60) / 60;
    out[offset + 7] = state.gamePhase === 'setup' ? 1 : 0;
    out[offset + 8] = state.setupWidePlacement ? 1 : 0;
    out[offset + 9] = state.openingMoveComplete ? 1 : 0;
    out[offset + 10] = 1; // is-own-turn (always true from our perspective)
    out[offset + 11] = (scores[perspective] - scores[opp]) / 25;
    offset += 12; // 218

    // ---- Opponent belief marginals (26 cards = 13 ranks × 2)
    // For each rank, how many copies the opponent still holds (unknown count / 2)
    const ranks = CARD_RANKS;
    for (let i = 0; i < ranks.length; i++) {
        const rank = ranks[i];
        const counts = require_memoized_count(state, opp);
        const known = counts[rank] || 0;
        out[offset + i] = Math.max(0, 2 - known) / 2;
    }
    offset += 13; // 231

    // Own-rank "still in hand or deck" flags (13 ranks × 1 = 13)
    // Helps the net reason about what cards you have left to play.
    const ownKnown = require_memoized_count(state, perspective);
    for (let i = 0; i < ranks.length; i++) {
        const rank = ranks[i];
        out[offset + i] = Math.max(0, 2 - (ownKnown[rank] || 0)) / 2;
    }
    offset += 13; // 244

    // Pad to INPUT_SIZE
    // Remaining 12 entries are zero (already from Float32Array init).
    return out;
};

// Helper: per-state cached count of known cards for a player.
// Avoids recomputing getKnownCardCounts twice.
const countCache = new WeakMap();
const require_memoized_count = (state, player) => {
    let cache = countCache.get(state);
    if (!cache) {
        cache = {};
        countCache.set(state, cache);
    }
    if (cache[player]) return cache[player];
    // Inline version of getKnownCardCounts without includeHand
    const counts = {};
    const walk = (cell) => {
        if (!cell) return;
        if (cell.owner === player) {
            counts[cell.card.rank] = (counts[cell.card.rank] || 0) + 1;
        }
        walk(cell.coveredCell);
    };
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            walk(state.board[r][c]);
        }
    }
    const discard = state[`${player}Discard`];
    for (const card of discard) {
        if (card) counts[card.rank] = (counts[card.rank] || 0) + 1;
    }
    cache[player] = counts;
    return counts;
};

/** Build an 81-float mask over the action space; 1.0 for legal, 0.0 for illegal.
 *  Indexing: action_index = slotIndex * 27 + target
 *  where target ∈ [0, 24] = cell row*5+col, target === 25 = discard, target 26 = unused. */
export const encodeActionMask = (state, player) => {
    const mask = new Float32Array(ACTION_SIZE);
    const moves = getLegalMoves(state, player);
    for (const move of moves) {
        let target;
        if (move.type === 'place') {
            target = move.row * BOARD_SIZE + move.col;
        } else {
            target = DISCARD_TARGET;
        }
        const idx = move.slotIndex * 27 + target;
        mask[idx] = 1;
    }
    return mask;
};

/** Decode an action index back to a move { type, slotIndex, row?, col? }. */
export const decodeAction = (idx) => {
    const slotIndex = Math.floor(idx / 27);
    const target = idx % 27;
    if (target === DISCARD_TARGET) {
        return { type: 'discard', slotIndex };
    }
    if (target === 26) {
        return null; // padding slot, should not be selected
    }
    const row = Math.floor(target / BOARD_SIZE);
    const col = target % BOARD_SIZE;
    return { type: 'place', slotIndex, row, col };
};

/** Encode a move to its action index. */
export const encodeAction = (move) => {
    if (move.type === 'place') {
        return move.slotIndex * 27 + (move.row * BOARD_SIZE + move.col);
    }
    return move.slotIndex * 27 + DISCARD_TARGET;
};
