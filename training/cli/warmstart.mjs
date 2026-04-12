#!/usr/bin/env node
// training/cli/warmstart.mjs
// Heuristic warm-start for the value + policy net.
//
// Problem: the untrained net has zero-init output heads, so MCTS starts with a
// uniform policy and a flat (zero) value function. At ~40 sims/move it can't
// bootstrap from that — the bot stays at ~0% vs FloodBotStatic because every
// position looks like a coin flip.
//
// Fix: before any self-play, pretrain the net to mimic the existing heuristic
// bot. This gives MCTS a useful prior and value function from step 1.
//
// Procedure:
//   1. Generate positions by running FloodBotStatic vs FloodBotStatic with
//      ε-greedy exploration (30% random) for variety.
//   2. For each position we visit, record:
//        input  = encodeState(state, currentPlayer)
//        mask   = encodeActionMask(state, currentPlayer)
//        value  = tanh((evaluateSearchPosition(state, current) - μ) / σ)
//        policy = softmax(heuristic scores over legal actions)
//   3. Train both heads with MSE (value) + CE (policy) for N epochs.
//   4. Save to champion.json + latest.json.
//
// Usage:
//   node training/cli/warmstart.mjs [numPositions] [epochs]
//   defaults: 6000 positions, 30 epochs
//
// Cost: ~30-60 seconds total on a modern laptop.

import fs from 'fs';
import path from 'path';
import {
    createParams,
    backward,
    sgdStep,
    forward,
    maskedSoftmax,
    PARAM_COUNT,
    serializeParams,
} from '../net/mlp.mjs';
import {
    newGame,
    applyMove,
    isTerminal,
    getLegalMoves,
    otherPlayer,
    cloneState,
} from '../engine/core.mjs';
import {
    encodeState,
    encodeActionMask,
    ACTION_SIZE,
} from '../engine/encoding.mjs';
import { evaluateSearchPosition } from '../engine/search.mjs';
import {
    evaluateMove,
    evaluateDiscardValue,
} from '../engine/heuristic.mjs';
import { floodBotStaticMove, FloodBotStatic } from '../bot/tiers.mjs';

const NUM_POSITIONS = parseInt(process.argv[2] ?? '6000', 10);
const NUM_EPOCHS = parseInt(process.argv[3] ?? '30', 10);
const CHECKPOINT_DIR = 'training/checkpoints';

// ---- Deterministic RNG for reproducibility ----
const makeRng = (seed) => {
    let s = (seed | 0) || 1;
    return () => {
        s = Math.imul(s ^ (s >>> 15), 1 | s);
        s ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
        return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
    };
};

// ---- ε-greedy FloodBotStatic opponent for data generation ----
const makeEpsilonStatic = (eps, rng) => ({
    name: `EpsilonStatic-${eps}`,
    getMove: (state, player) => {
        if (rng() < eps) {
            const legal = getLegalMoves(state, player);
            return legal.length ? legal[Math.floor(rng() * legal.length)] : null;
        }
        return floodBotStaticMove(state, player);
    },
});

// ---- Position collection via rollouts ----
const collectPositions = (targetCount, rng) => {
    const positions = [];
    const botA = makeEpsilonStatic(0.30, rng);
    const botB = makeEpsilonStatic(0.30, rng);
    let games = 0;
    let skipped = 0;
    const MAX_TURNS = 300;

    while (positions.length < targetCount) {
        games += 1;
        const state = newGame({ seed: `warmstart:${games}:${Math.floor(rng() * 1e9)}` });
        let turns = 0;
        while (!isTerminal(state) && state.gamePhase !== 'ended' && turns < MAX_TURNS) {
            // Record this position BEFORE the move is made (except during setup,
            // which is under-specified — we skip it to keep the training data clean).
            if (state.gamePhase === 'playing' && state.openingMoveComplete) {
                const legal = getLegalMoves(state, state.currentPlayer);
                if (legal.length > 0) {
                    // Clone so subsequent applyMove doesn't mutate this snapshot.
                    positions.push({
                        state: cloneState(state),
                        player: state.currentPlayer,
                    });
                    if (positions.length >= targetCount) break;
                } else {
                    skipped += 1;
                }
            }
            const bot = state.currentPlayer === 'red' ? botA : botB;
            const move = bot.getMove(state, state.currentPlayer);
            if (!move) break;
            applyMove(state, move);
            turns += 1;
        }
    }

    return { positions, games, skipped };
};

