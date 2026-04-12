// training/net/mlp.mjs
// Tiny 2-layer MLP with two heads (policy + value).
// Hand-rolled backprop on Float32Array, no external deps.
// Layers: input (INPUT) → hidden (H1) → hidden (H2) → {policy (POLICY), value (1)}
// Activations: ReLU on hidden layers, tanh on value output, softmax on policy logits.
//
// All weights are stored contiguously in a single Float32Array so we can
// broadcast to workers via SharedArrayBuffer with zero copies.

import { INPUT_SIZE, ACTION_SIZE } from '../engine/encoding.mjs';

export const H1 = 64;
export const H2 = 64;

// Parameter offsets / sizes
//   W1 [H1 × INPUT], b1 [H1]
//   W2 [H2 × H1],    b2 [H2]
//   Wp [POLICY × H2], bp [POLICY]
//   Wv [1 × H2],     bv [1]
const SIZE_W1 = H1 * INPUT_SIZE;
const SIZE_B1 = H1;
const SIZE_W2 = H2 * H1;
const SIZE_B2 = H2;
const SIZE_WP = ACTION_SIZE * H2;
const SIZE_BP = ACTION_SIZE;
const SIZE_WV = 1 * H2;
const SIZE_BV = 1;

const OFF_W1 = 0;
const OFF_B1 = OFF_W1 + SIZE_W1;
const OFF_W2 = OFF_B1 + SIZE_B1;
const OFF_B2 = OFF_W2 + SIZE_W2;
const OFF_WP = OFF_B2 + SIZE_B2;
const OFF_BP = OFF_WP + SIZE_WP;
const OFF_WV = OFF_BP + SIZE_BP;
const OFF_BV = OFF_WV + SIZE_WV;

export const PARAM_COUNT = OFF_BV + SIZE_BV;

// ====== Initialization (Kaiming for ReLU layers, small for heads) ======

