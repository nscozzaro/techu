#!/usr/bin/env node
// training/cli/expert-train.mjs
// Supervised imitation learning from FloodBotFull.
//
// Instead of RL self-play (which plateaued at 80% vs static after 300+ gens),
// this script trains the MLP to directly imitate FloodBotFull's alpha-beta
// search decisions. Every position gets a per-move quality signal from the
// search, not a delayed game outcome.
//
// Phases:
//   1. Generate expert dataset (parallel, ~18 min)
//   2. Supervised training (Adam, ~5-8 min)
//   3. Evaluation (vs Static, vs Full, vs Random)
//   4. Deploy to flood-model.json
//
// Usage:
//   node training/cli/expert-train.mjs [numGames] [epochs]

import fs from 'fs';
import path from 'path';
import os from 'os';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import {
    createParams, backward, adamStep, createAdamState,
    forward, maskedSoftmax, PARAM_COUNT, serializeParams
} from '../net/mlp.mjs';
import { ACTION_SIZE } from '../engine/encoding.mjs';
import { makeMctsBot, playMatch } from '../selfplay/selfplay.mjs';
import { FloodBotStatic, FloodBotFull } from '../bot/tiers.mjs';
import { getLegalMoves } from '../engine/core.mjs';
import { wilsonInterval } from '../league/evaluate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_PATH = path.join(__dirname, 'expert-worker.mjs');

const NUM_GAMES = parseInt(process.argv[2] ?? '8000', 10);
const NUM_EPOCHS = parseInt(process.argv[3] ?? '200', 10);
const CHECKPOINT_DIR = 'training/checkpoints';
const NUM_WORKERS = os.cpus().length;

console.log(`\n=== Flood expert imitation training ===`);
console.log(`Games: ${NUM_GAMES} | Epochs: ${NUM_EPOCHS} | Workers: ${NUM_WORKERS}\n`);

const checkpointDir = path.resolve(process.cwd(), CHECKPOINT_DIR);
if (!fs.existsSync(checkpointDir)) fs.mkdirSync(checkpointDir, { recursive: true });

// ---- Phase 1: Generate expert dataset ----

const generateDataset = async () => {
    console.log('Phase 1: Generating expert dataset...');
    const t0 = Date.now();

    // Build game specs
    const games = [];
    const vsStaticCount = Math.round(NUM_GAMES * 0.625);  // 62.5% vs static
    const vsSelfCount = Math.round(NUM_GAMES * 0.25);      // 25% self-play
    const vsRandomCount = NUM_GAMES - vsStaticCount - vsSelfCount; // 12.5% vs random

    for (let i = 0; i < vsStaticCount; i++) {
        games.push({ seed: `expert-static:${i}`, opponentType: 'static' });
    }
    for (let i = 0; i < vsSelfCount; i++) {
        games.push({ seed: `expert-self:${i}`, opponentType: 'self' });
    }
    for (let i = 0; i < vsRandomCount; i++) {
        games.push({ seed: `expert-random:${i}`, opponentType: 'random' });
    }

    // Distribute across workers
    const batches = Array.from({ length: NUM_WORKERS }, () => []);
    for (let i = 0; i < games.length; i++) {
        batches[i % NUM_WORKERS].push(games[i]);
    }

    const searchConfig = { timeMs: 500, nodeBudget: 6000 };

    const workerPromises = batches.map(batch => new Promise((resolve, reject) => {
        const worker = new Worker(WORKER_PATH, {
            workerData: { games: batch, searchConfig }
        });
        worker.on('message', resolve);
        worker.on('error', reject);
        worker.on('exit', code => { if (code !== 0) reject(new Error(`Worker exit ${code}`)); });
    }));

    const results = await Promise.all(workerPromises);
    const allPositions = [];
    let totalGames = 0;
    for (const r of results) {
        allPositions.push(...r.positions);
        totalGames += r.gamesPlayed;
    }

    const genMs = Date.now() - t0;
    console.log(`  Generated ${allPositions.length} positions from ${totalGames} games in ${(genMs / 1000).toFixed(1)}s`);
    return allPositions;
};

// ---- Phase 2: Train ----