// ---- Heuristic-driven labels ----
const decodeActionIdx = (idx) => {
    const slotIndex = Math.floor(idx / 27);
    const target = idx % 27;
    if (target === 25) return { type: 'discard', slotIndex };
    if (target === 26) return null;
    return { type: 'place', slotIndex, row: Math.floor(target / 5), col: target % 5 };
};

const buildPolicyTarget = (state, player, mask, temperature = 6) => {
    const policy = new Float32Array(ACTION_SIZE);
    const hand = state[`${player}Hand`];
    const legalIndices = [];
    const scores = [];

    for (let i = 0; i < ACTION_SIZE; i++) {
        if (mask[i] === 0) continue;
        const move = decodeActionIdx(i);
        if (!move) continue;
        const card = hand[move.slotIndex];
        if (!card) continue;
        let score;
        if (move.type === 'place') {
            score = evaluateMove(state, move.row, move.col, card, player);
        } else {
            // Discard: heuristic returns "keep score" where higher = better to keep
            const keepScore = evaluateDiscardValue(state, card, player);
            score = -keepScore; // flip so higher = better to discard
            // Discourage discards relative to moves unless the discard is clearly good
            score -= 5;
        }
        legalIndices.push(i);
        scores.push(score);
    }
    if (scores.length === 0) return policy;

    const maxScore = scores.reduce((a, b) => Math.max(a, b), -Infinity);
    let sum = 0;
    const exps = scores.map((s) => Math.exp((s - maxScore) / temperature));
    for (const e of exps) sum += e;
    if (sum > 0) {
        for (let i = 0; i < legalIndices.length; i++) {
            policy[legalIndices[i]] = exps[i] / sum;
        }
    }
    return policy;
};

