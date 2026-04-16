// training/td/cnn-network.mjs
// Multi-branch CNN value network for the compact bot.
//
// Architecture:
//   Board branch:  Conv2d(2→16, 3×3, pad=1) + ReLU → Conv2d(16→32, 3×3, pad=1) + ReLU → GAP → 32
//   Card branch:   Conv1d(3→16, 3, pad=1) + ReLU → Conv1d(16→16, 3, pad=1) + ReLU → GAP → 16
//   Context:       12 values passthrough
//   Merge:         concat(32, 16, 12) = 60 → FC(60→64, ReLU) → FC(64→1, tanh)
//
// Input: 101-element flat vector from encode.mjs
//   [0..49]    board  2×5×5 (channels: rank, ownership ±1)
//   [50..88]   cards  3×13  (channels: hand_dist, opp_unseen, own_unseen)
//   [89..100]  context 12 scalar features

import {
    INPUT_SIZE, BOARD_OFFSET, BOARD_LEN, BOARD_CHANNELS,
    CARDS_OFFSET, CARDS_LEN, CARDS_CHANNELS,
    HAND_OFFSET, HAND_LEN, CONTEXT_OFFSET, CONTEXT_LEN
} from './encode.mjs';

// ====== Architecture constants ======

const BOARD_C = BOARD_CHANNELS, BOARD_H = 5, BOARD_W = 5;
const CARD_C = CARDS_CHANNELS, CARD_W = 13;
const K = 3, PAD = 1;

// Conv2d layers (board)
const C2D_1_IN = BOARD_C, C2D_1_OUT = 16;
const C2D_2_IN = C2D_1_OUT, C2D_2_OUT = 32;

// Conv1d layers (cards)
const C1D_1_IN = CARD_C, C1D_1_OUT = 16;
const C1D_2_IN = C1D_1_OUT, C1D_2_OUT = 16;

// FC layers
const SPATIAL_OUT = C2D_2_OUT;            // 32 after GAP
const CARD_OUT = C1D_2_OUT;               // 16 after GAP
const MERGE_SIZE = SPATIAL_OUT + CARD_OUT + HAND_LEN + CONTEXT_LEN; // 63
const FC1_OUT = 64;

// ====== Parameter layout ======

const sizeConv2d = (ci, co) => co * ci * K * K + co;
const sizeConv1d = (ci, co) => co * ci * K + co;
const sizeFC = (inp, out) => inp * out + out;

const S_C2D1 = sizeConv2d(C2D_1_IN, C2D_1_OUT);   // 448
const S_C2D2 = sizeConv2d(C2D_2_IN, C2D_2_OUT);   // 4640
const S_C1D1 = sizeConv1d(C1D_1_IN, C1D_1_OUT);   // 160
const S_C1D2 = sizeConv1d(C1D_2_IN, C1D_2_OUT);   // 784
const S_FC1  = sizeFC(MERGE_SIZE, FC1_OUT);          // 3904
const S_FC2  = sizeFC(FC1_OUT, 1);                   // 65

const OFF_C2D1 = 0;
const OFF_C2D2 = OFF_C2D1 + S_C2D1;
const OFF_C1D1 = OFF_C2D2 + S_C2D2;
const OFF_C1D2 = OFF_C1D1 + S_C1D1;
const OFF_FC1  = OFF_C1D2 + S_C1D2;
const OFF_FC2  = OFF_FC1 + S_FC1;

export const PARAM_COUNT = OFF_FC2 + S_FC2;  // ~10001

// Kernel offset within a conv block: weights then bias
const kernelOff = (blockOff) => blockOff;
const biasOff2d = (blockOff, ci, co) => blockOff + co * ci * K * K;
const biasOff1d = (blockOff, ci, co) => blockOff + co * ci * K;
const fcWeightOff = (blockOff) => blockOff;
const fcBiasOff = (blockOff, inp, out) => blockOff + inp * out;

// ====== Initialization (Kaiming uniform) ======

