// compact-inference.js
// Browser-side CNN value inference for Flood.
// Architecture: conv2d(2→16→32) board + conv1d(3→16→16) cards + fc(63→64→1)
// Exposes window.FloodCompact with:
//   .loadModel(url)      -> Promise<boolean>
//   .isReady()           -> boolean
//   .evaluateState(game, player) -> scaled leaf score for the current state
//   .getLeafBlend()      -> configured heuristic/value blend

(function() {
    'use strict';

    // ====== Encoding layout (104 values) ======
    // Board:   50 = 25 cells × 2 (rank, ownership ±1)    → 2×5×5
    // Cards:   39 = 3 × 13 (opp_unseen, own_unseen, own_discard) → 3×13
    // Hand:     3 = card values                           → scalar
    // Context: 12 = deck/discard/score/connected/etc      → scalar
    const INPUT_SIZE = 98;
    const BOARD_SIZE = 5;
    const K = 3, PAD = 1;

    // Encoding offsets
    const BOARD_C = 2;
    const CARDS_OFF = 50, CARD_C = 3, CARD_W = 13;
    const HAND_OFF = 89, HAND_LEN = 3;
    const CTX_OFF = 92, CTX_LEN = 6;

    // Network dimensions
    const C2D_1_OUT = 16, C2D_2_OUT = 32;
    const C1D_1_OUT = 16, C1D_2_OUT = 16;
    const SPATIAL_OUT = C2D_2_OUT;  // 32
    const CARD_OUT = C1D_2_OUT;     // 16
    const MERGE_SIZE = SPATIAL_OUT + CARD_OUT + HAND_LEN + CTX_LEN; // 63
    const FC1_OUT = 64;

    // Parameter layout
    const sizeConv2d = (ci, co) => co * ci * K * K + co;
    const sizeConv1d = (ci, co) => co * ci * K + co;
    const sizeFC = (inp, out) => inp * out + out;

    const S_C2D1 = sizeConv2d(BOARD_C, C2D_1_OUT);
    const S_C2D2 = sizeConv2d(C2D_1_OUT, C2D_2_OUT);
    const S_C1D1 = sizeConv1d(CARD_C, C1D_1_OUT);
    const S_C1D2 = sizeConv1d(C1D_1_OUT, C1D_2_OUT);
    const S_FC1  = sizeFC(MERGE_SIZE, FC1_OUT);
    const S_FC2  = sizeFC(FC1_OUT, 1);

    const OFF_C2D1 = 0;
    const OFF_C2D2 = OFF_C2D1 + S_C2D1;
    const OFF_C1D1 = OFF_C2D2 + S_C2D2;
    const OFF_C1D2 = OFF_C1D1 + S_C1D1;
    const OFF_FC1  = OFF_C1D2 + S_C1D2;
    const OFF_FC2  = OFF_FC1 + S_FC1;
    const PARAM_COUNT = OFF_FC2 + S_FC2;

    const CARD_VALUES = {
        'A': 14, 'K': 13, 'Q': 12, 'J': 11,
        '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
    };
    const CARD_RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

    let params = null;
    let metadata = { leafScale: 420, leafBlend: 0.85 };

    const getCardValue = (card) => CARD_VALUES[card?.rank] ?? 0;
    const otherPlayer = (player) => player === 'red' ? 'black' : 'red';

    // ====== Encoding (matches training/td/encode.mjs) ======

    const encodeState = (game, perspective) => {
        const out = new Float32Array(INPUT_SIZE);
        const opponent = otherPlayer(perspective);
        let offset = 0;

        // Board: 25 cells × 2 = 50
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cell = game.board[r][c];
                const base = offset + (r * BOARD_SIZE + c) * 2;
                if (cell) {
                    out[base + 0] = (getCardValue(cell.card) - 2) / 12;
                    out[base + 1] = cell.owner === perspective ? 1 : cell.owner === opponent ? -1 : 0;
                }
            }
        }
        offset += 50;

        // Cards: 3 × 13 = 39
        const oppKnown = {};
        const ownKnown = {};
        const ownDiscardCounts = {};
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                let cell = game.board[r][c];
                while (cell) {
                    const bucket = cell.owner === opponent ? oppKnown : ownKnown;
                    bucket[cell.card.rank] = (bucket[cell.card.rank] || 0) + 1;
                    cell = cell.coveredCell;
                }
            }
        }
        const ownDiscard = game[`${perspective}Discard`] ?? [];
        for (const card of ownDiscard) {
            if (card) {
                ownKnown[card.rank] = (ownKnown[card.rank] || 0) + 1;
                ownDiscardCounts[card.rank] = (ownDiscardCounts[card.rank] || 0) + 1;
            }
        }
        const hand = game[`${perspective}Hand`];
        for (const card of hand) {
            if (card) ownKnown[card.rank] = (ownKnown[card.rank] || 0) + 1;
        }
        for (let i = 0; i < CARD_RANKS.length; i++) {
            out[offset + i] = Math.max(0, 2 - (oppKnown[CARD_RANKS[i]] || 0)) / 2;
        }
        offset += 13;
        for (let i = 0; i < CARD_RANKS.length; i++) {
            out[offset + i] = Math.max(0, 2 - (ownKnown[CARD_RANKS[i]] || 0)) / 2;
        }
        offset += 13;
        for (let i = 0; i < CARD_RANKS.length; i++) {
            out[offset + i] = (ownDiscardCounts[CARD_RANKS[i]] || 0) / 2;
        }
        offset += 13;

        // Hand: 3 values
        for (let i = 0; i < 3; i++) {
            out[offset + i] = hand[i] ? (getCardValue(hand[i]) - 2) / 12 : 0;
        }
        offset += 3;

        // Context: 6 values (non-derivable only)
        const oppState = game.getPlayerState(opponent);
        const selfMetrics = game.getBoardMetrics(perspective);
        const oppMetrics = game.getBoardMetrics(opponent);

        out[offset + 0] = oppState.discard.length / 23;
        out[offset + 1] = selfMetrics.connected.size / 25;
        out[offset + 2] = oppMetrics.connected.size / 25;
        out[offset + 3] = Math.min(game.countLegalMoves(perspective), 50) / 50;
        out[offset + 4] = Math.min(game.turnCount ?? 0, 60) / 60;
        out[offset + 5] = game.openingMoveComplete ? 1 : 0;

        return out;
    };

    // ====== Conv2d forward: [Ci,H,W] → [Co,H,W] with ReLU ======

    const conv2dFwd = (blockOff, ci, co, h, w, input) => {
        const bOff = blockOff + co * ci * K * K;
        const output = new Float32Array(co * h * w);
        for (let oc = 0; oc < co; oc++) {
            for (let oh = 0; oh < h; oh++) {
                for (let ow = 0; ow < w; ow++) {
                    let sum = params[bOff + oc];
                    for (let ic = 0; ic < ci; ic++) {
                        for (let kh = 0; kh < K; kh++) {
                            for (let kw = 0; kw < K; kw++) {
                                const ih = oh + kh - PAD;
                                const iw = ow + kw - PAD;
                                if (ih >= 0 && ih < h && iw >= 0 && iw < w) {
                                    sum += params[blockOff + ((oc * ci + ic) * K + kh) * K + kw] *
                                           input[(ic * h + ih) * w + iw];
                                }
                            }
                        }
                    }
                    output[(oc * h + oh) * w + ow] = sum > 0 ? sum : 0;
                }
            }
        }
        return output;
    };

    // ====== Conv1d forward: [Ci,W] → [Co,W] with ReLU ======

    const conv1dFwd = (blockOff, ci, co, w, input) => {
        const bOff = blockOff + co * ci * K;
        const output = new Float32Array(co * w);
        for (let oc = 0; oc < co; oc++) {
            for (let ow = 0; ow < w; ow++) {
                let sum = params[bOff + oc];
                for (let ic = 0; ic < ci; ic++) {
                    for (let kw = 0; kw < K; kw++) {
                        const iw = ow + kw - PAD;
                        if (iw >= 0 && iw < w) {
                            sum += params[blockOff + (oc * ci + ic) * K + kw] * input[ic * w + iw];
                        }
                    }
                }
                output[oc * w + ow] = sum > 0 ? sum : 0;
            }
        }
        return output;
    };

    // ====== Global average pool ======

    const gap = (input, co, n) => {
        const out = new Float32Array(co);
        for (let c = 0; c < co; c++) {
            let sum = 0;
            const base = c * n;
            for (let i = 0; i < n; i++) sum += input[base + i];
            out[c] = sum / n;
        }
        return out;
    };

    // ====== Full forward pass ======

    const forward = (input) => {
        const H = BOARD_SIZE, W = BOARD_SIZE;

        // Reshape board: flat 50 → [2, 5, 5] CHW
        const boardCHW = new Float32Array(BOARD_C * H * W);
        for (let ch = 0; ch < BOARD_C; ch++) {
            for (let r = 0; r < H; r++) {
                for (let c = 0; c < W; c++) {
                    boardCHW[(ch * H + r) * W + c] = input[(r * W + c) * BOARD_C + ch];
                }
            }
        }

        // Board branch
        const c2d1 = conv2dFwd(OFF_C2D1, BOARD_C, C2D_1_OUT, H, W, boardCHW);
        const c2d2 = conv2dFwd(OFF_C2D2, C2D_1_OUT, C2D_2_OUT, H, W, c2d1);
        const boardPool = gap(c2d2, C2D_2_OUT, H * W);

        // Card branch
        const cardInput = input.subarray(CARDS_OFF, CARDS_OFF + CARD_C * CARD_W); // 50..89
        const c1d1 = conv1dFwd(OFF_C1D1, CARD_C, C1D_1_OUT, CARD_W, cardInput);
        const c1d2 = conv1dFwd(OFF_C1D2, C1D_1_OUT, C1D_2_OUT, CARD_W, c1d1);
        const cardPool = gap(c1d2, C1D_2_OUT, CARD_W);

        // Scalar branches
        const handInput = input.subarray(HAND_OFF, HAND_OFF + HAND_LEN);
        const ctxInput = input.subarray(CTX_OFF, CTX_OFF + CTX_LEN);

        // Merge
        const merged = new Float32Array(MERGE_SIZE);
        merged.set(boardPool, 0);
        merged.set(cardPool, SPATIAL_OUT);
        merged.set(handInput, SPATIAL_OUT + CARD_OUT);
        merged.set(ctxInput, SPATIAL_OUT + CARD_OUT + HAND_LEN);

        // FC1: merge → 64, ReLU
        const fc1w = OFF_FC1;
        const fc1b = OFF_FC1 + MERGE_SIZE * FC1_OUT;
        const a1 = new Float32Array(FC1_OUT);
        for (let i = 0; i < FC1_OUT; i++) {
            let sum = params[fc1b + i];
            const row = fc1w + i * MERGE_SIZE;
            for (let j = 0; j < MERGE_SIZE; j++) sum += params[row + j] * merged[j];
            a1[i] = sum > 0 ? sum : 0;
        }

        // FC2: 64 → 1, tanh
        const fc2w = OFF_FC2;
        const fc2b = OFF_FC2 + FC1_OUT;
        let pre = params[fc2b];
        for (let j = 0; j < FC1_OUT; j++) pre += params[fc2w + j] * a1[j];
        return Math.tanh(pre);
    };

    // ====== Public API ======

    const readStoredMode = () => {
        try {
            return window.localStorage?.getItem('flood-bot-mode') ?? 'heuristic';
        } catch (error) {
            return 'heuristic';
        }
    };

    window.FloodCompact = {
        isReady() {
            return params !== null;
        },
        getLeafBlend() {
            return metadata.leafBlend ?? 0.85;
        },
        async loadModel(url = '/flood-compact-model.json') {
            try {
                const response = await fetch(url, { cache: 'no-store' });
                if (!response.ok) {
                    console.log('[FloodCompact] No compact model file — using heuristic leaf only');
                    return false;
                }
                const payload = await response.json();
                if (payload.inputSize !== INPUT_SIZE || payload.paramCount !== PARAM_COUNT) {
                    console.warn('[FloodCompact] Incompatible compact model', payload.inputSize, payload.paramCount);
                    return false;
                }
                params = new Float32Array(payload.params);
                metadata = { ...metadata, ...(payload.metadata ?? {}) };
                console.log(`[FloodCompact] Loaded CNN compact model, ${payload.paramCount} params`);
                return true;
            } catch (error) {
                console.log('[FloodCompact] Failed to load compact model:', error.message);
                return false;
            }
        },
        evaluateState(game, player) {
            if (!params || !game) return null;
            return forward(encodeState(game, player)) * (metadata.leafScale ?? 420);
        }
    };

    if (readStoredMode() === 'compact') {
        window.FloodCompact.loadModel();
    }
})();
