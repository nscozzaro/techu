#!/usr/bin/env node
// training/cli/train-simple.mjs
// Simplified training loop. No frozen champion, no SPRT, no autoadjust.
//
// Just: self-play → train on replay buffer → eval vs FloodBotStatic → save best.
//
// The only metric that matters is vs-Static win rate. When it goes up, the
// model is genuinely improving. When it plateaus, training has converged.
//
// Usage:
//   node training/cli/train-simple.mjs [configPath]

import fs from 'fs';
import path from 'path';
import {
    createParams,
    backward,
    adamStep,
    createAdamState,
    PARAM_COUNT,
    serializeParams,
    deserializeParams
} from '../net/mlp.mjs';
import { playSelfPlayGame, makeMctsBot, playMatch } from '../selfplay/selfplay.mjs';
import { FloodBotStatic } from '../bot/tiers.mjs';
import { getLegalMoves } from '../engine/core.mjs';
import { wilsonInterval } from '../league/evaluate.mjs';

const CONFIG_PATH = process.argv[2] ?? 'training/configs/simple.json';
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

console.log(`\n=== Flood RL training (simple) ===`);
console.log(`Config: ${CONFIG_PATH}`);
console.log(`  ${config.description}\n`);

const checkpointDir = path.resolve(process.cwd(), config.checkpointDir);
if (!fs.existsSync(checkpointDir)) fs.mkdirSync(checkpointDir, { recursive: true });
const livePath = path.join(checkpointDir, 'live.json');
const bestPath = path.join(checkpointDir, 'best.json');
const latestPath = path.join(checkpointDir, 'latest.json');

// ---- Load or init model ----
const startPath = config.startFrom ?? path.join(checkpointDir, 'champion.json');
let params;
if (fs.existsSync(startPath)) {
    params = deserializeParams(JSON.parse(fs.readFileSync(startPath, 'utf8')));
    console.log(`Loaded model from ${startPath}`);
} else {
    params = createParams(12345);
    console.log('Initialized from zero-init');
}
const grads = new Float32Array(PARAM_COUNT);
const adamState = createAdamState();

// ---- Replay buffer ----
const REPLAY_CAPACITY = config.replayCapacity ?? 20000;
let replayBuffer = [];

// ---- Baselines ----
const randomBot = {
    name: 'Random',
    getMove: (state, player) => {
        const legal = getLegalMoves(state, player);
        return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
    }
};

// ---- Progress tracking ----
let bestVsStatic = 0;
let bestVsStaticGen = -1;
const history = [];

// ---- Dashboard live state ----
const live = {
    config,
    generation: 0,
    startedAt: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
    history: [],
    events: []
};
const writeLive = () => {
    live.lastUpdate = new Date().toISOString();
    fs.writeFileSync(livePath, JSON.stringify(live, null, 2));
};
writeLive();