export const createParams = (seed = null) => {
    const params = new Float32Array(PARAM_COUNT);
    let state = seed != null ? (Math.abs(seed) | 1) : ((Math.random() * 2147483647) | 1);
    const rng = () => {
        state = Math.imul(state ^ (state >>> 15), 1 | state);
        state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
        return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = () => {
        let u = 0, v = 0;
        while (u === 0) u = rng();
        while (v === 0) v = rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    const initConv2d = (off, ci, co) => {
        const fanIn = ci * K * K;
        const s = Math.sqrt(2 / fanIn);
        const nw = co * ci * K * K;
        for (let i = 0; i < nw; i++) params[off + i] = gauss() * s;
        // bias: zero
    };
    const initConv1d = (off, ci, co) => {
        const fanIn = ci * K;
        const s = Math.sqrt(2 / fanIn);
        const nw = co * ci * K;
        for (let i = 0; i < nw; i++) params[off + i] = gauss() * s;
    };
    const initFC = (off, inp, out) => {
        const s = Math.sqrt(2 / inp);
        const nw = inp * out;
        for (let i = 0; i < nw; i++) params[off + i] = gauss() * s;
        // bias: zero
    };

    initConv2d(OFF_C2D1, C2D_1_IN, C2D_1_OUT);
    initConv2d(OFF_C2D2, C2D_2_IN, C2D_2_OUT);
    initConv1d(OFF_C1D1, C1D_1_IN, C1D_1_OUT);
    initConv1d(OFF_C1D2, C1D_2_IN, C1D_2_OUT);
    initFC(OFF_FC1, MERGE_SIZE, FC1_OUT);
    // FC2 (output layer): zero-init like original (tanh(0)=0)
    return params;
};

// ====== Conv2d forward: [Ci,H,W] → [Co,H,W] with ReLU ======

const conv2dForward = (params, blockOff, ci, co, h, w, input) => {
    const kOff = kernelOff(blockOff);
    const bOff = biasOff2d(blockOff, ci, co);
    const preAct = new Float32Array(co * h * w);
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
                                const wi = ((oc * ci + ic) * K + kh) * K + kw;
                                sum += params[kOff + wi] * input[(ic * h + ih) * w + iw];
                            }
                        }
                    }
                }
                const idx = (oc * h + oh) * w + ow;
                preAct[idx] = sum;
                output[idx] = sum > 0 ? sum : 0; // ReLU
            }
        }
    }
    return { preAct, output };
};

// ====== Conv1d forward: [Ci,W] → [Co,W] with ReLU ======

const conv1dForward = (params, blockOff, ci, co, w, input) => {
    const kOff = kernelOff(blockOff);
    const bOff = biasOff1d(blockOff, ci, co);
    const preAct = new Float32Array(co * w);
    const output = new Float32Array(co * w);
    for (let oc = 0; oc < co; oc++) {
        for (let ow = 0; ow < w; ow++) {
            let sum = params[bOff + oc];
            for (let ic = 0; ic < ci; ic++) {
                for (let kw = 0; kw < K; kw++) {
                    const iw = ow + kw - PAD;
                    if (iw >= 0 && iw < w) {
                        const wi = (oc * ci + ic) * K + kw;
                        sum += params[kOff + wi] * input[ic * w + iw];
                    }
                }
            }
            const idx = oc * w + ow;
            preAct[idx] = sum;
            output[idx] = sum > 0 ? sum : 0;
        }
    }
    return { preAct, output };
};

// ====== Global average pool ======

const globalAvgPool2d = (input, co, h, w) => {
    const out = new Float32Array(co);
    const n = h * w;
    for (let c = 0; c < co; c++) {
        let sum = 0;
        const base = c * n;
        for (let i = 0; i < n; i++) sum += input[base + i];
        out[c] = sum / n;
    }
    return out;
};

const globalAvgPool1d = (input, co, w) => {
    const out = new Float32Array(co);
    for (let c = 0; c < co; c++) {
        let sum = 0;
        const base = c * w;
        for (let i = 0; i < w; i++) sum += input[base + i];
        out[c] = sum / w;
    }
    return out;
};

// ====== Full forward pass ======

