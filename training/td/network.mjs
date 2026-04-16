// training/td/network.mjs
// Compact value network: 116 → 64 → 32 → 1
// Pure value function — no policy head. This file started as the TD-lambda
// network, but we also reuse it for search-guided supervised training and
// browser-side compact inference.
//
// Key difference from mlp.mjs: this module exposes computeGradient() so TD
// style updates can build eligibility traces, while also providing generic
// backward/optimizer helpers for ordinary supervised learning.

export const INPUT_SIZE = 116;
export const H1 = 64;
export const H2 = 32;

const SIZE_W1 = H1 * INPUT_SIZE;
const SIZE_B1 = H1;
const SIZE_W2 = H2 * H1;
const SIZE_B2 = H2;
const SIZE_W3 = 1 * H2;
const SIZE_B3 = 1;

const OFF_W1 = 0;
const OFF_B1 = OFF_W1 + SIZE_W1;
const OFF_W2 = OFF_B1 + SIZE_B1;
const OFF_B2 = OFF_W2 + SIZE_W2;
const OFF_W3 = OFF_B2 + SIZE_B2;
const OFF_B3 = OFF_W3 + SIZE_W3;

export const PARAM_COUNT = OFF_B3 + SIZE_B3;

// ====== Initialization ======

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
    // W1: Kaiming sqrt(2/INPUT_SIZE)
    const s1 = Math.sqrt(2 / INPUT_SIZE);
    for (let i = 0; i < SIZE_W1; i++) params[OFF_W1 + i] = gauss() * s1;
    // W2: Kaiming sqrt(2/H1)
    const s2 = Math.sqrt(2 / H1);
    for (let i = 0; i < SIZE_W2; i++) params[OFF_W2 + i] = gauss() * s2;
    // W3 + b3: zero init (untrained value = tanh(0) = 0)
    return params;
};

// ====== Forward pass ======

export const forward = (params, input) => {
    const a1 = new Float32Array(H1);
    const a2 = new Float32Array(H2);

    // a1 = relu(W1 @ input + b1)
    for (let i = 0; i < H1; i++) {
        let sum = params[OFF_B1 + i];
        const row = OFF_W1 + i * INPUT_SIZE;
        for (let j = 0; j < INPUT_SIZE; j++) sum += params[row + j] * input[j];
        a1[i] = sum > 0 ? sum : 0; // ReLU
    }
    // a2 = relu(W2 @ a1 + b2)
    for (let i = 0; i < H2; i++) {
        let sum = params[OFF_B2 + i];
        const row = OFF_W2 + i * H1;
        for (let j = 0; j < H1; j++) sum += params[row + j] * a1[j];
        a2[i] = sum > 0 ? sum : 0; // ReLU
    }
    // value = tanh(W3 @ a2 + b3)
    let pre = params[OFF_B3];
    for (let j = 0; j < H2; j++) pre += params[OFF_W3 + j] * a2[j];
    const value = Math.tanh(pre);

    return { value, a1, a2, pre };
};

// ====== Compute gradient of output w.r.t. all params ======
// This is needed for TD-lambda eligibility traces:
//   traces = gamma * lambda * traces + dValue/dParams
// Returns a Float32Array(PARAM_COUNT) gradient vector.