// ---- Training ----
const train = async () => {
    console.log('\n=== Flood RL heuristic warm-start ===\n');
    const checkpointDir = path.resolve(process.cwd(), CHECKPOINT_DIR);
    if (!fs.existsSync(checkpointDir)) fs.mkdirSync(checkpointDir, { recursive: true });

    console.log(`Target positions: ${NUM_POSITIONS}, epochs: ${NUM_EPOCHS}`);

    // 1. Collect positions
    const t0 = Date.now();
    const rng = makeRng(42);
    const { positions, games, skipped } = collectPositions(NUM_POSITIONS, rng);
    const collectMs = Date.now() - t0;
    console.log(`Collected ${positions.length} positions from ${games} games (${skipped} skipped). [${(collectMs / 1000).toFixed(1)}s]`);

    // 2. Compute heuristic labels: inputs, masks, value targets, policy targets.
    // We do this eagerly so we can calibrate the value scale.
    const t1 = Date.now();
    const inputs = new Array(positions.length);
    const masks = new Array(positions.length);
    const policies = new Array(positions.length);
    const rawValues = new Float64Array(positions.length);

    for (let i = 0; i < positions.length; i++) {
        const { state, player } = positions[i];
        inputs[i] = encodeState(state, player);
        masks[i] = encodeActionMask(state, player);
        policies[i] = buildPolicyTarget(state, player, masks[i]);
        rawValues[i] = evaluateSearchPosition(state, player);
    }

    // Calibrate value scale: compute mean and std, then squash via tanh((x-μ)/σ).
    // Using 1σ scaling produces a moderate distribution in [-1, 1] (typical ±0.7).
    let sum = 0;
    for (let i = 0; i < rawValues.length; i++) sum += rawValues[i];
    const mean = sum / rawValues.length;
    let sqSum = 0;
    for (let i = 0; i < rawValues.length; i++) sqSum += (rawValues[i] - mean) ** 2;
    const std = Math.sqrt(sqSum / rawValues.length) || 1;
    const valueTargets = new Float32Array(positions.length);
    for (let i = 0; i < rawValues.length; i++) {
        valueTargets[i] = Math.tanh((rawValues[i] - mean) / std);
    }

    // Summary stats
    let vMin = Infinity, vMax = -Infinity, vSum = 0;
    for (let i = 0; i < valueTargets.length; i++) {
        if (valueTargets[i] < vMin) vMin = valueTargets[i];
        if (valueTargets[i] > vMax) vMax = valueTargets[i];
        vSum += valueTargets[i];
    }
    const labelMs = Date.now() - t1;
    console.log(
        `Labeled positions in ${(labelMs / 1000).toFixed(1)}s. ` +
        `Heuristic eval: μ=${mean.toFixed(1)}, σ=${std.toFixed(1)}. ` +
        `Value targets: min=${vMin.toFixed(2)}, max=${vMax.toFixed(2)}, mean=${(vSum / valueTargets.length).toFixed(2)}.`
    );

    // 3. Train the net
    const t2 = Date.now();
    const params = createParams(99);
    const grads = new Float32Array(PARAM_COUNT);
    const BATCH = 32;
    const LR = 5e-3;
    const indices = Array.from({ length: positions.length }, (_, i) => i);
    const shuffle = (seed) => {
        const rng = makeRng(seed);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
    };

    for (let epoch = 0; epoch < NUM_EPOCHS; epoch++) {
        shuffle(1000 + epoch);
        let epochPolicyLoss = 0;
        let epochValueLoss = 0;
        let steps = 0;
        for (let b = 0; b < indices.length; b += BATCH) {
            grads.fill(0);
            const end = Math.min(b + BATCH, indices.length);
            let count = 0;
            for (let k = b; k < end; k++) {
                const idx = indices[k];
                const { policyLoss, valueLoss } = backward(
                    params,
                    grads,
                    inputs[idx],
                    policies[idx],
                    valueTargets[idx],
                    masks[idx],
                    0.005, // low entropy bonus during warm-start (we WANT sharp heuristic priors)
                );
                epochPolicyLoss += policyLoss;
                epochValueLoss += valueLoss;
                count += 1;
            }
            if (count > 0) {
                const scale = 1 / count;
                for (let i = 0; i < PARAM_COUNT; i++) grads[i] *= scale;
                sgdStep(params, grads, LR, { gradClip: 1.0, weightDecay: 1e-4 });
                steps += count;
            }
        }

        // Sanity: eval forward pass mean value on a sample
        if (epoch === 0 || epoch === NUM_EPOCHS - 1 || (epoch + 1) % 5 === 0) {
            let valueErr = 0;
            let correctTop1 = 0;
            let legalTop = 0;
            const sampleSize = Math.min(500, positions.length);
            for (let i = 0; i < sampleSize; i++) {
                const idx = i;
                const { value, policyLogits } = forward(params, inputs[idx]);
                valueErr += (value - valueTargets[idx]) ** 2;
                const probs = maskedSoftmax(policyLogits, masks[idx]);
                // Argmax of prediction vs argmax of target
                let predMaxIdx = -1, predMax = -Infinity;
                let tgtMaxIdx = -1, tgtMax = -Infinity;
                for (let a = 0; a < ACTION_SIZE; a++) {
                    if (masks[idx][a] === 0) continue;
                    if (probs[a] > predMax) { predMax = probs[a]; predMaxIdx = a; }
                    if (policies[idx][a] > tgtMax) { tgtMax = policies[idx][a]; tgtMaxIdx = a; }
                }
                if (predMaxIdx !== -1 && tgtMaxIdx !== -1) {
                    legalTop += 1;
                    if (predMaxIdx === tgtMaxIdx) correctTop1 += 1;
                }
            }
            console.log(
                `epoch=${epoch.toString().padStart(2)} ` +
                `pLoss=${(epochPolicyLoss / Math.max(1, steps)).toFixed(3)} ` +
                `vLoss=${(epochValueLoss / Math.max(1, steps)).toFixed(3)} ` +
                `valRMSE=${Math.sqrt(valueErr / sampleSize).toFixed(3)} ` +
                `policyTop1=${(100 * correctTop1 / legalTop).toFixed(0)}%`
            );
        }
    }
    const trainMs = Date.now() - t2;
    console.log(`\nTrained in ${(trainMs / 1000).toFixed(1)}s.`);

    // 4. Save checkpoints
    const serialized = JSON.stringify(serializeParams(params));
    const championPath = path.join(checkpointDir, 'champion.json');
    const latestPath = path.join(checkpointDir, 'latest.json');
    const warmstartPath = path.join(checkpointDir, 'warmstart.json');
    fs.writeFileSync(championPath, serialized);
    fs.writeFileSync(latestPath, serialized);
    fs.writeFileSync(warmstartPath, serialized);
    console.log(`\nSaved warm-started model to:`);
    console.log(`  ${championPath}`);
    console.log(`  ${latestPath}`);
    console.log(`  ${warmstartPath}`);

    console.log('\nNext step: evaluate vs FloodBotStatic with:');
    console.log('  node training/cli/bot-vs-random.mjs training/checkpoints/warmstart.json');
    console.log('Or start self-play training:');
    console.log('  node training/cli/train.mjs training/configs/fast.json');
};

train().catch((err) => {
    console.error(err);
    process.exit(1);
});