export const forward = (params, input) => {
    // --- Slice input ---
    const boardInput = input.subarray(BOARD_OFFSET, BOARD_OFFSET + BOARD_LEN);
    const cardInput = input.subarray(CARDS_OFFSET, CARDS_OFFSET + CARDS_LEN);
    const handInput = input.subarray(HAND_OFFSET, HAND_OFFSET + HAND_LEN);
    const contextInput = input.subarray(CONTEXT_OFFSET, CONTEXT_OFFSET + CONTEXT_LEN);

    // --- Reshape board: flat 50 → [2, 5, 5] ---
    // encode.mjs stores as: for each (r,c): [rank, ownership]
    // We need CHW: channel-first. Channel ch, row r, col c = boardInput[(r*5+c)*2 + ch]
    const boardCHW = new Float32Array(BOARD_C * BOARD_H * BOARD_W);
    for (let ch = 0; ch < BOARD_C; ch++) {
        for (let r = 0; r < BOARD_H; r++) {
            for (let c = 0; c < BOARD_W; c++) {
                boardCHW[(ch * BOARD_H + r) * BOARD_W + c] = boardInput[(r * BOARD_W + c) * BOARD_C + ch];
            }
        }
    }

    // --- Board branch ---
    const c2d1 = conv2dForward(params, OFF_C2D1, C2D_1_IN, C2D_1_OUT, BOARD_H, BOARD_W, boardCHW);
    const c2d2 = conv2dForward(params, OFF_C2D2, C2D_2_IN, C2D_2_OUT, BOARD_H, BOARD_W, c2d1.output);
    const boardPool = globalAvgPool2d(c2d2.output, C2D_2_OUT, BOARD_H, BOARD_W);

    // --- Reshape cards: flat 39 → [3, 13] ---
    // Already in channel-first layout: [hand_13, opp_13, own_13]
    const cardCW = cardInput; // no reshape needed

    // --- Card branch ---
    const c1d1 = conv1dForward(params, OFF_C1D1, C1D_1_IN, C1D_1_OUT, CARD_W, cardCW);
    const c1d2 = conv1dForward(params, OFF_C1D2, C1D_2_IN, C1D_2_OUT, CARD_W, c1d1.output);
    const cardPool = globalAvgPool1d(c1d2.output, C1D_2_OUT, CARD_W);

    // --- Merge ---
    const merged = new Float32Array(MERGE_SIZE);
    merged.set(boardPool, 0);
    merged.set(cardPool, SPATIAL_OUT);
    merged.set(handInput, SPATIAL_OUT + CARD_OUT);
    merged.set(contextInput, SPATIAL_OUT + CARD_OUT + HAND_LEN);

    // --- FC1: merged → 64, ReLU ---
    const fc1w = fcWeightOff(OFF_FC1);
    const fc1b = fcBiasOff(OFF_FC1, MERGE_SIZE, FC1_OUT);
    const z1 = new Float32Array(FC1_OUT);
    const a1 = new Float32Array(FC1_OUT);
    for (let i = 0; i < FC1_OUT; i++) {
        let sum = params[fc1b + i];
        const row = fc1w + i * MERGE_SIZE;
        for (let j = 0; j < MERGE_SIZE; j++) sum += params[row + j] * merged[j];
        z1[i] = sum;
        a1[i] = sum > 0 ? sum : 0;
    }

    // --- FC2: 64 → 1, tanh ---
    const fc2w = fcWeightOff(OFF_FC2);
    const fc2b = fcBiasOff(OFF_FC2, FC1_OUT, 1);
    let pre = params[fc2b];
    for (let j = 0; j < FC1_OUT; j++) pre += params[fc2w + j] * a1[j];
    const value = Math.tanh(pre);

    return {
        value,
        // Cache for backward pass
        _boardCHW: boardCHW,
        _c2d1: c2d1, _c2d2: c2d2, _boardPool: boardPool,
        _cardCW: cardCW,
        _c1d1: c1d1, _c1d2: c1d2, _cardPool: cardPool,
        _contextInput: contextInput,
        _merged: merged, _z1: z1, _a1: a1, _pre: pre
    };
};

// ====== Conv2d backward ======