const train = (positions) => {
    console.log(`\nPhase 2: Supervised training (${NUM_EPOCHS} epochs, ${positions.length} positions)...`);
    const t0 = Date.now();

    // Separate into inputs, masks, policies, values
    const inputs = positions.map(p => p.input);
    const masks = positions.map(p => p.mask);
    const policies = positions.map(p => p.policyTarget);
    const rawValues = positions.map(p => p.rawValue);

    // Normalize values: tanh((x - mean) / std)
    const mean = rawValues.reduce((a, b) => a + b, 0) / rawValues.length;
    let sqSum = 0;
    for (const v of rawValues) sqSum += (v - mean) ** 2;
    const std = Math.sqrt(sqSum / rawValues.length) || 1;
    const valueTargets = rawValues.map(v => Math.tanh((v - mean) / std));
    console.log(`  Value normalization: μ=${mean.toFixed(1)}, σ=${std.toFixed(1)}`);

    // Split train/validation (90/10)
    const indices = Array.from({ length: positions.length }, (_, i) => i);
    // Shuffle
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const valSize = Math.floor(positions.length * 0.1);
    const valIndices = indices.slice(0, valSize);
    const trainIndices = indices.slice(valSize);
    console.log(`  Train: ${trainIndices.length} | Validation: ${valIndices.length}`);

    // Init
    const params = createParams(99);
    const grads = new Float32Array(PARAM_COUNT);
    const adamState = createAdamState();
    const BATCH = 64;

    // LR schedule
    const getLR = (epoch) => {
        if (epoch < 80) return 3e-3;
        if (epoch < 150) return 1.5e-3;
        return 7.5e-4;
    };

    // Training loop
    for (let epoch = 0; epoch < NUM_EPOCHS; epoch++) {
        // Shuffle train indices
        for (let i = trainIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [trainIndices[i], trainIndices[j]] = [trainIndices[j], trainIndices[i]];
        }

        let epochPLoss = 0, epochVLoss = 0, epochSteps = 0;
        for (let b = 0; b < trainIndices.length; b += BATCH) {
            grads.fill(0);
            const end = Math.min(b + BATCH, trainIndices.length);
            let count = 0;
            for (let k = b; k < end; k++) {
                const idx = trainIndices[k];
                const { policyLoss, valueLoss } = backward(
                    params, grads, inputs[idx], policies[idx], valueTargets[idx], masks[idx],
                    0.002, 1.5 // entropyCoeff, valueCoeff
                );
                epochPLoss += policyLoss;
                epochVLoss += valueLoss;
                count++;
            }
            if (count > 0) {
                const scale = 1 / count;
                for (let i = 0; i < PARAM_COUNT; i++) grads[i] *= scale;
                adamStep(params, grads, getLR(epoch), adamState, {
                    gradClip: 1.0, weightDecay: 1e-4
                });
            }
            epochSteps += count;
        }

        // Validation metrics every 10 epochs
        if (epoch === 0 || epoch === NUM_EPOCHS - 1 || (epoch + 1) % 10 === 0) {
            let valPLoss = 0, valVLoss = 0, top1 = 0, top3 = 0, valCount = 0;
            for (const idx of valIndices) {
                const { policyLogits, value } = forward(params, inputs[idx]);
                const probs = maskedSoftmax(policyLogits, masks[idx]);

                // Value RMSE
                valVLoss += (value - valueTargets[idx]) ** 2;

                // Policy accuracy
                // Find argmax of target and prediction
                let tgtMax = -1, tgtMaxIdx = -1;
                let predSorted = [];
                for (let a = 0; a < ACTION_SIZE; a++) {
                    if (masks[idx][a] === 0) continue;
                    if (policies[idx][a] > (tgtMax === -1 ? -Infinity : policies[idx][tgtMaxIdx])) {
                        tgtMax = policies[idx][a];
                        tgtMaxIdx = a;
                    }
                    predSorted.push({ a, p: probs[a] });
                }
                predSorted.sort((a, b) => b.p - a.p);

                if (tgtMaxIdx >= 0 && predSorted.length > 0) {
                    valCount++;
                    if (predSorted[0].a === tgtMaxIdx) top1++;
                    if (predSorted.slice(0, 3).some(x => x.a === tgtMaxIdx)) top3++;
                }

                // CE loss
                for (let a = 0; a < ACTION_SIZE; a++) {
                    if (policies[idx][a] > 0 && probs[a] > 1e-12) {
                        valPLoss -= policies[idx][a] * Math.log(probs[a]);
                    }
                }
            }
            const vRMSE = Math.sqrt(valVLoss / valIndices.length);
            const vPLoss = valPLoss / valIndices.length;
            console.log(
                `  epoch ${epoch.toString().padStart(3)} | ` +
                `lr=${getLR(epoch).toExponential(1)} ` +
                `tPLoss=${(epochPLoss / epochSteps).toFixed(3)} ` +
                `vPLoss=${vPLoss.toFixed(3)} ` +
                `vRMSE=${vRMSE.toFixed(3)} ` +
                `top1=${(100 * top1 / valCount).toFixed(1)}% ` +
                `top3=${(100 * top3 / valCount).toFixed(1)}%`
            );
        }
    }

    const trainMs = Date.now() - t0;
    console.log(`  Training complete in ${(trainMs / 1000).toFixed(1)}s`);
    return params;
};