export const computeGradient = (params, input) => {
    const { value, a1, a2, pre } = forward(params, input);
    const grad = new Float32Array(PARAM_COUNT);

    // dValue/dPre = 1 - tanh(pre)^2 = 1 - value^2
    const dPre = 1 - value * value;

    // dPre/dW3[j] = a2[j],  dPre/db3 = 1
    grad[OFF_B3] = dPre;
    for (let j = 0; j < H2; j++) {
        grad[OFF_W3 + j] = dPre * a2[j];
    }

    // dPre/da2[j] = W3[j] * dPre
    // da2[j]/dpre2[j] = (a2[j] > 0 ? 1 : 0)  (ReLU derivative)
    const dA2 = new Float32Array(H2);
    for (let j = 0; j < H2; j++) {
        dA2[j] = a2[j] > 0 ? params[OFF_W3 + j] * dPre : 0;
    }

    // dA2/dW2, dA2/db2
    for (let i = 0; i < H2; i++) {
        if (dA2[i] === 0) continue;
        grad[OFF_B2 + i] = dA2[i];
        const row = OFF_W2 + i * H1;
        for (let j = 0; j < H1; j++) {
            grad[row + j] = dA2[i] * a1[j];
        }
    }

    // dA2/da1 → dA1
    const dA1 = new Float32Array(H1);
    for (let j = 0; j < H1; j++) {
        if (a1[j] <= 0) continue; // ReLU gate
        let sum = 0;
        for (let i = 0; i < H2; i++) {
            if (dA2[i] === 0) continue;
            sum += params[OFF_W2 + i * H1 + j] * dA2[i];
        }
        dA1[j] = sum;
    }

    // dA1/dW1, dA1/db1
    for (let i = 0; i < H1; i++) {
        if (dA1[i] === 0) continue;
        grad[OFF_B1 + i] = dA1[i];
        const row = OFF_W1 + i * INPUT_SIZE;
        for (let j = 0; j < INPUT_SIZE; j++) {
            grad[row + j] = dA1[i] * input[j];
        }
    }

    return { grad, value };
};

export const backwardValue = (params, grads, input, targetValue, {
    loss = 'huber',
    huberDelta = 0.75
} = {}) => {
    const { grad, value } = computeGradient(params, input);
    const error = value - targetValue;
    const absError = Math.abs(error);
    let lossValue;
    let scale;
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
    for (let i = 0; i < PARAM_COUNT; i++) {
        grads[i] += grad[i] * scale;
    }
    return { value, error, loss: lossValue };
};

export const createAdamState = () => ({
    m: new Float32Array(PARAM_COUNT),
    v: new Float32Array(PARAM_COUNT),
    step: 0
});

export const resetAdamState = (state) => {
    state.m.fill(0);
    state.v.fill(0);
    state.step = 0;
};

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
    const scale = norm > gradClip ? gradClip / norm : 1;

    state.step += 1;
    const biasCorr1 = 1 - Math.pow(beta1, state.step);
    const biasCorr2 = 1 - Math.pow(beta2, state.step);
    const { m, v } = state;

    for (let i = 0; i < PARAM_COUNT; i++) {
        const g = grads[i] * scale;
        m[i] = beta1 * m[i] + (1 - beta1) * g;
        v[i] = beta2 * v[i] + (1 - beta2) * g * g;
        const mHat = m[i] / biasCorr1;
        const vHat = v[i] / biasCorr2;
        params[i] -= lr * (mHat / (Math.sqrt(vHat) + eps) + weightDecay * params[i]);
        grads[i] = 0;
    }
    return { gradNorm: norm };
};

export const sgdStep = (params, grads, lr, {
    gradClip = 1.0,
    weightDecay = 0
} = {}) => {
    let sqSum = 0;
    for (let i = 0; i < PARAM_COUNT; i++) sqSum += grads[i] * grads[i];
    const norm = Math.sqrt(sqSum);
    const scale = norm > gradClip ? gradClip / norm : 1;
    for (let i = 0; i < PARAM_COUNT; i++) {
        params[i] -= lr * (grads[i] * scale + weightDecay * params[i]);
        grads[i] = 0;
    }
    return { gradNorm: norm };
};

// ====== Serialize / Deserialize ======

export const serializeParams = (params) => ({
    version: 3,
    type: 'td-value',
    architecture: '116x64x32x1',
    inputSize: INPUT_SIZE,
    h1: H1,
    h2: H2,
    paramCount: PARAM_COUNT,
    params: Array.from(params)
});

export const deserializeParams = (obj) => {
    if (!obj || obj.paramCount !== PARAM_COUNT) {
        throw new Error(`Incompatible checkpoint: expected ${PARAM_COUNT} params, got ${obj?.paramCount}`);
    }
    return new Float32Array(obj.params);
};