// ---- Training loop ----
const maxGen = config.maxGenerations ?? 200;
for (let gen = 0; gen < maxGen; gen++) {
    const t0 = Date.now();

    // ---- Self-play: mix of pure self-play + vs FloodBotStatic ----
    const genExamples = [];
    const selfPlayFraction = config.selfPlayFraction ?? 0.6;
    const numSelfPlay = Math.round(config.gamesPerGen * selfPlayFraction);
    const numVsStatic = config.gamesPerGen - numSelfPlay;

    // Pure self-play (both sides use current params)
    for (let i = 0; i < numSelfPlay; i++) {
        const { examples } = playSelfPlayGame({
            params,
            seed: `gen${gen}:self${i}`,
            numSimulations: config.mctsSims,
            cPuct: config.cPuct,
            dirichletAlpha: config.dirichletAlpha,
            dirichletWeight: config.dirichletWeight,
            temperatureMoves: config.temperatureMoves,
            valueTargetBlend: config.valueTargetBlend ?? 0.25,
        });
        genExamples.push(...examples);
    }

    // Vs FloodBotStatic (alternating sides)
    for (let i = 0; i < numVsStatic; i++) {
        const learnerPlayer = i % 2 === 0 ? 'red' : 'black';
        const { examples } = playSelfPlayGame({
            params,
            seed: `gen${gen}:static${i}`,
            numSimulations: config.mctsSims,
            cPuct: config.cPuct,
            dirichletAlpha: config.dirichletAlpha,
            dirichletWeight: config.dirichletWeight,
            temperatureMoves: config.temperatureMoves,
            valueTargetBlend: config.valueTargetBlend ?? 0.25,
            opponent: FloodBotStatic,
            learnerPlayer,
        });
        genExamples.push(...examples);
    }

    const selfplayMs = Date.now() - t0;

    // ---- Add to replay buffer ----
    replayBuffer.push(...genExamples);
    if (replayBuffer.length > REPLAY_CAPACITY) {
        replayBuffer.splice(0, replayBuffer.length - REPLAY_CAPACITY);
    }

    // ---- Train on replay buffer ----
    const t1 = Date.now();
    let totalPolicyLoss = 0, totalValueLoss = 0, steps = 0, gradNormSum = 0, gradNormCount = 0;
    const indices = new Int32Array(replayBuffer.length);
    for (let i = 0; i < replayBuffer.length; i++) indices[i] = i;

    for (let epoch = 0; epoch < (config.epochsPerGen ?? 4); epoch++) {
        // Fisher-Yates shuffle
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
        }
        const batchSize = config.batchSize ?? 32;
        for (let b = 0; b < indices.length; b += batchSize) {
            grads.fill(0);
            const end = Math.min(b + batchSize, indices.length);
            let count = 0;
            for (let k = b; k < end; k++) {
                const ex = replayBuffer[indices[k]];
                const { policyLoss, valueLoss } = backward(
                    params, grads, ex.input, ex.policy, ex.targetValue, ex.mask,
                    config.entropyCoeff ?? 0.005, config.valueCoeff ?? 1.5
                );
                totalPolicyLoss += policyLoss;
                totalValueLoss += valueLoss;
                count += 1;
            }
            if (count > 0) {
                const scale = 1 / count;
                for (let i = 0; i < PARAM_COUNT; i++) grads[i] *= scale;
                const { gradNorm } = adamStep(params, grads, config.learningRate ?? 1e-3, adamState, {
                    beta1: 0.9, beta2: 0.999, eps: 1e-8,
                    gradClip: config.gradClip ?? 1.0,
                });
                gradNormSum += gradNorm;
                gradNormCount += 1;
            }
            steps += count;
        }
    }
    const trainMs = Date.now() - t1;

    // ---- Eval vs FloodBotStatic + vs Random ----
    const t2 = Date.now();
    const evalBot = makeMctsBot(params, {
        name: `Gen${gen}`, numSimulations: config.mctsSims, cPuct: config.cPuct
    });
    const evalPairs = Math.floor((config.evalGames ?? 80) / 2);
    const vsStatic = playMatch(evalBot, FloodBotStatic, evalPairs, { seedPrefix: `eval-s-gen${gen}` });
    const vsRandom = playMatch(evalBot, randomBot, 15, { seedPrefix: `eval-r-gen${gen}` });
    const evalMs = Date.now() - t2;

    const vsStaticWR = vsStatic.aWins / vsStatic.totalGames;
    const vsRandomWR = vsRandom.aWins / vsRandom.totalGames;
    const wilson = wilsonInterval(vsStatic.aWins, vsStatic.totalGames);

    // ---- Best checkpoint tracking ----
    let newBest = false;
    if (vsStaticWR > bestVsStatic && vsRandomWR >= 0.85) {
        bestVsStatic = vsStaticWR;
        bestVsStaticGen = gen;
        fs.writeFileSync(bestPath, JSON.stringify(serializeParams(params)));
        newBest = true;
    }
    fs.writeFileSync(latestPath, JSON.stringify(serializeParams(params)));

    // ---- Record ----
    const avgPolicy = totalPolicyLoss / Math.max(1, steps);
    const avgValue = totalValueLoss / Math.max(1, steps);
    const avgGrad = gradNormSum / Math.max(1, gradNormCount);

    const genEntry = {
        gen,
        at: new Date().toISOString(),
        selfplayMs, trainMs, evalMs,
        policyLoss: avgPolicy,
        valueLoss: avgValue,
        gradNorm: avgGrad,
        replayBufferSize: replayBuffer.length,
        vsRandom: { wins: vsRandom.aWins, losses: vsRandom.bWins, ties: vsRandom.ties, total: vsRandom.totalGames, winRate: vsRandomWR, wilson: wilsonInterval(vsRandom.aWins, vsRandom.totalGames) },
        vsStatic: { wins: vsStatic.aWins, losses: vsStatic.bWins, ties: vsStatic.ties, total: vsStatic.totalGames, winRate: vsStaticWR, wilson },
        // Dashboard compat: fill vsChampion with vs-static data so the chart works
        vsChampion: { wins: vsStatic.aWins, losses: vsStatic.bWins, ties: vsStatic.ties, total: vsStatic.totalGames, winRate: vsStaticWR, decision: newBest ? 'new_best' : 'continue' },
        promoted: newBest,
        bestVsStatic,
        bestVsStaticGen,
    };
    live.history.push(genEntry);
    live.generation = gen;

    if (newBest) {
        live.events.push({
            gen, at: new Date().toISOString(),
            type: 'promotion',
            message: `New best: ${(100 * vsStaticWR).toFixed(1)}% vs static (gen ${gen})`
        });
    }
    writeLive();

    const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
        `gen=${gen.toString().padStart(2)} ` +
        `time=${totalTime}s ` +
        `buf=${replayBuffer.length}/${REPLAY_CAPACITY} ` +
        `pLoss=${avgPolicy.toFixed(2)} vLoss=${avgValue.toFixed(3)} ` +
        `vs-static=${vsStatic.aWins}/${vsStatic.totalGames} (${(100 * vsStaticWR).toFixed(0)}%) [${(100 * wilson.lo).toFixed(0)}-${(100 * wilson.hi).toFixed(0)}] ` +
        `vs-random=${vsRandom.aWins}/${vsRandom.totalGames} (${(100 * vsRandomWR).toFixed(0)}%) ` +
        `best=${(100 * bestVsStatic).toFixed(0)}%@g${bestVsStaticGen}` +
        `${newBest ? ' *BEST*' : ''}`
    );
}

console.log(`\nTraining complete.`);
console.log(`Best checkpoint: ${bestPath} (${(100 * bestVsStatic).toFixed(1)}% vs static at gen ${bestVsStaticGen})`);
console.log(`Latest checkpoint: ${latestPath}`);