const conv2dBackward = (params, grad, blockOff, ci, co, h, w, input, preAct, dOutput) => {
    const kOff = kernelOff(blockOff);
    const bOff = biasOff2d(blockOff, ci, co);
    const dInput = new Float32Array(ci * h * w);

    // Apply ReLU mask to dOutput
    const dAct = new Float32Array(dOutput.length);
    for (let i = 0; i < dAct.length; i++) {
        dAct[i] = preAct[i] > 0 ? dOutput[i] : 0;
    }

    for (let oc = 0; oc < co; oc++) {
        for (let oh = 0; oh < h; oh++) {
            for (let ow = 0; ow < w; ow++) {
                const dVal = dAct[(oc * h + oh) * w + ow];
                if (dVal === 0) continue;
                // dBias
                grad[bOff + oc] += dVal;
                // dKernel and dInput
                for (let ic = 0; ic < ci; ic++) {
                    for (let kh = 0; kh < K; kh++) {
                        for (let kw = 0; kw < K; kw++) {
                            const ih = oh + kh - PAD;
                            const iw = ow + kw - PAD;
                            if (ih >= 0 && ih < h && iw >= 0 && iw < w) {
                                const wi = ((oc * ci + ic) * K + kh) * K + kw;
                                const ii = (ic * h + ih) * w + iw;
                                grad[kOff + wi] += dVal * input[ii];
                                dInput[ii] += dVal * params[kOff + wi];
                            }
                        }
                    }
                }
            }
        }
    }
    return dInput;
};

// ====== Conv1d backward ======

const conv1dBackward = (params, grad, blockOff, ci, co, w, input, preAct, dOutput) => {
    const kOff = kernelOff(blockOff);
    const bOff = biasOff1d(blockOff, ci, co);
    const dInput = new Float32Array(ci * w);

    const dAct = new Float32Array(dOutput.length);
    for (let i = 0; i < dAct.length; i++) {
        dAct[i] = preAct[i] > 0 ? dOutput[i] : 0;
    }

    for (let oc = 0; oc < co; oc++) {
        for (let ow = 0; ow < w; ow++) {
            const dVal = dAct[oc * w + ow];
            if (dVal === 0) continue;
            grad[bOff + oc] += dVal;
            for (let ic = 0; ic < ci; ic++) {
                for (let kw = 0; kw < K; kw++) {
                    const iw = ow + kw - PAD;
                    if (iw >= 0 && iw < w) {
                        const wi = (oc * ci + ic) * K + kw;
                        const ii = ic * w + iw;
                        grad[kOff + wi] += dVal * input[ii];
                        dInput[ii] += dVal * params[kOff + wi];
                    }
                }
            }
        }
    }
    return dInput;
};

// ====== Full backward: accumulates loss-scaled gradients into grads array ======