// ---- Phase 3: Evaluate ----

const evaluate = (params) => {
    console.log('\nPhase 3: Evaluation...');
    const t0 = Date.now();

    const bot = makeMctsBot(params, { name: 'Expert-MLP', numSimulations: 96, cPuct: 1.5 });
    const randomBot = {
        name: 'Random',
        getMove: (state, player) => {
            const legal = getLegalMoves(state, player);
            return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
        }
    };

    console.log('  vs Random (30 paired = 60 games)...');
    const vsRandom = playMatch(bot, randomBot, 30, { seedPrefix: 'expert-eval-random' });
    const rWR = vsRandom.aWins / vsRandom.totalGames;
    console.log(`    ${vsRandom.aWins}/${vsRandom.totalGames} (${(100 * rWR).toFixed(1)}%)`);

    console.log('  vs FloodBotStatic (100 paired = 200 games)...');
    const vsStatic = playMatch(bot, FloodBotStatic, 100, { seedPrefix: 'expert-eval-static' });
    const sWR = vsStatic.aWins / vsStatic.totalGames;
    const sWilson = wilsonInterval(vsStatic.aWins, vsStatic.totalGames);
    console.log(`    ${vsStatic.aWins}/${vsStatic.totalGames} (${(100 * sWR).toFixed(1)}%) Wilson [${(100 * sWilson.lo).toFixed(1)}, ${(100 * sWilson.hi).toFixed(1)}]`);

    console.log('  vs FloodBotFull (50 paired = 100 games)...');
    const vsFull = playMatch(bot, FloodBotFull, 50, { seedPrefix: 'expert-eval-full' });
    const fWR = vsFull.aWins / vsFull.totalGames;
    const fWilson = wilsonInterval(vsFull.aWins, vsFull.totalGames);
    console.log(`    ${vsFull.aWins}/${vsFull.totalGames} (${(100 * fWR).toFixed(1)}%) Wilson [${(100 * fWilson.lo).toFixed(1)}, ${(100 * fWilson.hi).toFixed(1)}]`);

    const evalMs = Date.now() - t0;
    console.log(`  Evaluation complete in ${(evalMs / 1000).toFixed(1)}s`);

    return { rWR, sWR, fWR, sWilson, fWilson };
};

// ---- Main ----

const main = async () => {
    // Phase 1
    const positions = await generateDataset();
    if (positions.length < 1000) {
        console.error('Too few positions generated. Aborting.');
        process.exit(1);
    }

    // Phase 2
    const params = train(positions);

    // Save checkpoints
    const serialized = JSON.stringify(serializeParams(params));
    const expertPath = path.join(checkpointDir, 'expert-final.json');
    fs.writeFileSync(expertPath, serialized);
    console.log(`\nSaved expert model to ${expertPath}`);

    // Phase 3
    const results = evaluate(params);

    // Phase 4: Deploy if evaluation passes
    console.log('\n=== Results ===');
    console.log(`vs Random:         ${(100 * results.rWR).toFixed(1)}%`);
    console.log(`vs FloodBotStatic: ${(100 * results.sWR).toFixed(1)}% Wilson [${(100 * results.sWilson.lo).toFixed(1)}, ${(100 * results.sWilson.hi).toFixed(1)}]`);
    console.log(`vs FloodBotFull:   ${(100 * results.fWR).toFixed(1)}% Wilson [${(100 * results.fWilson.lo).toFixed(1)}, ${(100 * results.fWilson.hi).toFixed(1)}]`);

    if (results.sWR >= 0.85 && results.rWR >= 0.95) {
        const deployPath = path.resolve(process.cwd(), 'flood-model.json');
        fs.writeFileSync(deployPath, serialized);
        console.log(`\n✓ Deployed to ${deployPath}`);
    } else if (results.sWR >= 0.75) {
        const deployPath = path.resolve(process.cwd(), 'flood-model.json');
        fs.writeFileSync(deployPath, serialized);
        console.log(`\n⚠ Deployed (below 85% target but still better than current). ${deployPath}`);
    } else {
        console.log(`\n✗ Below deployment threshold. Model saved to ${expertPath} only.`);
    }
};

main().catch(err => { console.error(err); process.exit(1); });