/** Create a freshly initialized parameter vector. */
export const createParams = (seed = null) => {
    const params = new Float32Array(PARAM_COUNT);
    // Use a seeded LCG so runs are reproducible
    let state = seed != null ? (Math.abs(seed) | 1) : ((Math.random() * 2147483647) | 1);
    const rng = () => {
        state = Math.imul(state ^ (state >>> 15), 1 | state);
        state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
        return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = () => {
        // Box-Muller
        let u = 0, v = 0;
        while (u === 0) u = rng();
        while (v === 0) v = rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    // W1: Kaiming sqrt(2/INPUT)
    const s1 = Math.sqrt(2 / INPUT_SIZE);
    for (let i = 0; i < SIZE_W1; i++) params[OFF_W1 + i] = gauss() * s1;
    // W2: Kaiming sqrt(2/H1)
    const s2 = Math.sqrt(2 / H1);
    for (let i = 0; i < SIZE_W2; i++) params[OFF_W2 + i] = gauss() * s2;
    // Wp: ZERO-initialized so pre-training priors are exactly uniform.
    // (AlphaZero cold-start: without this, the fixed random weights give a
    // consistent bad-move preference, causing argmax-policy play to lose
    // systematically. Zero init → uniform softmax → MCTS explores via UCT only.)
    // Bp already zero.
    // Wv: ZERO so untrained value = tanh(0) = 0 for every state.
    // Biases already zero.
    return params;
};

// ====== Forward pass ======

const relu = (x) => x > 0 ? x : 0;

/** Run a forward pass. Returns { h1, h2, policyLogits, value } along with
 *  intermediate activations needed for backprop. Buffers can be preallocated
 *  in `scratch` for speed. */
export const forward = (params, input, scratch = null) => {
    const h1 = scratch?.h1 ?? new Float32Array(H1);
    const h2 = scratch?.h2 ?? new Float32Array(H2);
    const policyLogits = scratch?.policyLogits ?? new Float32Array(ACTION_SIZE);

    // h1 = relu(W1 @ input + b1)
    for (let i = 0; i < H1; i++) {
        let sum = params[OFF_B1 + i];
        const rowOffset = OFF_W1 + i * INPUT_SIZE;
        for (let j = 0; j < INPUT_SIZE; j++) {
            sum += params[rowOffset + j] * input[j];
        }
        h1[i] = relu(sum);
    }
    // h2 = relu(W2 @ h1 + b2)
    for (let i = 0; i < H2; i++) {
        let sum = params[OFF_B2 + i];
        const rowOffset = OFF_W2 + i * H1;
        for (let j = 0; j < H1; j++) {
            sum += params[rowOffset + j] * h1[j];
        }
        h2[i] = relu(sum);
    }
    // Policy logits = Wp @ h2 + bp
    for (let i = 0; i < ACTION_SIZE; i++) {
        let sum = params[OFF_BP + i];
        const rowOffset = OFF_WP + i * H2;
        for (let j = 0; j < H2; j++) {
            sum += params[rowOffset + j] * h2[j];
        }
        policyLogits[i] = sum;
    }
    // Value = tanh(Wv @ h2 + bv)
    let vSum = params[OFF_BV];
    for (let j = 0; j < H2; j++) {
        vSum += params[OFF_WV + j] * h2[j];
    }
    const value = Math.tanh(vSum);

    return { h1, h2, policyLogits, value, preValue: vSum };
};

/** Softmax with action mask. Illegal actions get -Infinity before softmax.
 *  Returns a freshly allocated Float32Array of probabilities. */
export const maskedSoftmax = (logits, mask) => {
    const out = new Float32Array(ACTION_SIZE);
    let maxLogit = -Infinity;
    for (let i = 0; i < ACTION_SIZE; i++) {
        if (mask[i] > 0 && logits[i] > maxLogit) maxLogit = logits[i];
    }
    if (maxLogit === -Infinity) return out; // no legal actions
    let sum = 0;
    for (let i = 0; i < ACTION_SIZE; i++) {
        if (mask[i] > 0) {
            out[i] = Math.exp(logits[i] - maxLogit);
            sum += out[i];
        }
    }
    if (sum > 0) {
        for (let i = 0; i < ACTION_SIZE; i++) out[i] /= sum;
    }
    return out;
};

// ====== Backward pass (accumulates gradients into `grads` buffer) ======

/** Compute loss and accumulate gradients for a single training example.
 *  Inputs:
 *    input        — Float32Array(INPUT_SIZE)
 *    targetPolicy — Float32Array(ACTION_SIZE)  (MCTS visit distribution, sums to 1 over legal)
 *    targetValue  — Number in [-1, 1]
 *    mask         — Float32Array(ACTION_SIZE)
 *    valueCoeff   — scalar weight on the MSE value loss (default 1.5 so value head
 *                   gets ~30-40% of the total gradient signal instead of ~10%)
 *  Loss = CE(policy, target) + 0.5 * valueCoeff * (value - target)^2 + γ * entropy_bonus.
 *
 *  Returns { policyLoss, valueLoss, entropyBonus }. */
export const backward = (params, grads, input, targetPolicy, targetValue, mask, entropyCoeff = 0.01, valueCoeff = 1.5) => {
    const { h1, h2, policyLogits, value, preValue } = forward(params, input);
    const policyProb = maskedSoftmax(policyLogits, mask);

    // Policy cross-entropy loss
    let policyLoss = 0;
    for (let i = 0; i < ACTION_SIZE; i++) {
        if (targetPolicy[i] > 0 && policyProb[i] > 1e-12) {
            policyLoss -= targetPolicy[i] * Math.log(policyProb[i]);
        }
    }

    // Entropy bonus (maximize entropy of policyProb → minimize negative entropy)
    let entropy = 0;
    for (let i = 0; i < ACTION_SIZE; i++) {
        if (policyProb[i] > 1e-12) {
            entropy -= policyProb[i] * Math.log(policyProb[i]);
        }
    }
    // Loss contribution: -entropyCoeff * entropy  (we want to maximize entropy)

    // Value MSE loss (scaled by valueCoeff to give the value head proportional
    // gradient signal — default 1.5× undoes the 10:1 policy/value magnitude ratio).
    const valueDiff = value - targetValue;
    const valueLoss = 0.5 * valueCoeff * valueDiff * valueDiff;

    // ---- Gradients ----

    // dL/dLogits = policyProb - targetPolicy (for masked logits; unmasked are 0)
    // Plus entropy bonus gradient:
    //   d/d logits_i (-H(p)) = p_i * (H(p) + log p_i)  (where H is Shannon entropy)
    // We want to maximize H, so subtract that term (pushing p toward uniform).
    const dLogits = new Float32Array(ACTION_SIZE);
    for (let i = 0; i < ACTION_SIZE; i++) {
        if (mask[i] > 0) {
            dLogits[i] = policyProb[i] - targetPolicy[i];
            if (policyProb[i] > 1e-12) {
                // Gradient of -entropyCoeff * (-sum p log p) wrt logits_i:
                //   = entropyCoeff * p_i * (log p_i + H)
                dLogits[i] += entropyCoeff * policyProb[i] * (Math.log(policyProb[i]) + entropy);
            }
        }
    }

    // dL/d(value_preTanh) = valueCoeff * (value - target) * (1 - tanh^2)
    //                    = valueCoeff * (value - target) * (1 - value^2)
    const dPreValue = valueCoeff * valueDiff * (1 - value * value);

    // dL/dh2 = Wp^T @ dLogits + Wv^T * dPreValue
    const dH2 = new Float32Array(H2);
    for (let j = 0; j < H2; j++) {
        let sum = 0;
        for (let i = 0; i < ACTION_SIZE; i++) {
            sum += params[OFF_WP + i * H2 + j] * dLogits[i];
        }
        sum += params[OFF_WV + j] * dPreValue;
        // Through ReLU: gradient is 0 where h2 was negative (but relu clamps ≤0 to 0,
        // and we only saved the post-activation; derivative of relu(x) is 1 iff x > 0).
        if (h2[j] > 0) dH2[j] = sum;
    }

    // dL/dh1 = W2^T @ dH2
    const dH1 = new Float32Array(H1);
    for (let j = 0; j < H1; j++) {
        let sum = 0;
        for (let i = 0; i < H2; i++) {
            sum += params[OFF_W2 + i * H1 + j] * dH2[i];
        }
        if (h1[j] > 0) dH1[j] = sum;
    }

    // ---- Accumulate gradients into `grads` ----

    // dWp, dbp
    for (let i = 0; i < ACTION_SIZE; i++) {
        if (dLogits[i] === 0) continue;
        grads[OFF_BP + i] += dLogits[i];
        const rowOffset = OFF_WP + i * H2;
        for (let j = 0; j < H2; j++) {
            grads[rowOffset + j] += dLogits[i] * h2[j];
        }
    }
    // dWv, dbv
    grads[OFF_BV] += dPreValue;
    for (let j = 0; j < H2; j++) {
        grads[OFF_WV + j] += dPreValue * h2[j];
    }
    // dW2, db2
    for (let i = 0; i < H2; i++) {
        if (dH2[i] === 0) continue;
        grads[OFF_B2 + i] += dH2[i];
        const rowOffset = OFF_W2 + i * H1;
        for (let j = 0; j < H1; j++) {
            grads[rowOffset + j] += dH2[i] * h1[j];
        }
    }
    // dW1, db1
    for (let i = 0; i < H1; i++) {
        if (dH1[i] === 0) continue;
        grads[OFF_B1 + i] += dH1[i];
        const rowOffset = OFF_W1 + i * INPUT_SIZE;
        for (let j = 0; j < INPUT_SIZE; j++) {
            grads[rowOffset + j] += dH1[i] * input[j];
        }
    }

    return { policyLoss, valueLoss, entropyBonus: entropyCoeff * entropy, totalLoss: policyLoss + valueLoss - entropyCoeff * entropy };
};

// ====== SGD update ======

/** In-place SGD update. Optional gradient clipping and weight decay. */
export const sgdStep = (params, grads, lr, { gradClip = 1.0, weightDecay = 0 } = {}) => {
    // Gradient norm for clipping
    let sqSum = 0;
    for (let i = 0; i < PARAM_COUNT; i++) sqSum += grads[i] * grads[i];
    const norm = Math.sqrt(sqSum);
    const scale = norm > gradClip ? gradClip / norm : 1;
    for (let i = 0; i < PARAM_COUNT; i++) {
        params[i] -= lr * (grads[i] * scale + weightDecay * params[i]);
        grads[i] = 0; // reset for next minibatch
    }
    return { gradNorm: norm };
};

// ====== Adam update ======
// Standard Adam with bias correction and global L2 gradient clipping applied
// BEFORE the moment updates (same semantics as sgdStep — clip the raw gradient).
// `state` is a persistent object the caller must provide:
//   { m: Float32Array(PARAM_COUNT), v: Float32Array(PARAM_COUNT), step: number }

/** Create a fresh Adam optimizer state compatible with this net. */
export const createAdamState = () => ({
    m: new Float32Array(PARAM_COUNT),
    v: new Float32Array(PARAM_COUNT),
    step: 0
});

/** Reset Adam moments in place (used on rollback). */
export const resetAdamState = (state) => {
    state.m.fill(0);
    state.v.fill(0);
    state.step = 0;
};

/** In-place Adam update. */
export const adamStep = (params, grads, lr, state, {
    beta1 = 0.9, beta2 = 0.999, eps = 1e-8,
    gradClip = 1.0, weightDecay = 0
} = {}) => {
    // Gradient norm for clipping
    let sqSum = 0;
    for (let i = 0; i < PARAM_COUNT; i++) sqSum += grads[i] * grads[i];
    const norm = Math.sqrt(sqSum);
    const scale = norm > gradClip ? gradClip / norm : 1;

    state.step += 1;
    const t = state.step;
    const biasCorr1 = 1 - Math.pow(beta1, t);
    const biasCorr2 = 1 - Math.pow(beta2, t);
    const { m, v } = state;

    for (let i = 0; i < PARAM_COUNT; i++) {
        const g = grads[i] * scale;
        m[i] = beta1 * m[i] + (1 - beta1) * g;
        v[i] = beta2 * v[i] + (1 - beta2) * g * g;
        const mHat = m[i] / biasCorr1;
        const vHat = v[i] / biasCorr2;
        params[i] -= lr * (mHat / (Math.sqrt(vHat) + eps) + weightDecay * params[i]);
        grads[i] = 0; // reset for next minibatch
    }
    return { gradNorm: norm };
};

// ====== Serialize / Deserialize ======

export const serializeParams = (params) => ({
    version: 1,
    inputSize: INPUT_SIZE,
    h1: H1,
    h2: H2,
    actionSize: ACTION_SIZE,
    paramCount: PARAM_COUNT,
    params: Array.from(params)
});

export const deserializeParams = (obj) => {
    if (!obj || obj.inputSize !== INPUT_SIZE || obj.actionSize !== ACTION_SIZE) {
        throw new Error('Incompatible checkpoint');
    }
    return new Float32Array(obj.params);
};