export const backwardValue = (params, grads, input, targetValue, {
    loss = 'huber',
    huberDelta = 0.75
} = {}) => {
    const fwd = forward(params, input);
    const { value, _boardCHW, _c2d1, _c2d2, _boardPool,
            _cardCW, _c1d1, _c1d2, _cardPool,
            _merged, _z1, _a1, _pre } = fwd;

    // Loss
    const error = value - targetValue;
    const absError = Math.abs(error);
    let lossValue, scale;
    if (loss === 'mse') {
        lossValue = 0.5 * error * error;
        scale = error;
    } else {
        if (absError <= huberDelta) {
            lossValue = 0.5 * error * error;
            scale = error;
        } else {
            lossValue = huberDelta * (absError - 0.5 * huberDelta);
            scale = huberDelta * Math.sign(error);
        }
    }

    // dL/dValue * dValue/dPre = scale * (1 - value^2)
    const dPre = scale * (1 - value * value);

    // --- FC2 backward ---
    const fc2w = fcWeightOff(OFF_FC2);
    const fc2b = fcBiasOff(OFF_FC2, FC1_OUT, 1);
    grads[fc2b] += dPre;
    const dA1 = new Float32Array(FC1_OUT);
    for (let j = 0; j < FC1_OUT; j++) {
        grads[fc2w + j] += dPre * _a1[j];
        dA1[j] = _a1[j] > 0 ? dPre * params[fc2w + j] : 0;
    }

    // --- FC1 backward ---
    const fc1w = fcWeightOff(OFF_FC1);
    const fc1b = fcBiasOff(OFF_FC1, MERGE_SIZE, FC1_OUT);
    const dMerged = new Float32Array(MERGE_SIZE);
    for (let i = 0; i < FC1_OUT; i++) {
        if (dA1[i] === 0) continue;
        grads[fc1b + i] += dA1[i];
        const row = fc1w + i * MERGE_SIZE;
        for (let j = 0; j < MERGE_SIZE; j++) {
            grads[row + j] += dA1[i] * _merged[j];
            dMerged[j] += dA1[i] * params[row + j];
        }
    }

    // --- Split merged gradient ---
    const dBoardPool = dMerged.subarray(0, SPATIAL_OUT);
    const dCardPool = dMerged.subarray(SPATIAL_OUT, SPATIAL_OUT + CARD_OUT);
    // Context gradients: no learnable params, skip

    // --- Board GAP backward ---
    const n2d = BOARD_H * BOARD_W;
    const dC2d2Out = new Float32Array(C2D_2_OUT * n2d);
    for (let c = 0; c < C2D_2_OUT; c++) {
        const val = dBoardPool[c] / n2d;
        const base = c * n2d;
        for (let i = 0; i < n2d; i++) dC2d2Out[base + i] = val;
    }

    // --- Board conv2 backward ---
    const dC2d1Out = conv2dBackward(params, grads, OFF_C2D2, C2D_2_IN, C2D_2_OUT,
        BOARD_H, BOARD_W, _c2d1.output, _c2d2.preAct, dC2d2Out);

    // --- Board conv1 backward ---
    conv2dBackward(params, grads, OFF_C2D1, C2D_1_IN, C2D_1_OUT,
        BOARD_H, BOARD_W, _boardCHW, _c2d1.preAct, dC2d1Out);

    // --- Card GAP backward ---
    const dC1d2Out = new Float32Array(C1D_2_OUT * CARD_W);
    for (let c = 0; c < C1D_2_OUT; c++) {
        const val = dCardPool[c] / CARD_W;
        const base = c * CARD_W;
        for (let i = 0; i < CARD_W; i++) dC1d2Out[base + i] = val;
    }

    // --- Card conv2 backward ---
    const dC1d1Out = conv1dBackward(params, grads, OFF_C1D2, C1D_2_IN, C1D_2_OUT,
        CARD_W, _c1d1.output, _c1d2.preAct, dC1d2Out);

    // --- Card conv1 backward ---
    conv1dBackward(params, grads, OFF_C1D1, C1D_1_IN, C1D_1_OUT,
        CARD_W, _cardCW, _c1d1.preAct, dC1d1Out);

    return { value, error, loss: lossValue };
};

// ====== Adam optimizer (same interface as network.mjs) ======

export const createAdamState = () => ({
    m: new Float32Array(PARAM_COUNT),
    v: new Float32Array(PARAM_COUNT),
    step: 0
});

export const adamStep = (params, grads, lr, state, {
    beta1 = 0.9,
    beta2 = 0.999,
    eps = 1e-8,
    gradClip = 1.0,
    weightDecay = 0
} = {}) => {
    let sqSum = 0;
    for (let i = 0; i < PARAM_COUNT; i++) sqSum += grads[i] * grads[i];
    const norm = Math.sqrt(sqSum);
    const clipScale = norm > gradClip ? gradClip / norm : 1;

    state.step += 1;
    const biasCorr1 = 1 - Math.pow(beta1, state.step);
    const biasCorr2 = 1 - Math.pow(beta2, state.step);
    const { m, v } = state;

    for (let i = 0; i < PARAM_COUNT; i++) {
        const g = grads[i] * clipScale;
        m[i] = beta1 * m[i] + (1 - beta1) * g;
        v[i] = beta2 * v[i] + (1 - beta2) * g * g;
        const mHat = m[i] / biasCorr1;
        const vHat = v[i] / biasCorr2;
        params[i] -= lr * (mHat / (Math.sqrt(vHat) + eps) + weightDecay * params[i]);
        grads[i] = 0;
    }
    return { gradNorm: norm };
};

// ====== Serialize / Deserialize ======

export const serializeParams = (params) => ({
    version: 4,
    type: 'cnn-value',
    architecture: 'conv2d(2→16→32)+conv1d(3→16→16)+fc(60→64→1)',
    inputSize: INPUT_SIZE,
    paramCount: PARAM_COUNT,
    params: Array.from(params)
});

export const deserializeParams = (obj) => {
    if (!obj || obj.paramCount !== PARAM_COUNT) {
        throw new Error(`Incompatible checkpoint: expected ${PARAM_COUNT} params, got ${obj?.paramCount}`);
    }
    return new Float32Array(obj.params);
};
