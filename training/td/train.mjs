#!/usr/bin/env node
// training/td/train.mjs
// TD-lambda training with CORRECT parallelization:
//   - Workers play games in parallel using frozen params (fast, handles FloodBotFull)
//   - Workers return trajectories (encoded states + outcomes)
//   - Main thread processes trajectories SEQUENTIALLY with proper TD-lambda
//   - Adaptive learning rate based on TD error magnitude
//
// Usage:
//   node training/td/train.mjs [gamesPerBatch] [numBatches]

import fs from 'fs';
import path from 'path';
import os from 'os';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import {
    createParams, forward, computeGradient, PARAM_COUNT,
    serializeParams, deserializeParams, INPUT_SIZE
} from './network.mjs';
import { encodeState } from './encode.mjs';
import {
    newGame, applyMove, isTerminal, getWinner, getScores,
    getLegalMoves, cloneState, otherPlayer
} from '../engine/core.mjs';
import { FloodBotFull, floodBotStaticMove } from '../bot/tiers.mjs';
import { wilsonInterval } from '../league/evaluate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_PATH = path.join(__dirname, 'worker.mjs');
const NUM_WORKERS = os.cpus().length;

const GAMES_PER_BATCH = parseInt(process.argv[2] ?? '10000', 10);
const NUM_BATCHES = parseInt(process.argv[3] ?? '999', 10);
const SELF_PLAY_FRAC = 0.67;
const COLD_START = 5000;
const EVAL_FULL = 50;
const EVAL_RAND = 30;

const GAMMA = 1.0;
const LAMBDA = 0.7;
let lr = 0.001;  // mutable — adaptive LR

const CHECKPOINT_DIR = 'training/checkpoints';
const checkpointDir = path.resolve(process.cwd(), CHECKPOINT_DIR);
if (!fs.existsSync(checkpointDir)) fs.mkdirSync(checkpointDir, { recursive: true });
const livePath = path.join(checkpointDir, 'live.json');

console.log(`\n=== Flood TD-lambda training (${NUM_WORKERS} workers, sequential TD) ===`);
console.log(`Games/batch: ${GAMES_PER_BATCH} | Batches: ${NUM_BATCHES}`);
console.log(`Mix: ${(SELF_PLAY_FRAC*100).toFixed(0)}% self-play, ${((1-SELF_PLAY_FRAC)*100).toFixed(0)}% vs FloodBotFull`);
console.log(`TD: gamma=${GAMMA}, lambda=${LAMBDA}, lr=${lr} (adaptive)`);
console.log(`Params: ${PARAM_COUNT}\n`);

const params = createParams(42);
let frozenParams = new Float32Array(params);
let bestVsFull = 0;

// Dashboard
const live = {
    config: { type: 'td-lambda-sequential', gamesPerBatch: GAMES_PER_BATCH, gamma: GAMMA, lambda: LAMBDA },
    generation: 0, startedAt: new Date().toISOString(), lastUpdate: new Date().toISOString(),
    history: [], events: []
};
const writeLive = () => { live.lastUpdate = new Date().toISOString(); fs.writeFileSync(livePath, JSON.stringify(live, null, 2)); };
writeLive();

// ---- Parallel game generation (workers return trajectories, no TD updates) ----
const generateTrajectories = async (games) => {
    const batches = Array.from({ length: NUM_WORKERS }, () => []);
    for (let i = 0; i < games.length; i++) batches[i % NUM_WORKERS].push(games[i]);

    const paramsArr = Array.from(params);
    const frozenArr = Array.from(frozenParams);

    const promises = batches.filter(b => b.length > 0).map(batch => new Promise((resolve, reject) => {
        const worker = new Worker(WORKER_PATH, {
            workerData: { games: batch, paramsArr, frozenParamsArr: frozenArr, config: {} }
        });
        worker.on('message', resolve);
        worker.on('error', reject);
        worker.on('exit', code => { if (code !== 0) reject(new Error(`Worker exit ${code}`)); });
    }));

    const workerResults = await Promise.all(promises);
    const allTrajectories = [];
    let totalWins = 0, totalGames = 0;
    for (const wr of workerResults) {
        for (const r of wr.results) {
            allTrajectories.push(r);
            totalGames++;
            if (r.won) totalWins++;
        }
    }
    return { trajectories: allTrajectories, wins: totalWins, games: totalGames };
};

// ---- Sequential TD-lambda processing on main thread ----
const processTrajectoriesTD = (trajectories) => {
    let totalTDError = 0;
    let totalSteps = 0;

    for (const traj of trajectories) {
        const { trajectoryFlat, trajectoryLen, outcome } = traj;
        if (trajectoryLen === 0) continue;

        const traces = new Float32Array(PARAM_COUNT);
        let prevValue = 0;
        let prevGrad = null;

        for (let t = 0; t < trajectoryLen; t++) {
            // Extract encoded state from flat array
            const stateInput = trajectoryFlat.slice(t * INPUT_SIZE, (t + 1) * INPUT_SIZE);
            const { grad, value: currentValue } = computeGradient(params, stateInput);

            if (prevGrad !== null) {
                const tdError = currentValue - prevValue;
                totalTDError += Math.abs(tdError);
                totalSteps++;

                // Update eligibility traces
                for (let i = 0; i < PARAM_COUNT; i++) {
                    traces[i] = GAMMA * LAMBDA * traces[i] + prevGrad[i];
                }
                // Update params
                for (let i = 0; i < PARAM_COUNT; i++) {
                    params[i] += lr * tdError * traces[i];
                }
            }
            prevValue = currentValue;
            prevGrad = grad;
        }

        // Final update with game outcome
        if (prevGrad !== null) {
            const tdError = outcome - prevValue;
            totalTDError += Math.abs(tdError);
            totalSteps++;

            for (let i = 0; i < PARAM_COUNT; i++) {
                traces[i] = GAMMA * LAMBDA * traces[i] + prevGrad[i];
            }
            for (let i = 0; i < PARAM_COUNT; i++) {
                params[i] += lr * tdError * traces[i];
            }
        }
    }

    const avgTDError = totalSteps > 0 ? totalTDError / totalSteps : 0;
    return { avgTDError, totalSteps };
};

// ---- Adaptive learning rate ----
const adaptLR = (avgTDError) => {
    const oldLR = lr;
    if (avgTDError > 0.3) {
        lr = Math.min(lr * 1.05, 0.01);
    } else if (avgTDError < 0.1) {
        lr = Math.max(lr * 0.95, 0.0001);
    }
    return oldLR !== lr;
};

// ---- Eval (single-threaded) ----
const selectMove = (state, player, netParams) => {
    const legal = getLegalMoves(state, player);
    if (legal.length === 0) return null;
    let bestMove = null, bestValue = -Infinity;
    for (const move of legal) {
        const clone = cloneState(state);
        applyMove(clone, move);
        const input = encodeState(clone, player);
        const { value } = forward(netParams, input);
        if (value > bestValue) { bestValue = value; bestMove = move; }
    }
    return bestMove;
};

const playEvalGame = (netParams, opponent, botSide, seed) => {
    const state = newGame({ seed });
    let turns = 0;
    while (!isTerminal(state) && state.gamePhase !== 'ended' && turns < 300) {
        const player = state.currentPlayer;
        let move;
        if (state.gamePhase === 'setup') {
            move = floodBotStaticMove(state, player);
        } else if (player === botSide) {
            move = selectMove(state, player, netParams);
        } else {
            move = opponent.getMove(state, player);
        }
        if (!move) { const l = getLegalMoves(state, player); if (!l.length) break; move = l[0]; }
        applyMove(state, move);
        turns++;
    }
    return getWinner(state);
};

const evalVs = (netParams, opponent, numPairs, prefix) => {
    let aWins = 0, bWins = 0, ties = 0;
    for (let i = 0; i < numPairs; i++) {
        const w1 = playEvalGame(netParams, opponent, 'red', `${prefix}:${i}:r`);
        if (w1 === 'red') aWins++; else if (w1 === 'black') bWins++; else ties++;
        const w2 = playEvalGame(netParams, opponent, 'black', `${prefix}:${i}:b`);
        if (w2 === 'black') aWins++; else if (w2 === 'red') bWins++; else ties++;
    }
    const total = numPairs * 2;
    return { aWins, bWins, ties, totalGames: total, winRate: aWins / total };
};

const RandomBot = { name: 'Random', getMove: (state, player) => {
    const l = getLegalMoves(state, player); return l.length ? l[Math.floor(Math.random() * l.length)] : null;
}};

// ---- Main loop ----
const run = async () => {
for (let batch = 0; batch < NUM_BATCHES; batch++) {
    const t0 = Date.now();

    // Build game specs
    const games = [];
    if (batch === 0) {
        for (let i = 0; i < COLD_START; i++) {
            games.push({ seed: `cold:${i}`, opponentType: 'random', learnerSide: i % 2 === 0 ? 'red' : 'black' });
        }
    }
    const numSelf = Math.round(GAMES_PER_BATCH * SELF_PLAY_FRAC);
    const numFull = GAMES_PER_BATCH - numSelf;
    for (let i = 0; i < numSelf; i++) {
        games.push({ seed: `b${batch}:s${i}`, opponentType: 'frozen', learnerSide: i % 2 === 0 ? 'red' : 'black' });
    }
    for (let i = 0; i < numFull; i++) {
        games.push({ seed: `b${batch}:f${i}`, opponentType: 'full', learnerSide: i % 2 === 0 ? 'red' : 'black' });
    }

    // Phase 1: Generate trajectories in parallel (workers use frozen params)
    const tGen = Date.now();
    const { trajectories, wins, games: totalGames } = await generateTrajectories(games);
    const genMs = Date.now() - tGen;

    // Phase 2: Process trajectories sequentially with TD-lambda (main thread)
    const tTD = Date.now();
    const { avgTDError, totalSteps } = processTrajectoriesTD(trajectories);
    const tdMs = Date.now() - tTD;

    // Phase 3: Adaptive LR
    const lrChanged = adaptLR(avgTDError);

    // Phase 4: Eval
    const tEval = Date.now();
    const vsFull = evalVs(params, FloodBotFull, EVAL_FULL / 2, `eval-full-b${batch}`);

    const FrozenBot = { name: 'Frozen', getMove: (s, p) => selectMove(s, p, frozenParams) };
    const vsChamp = evalVs(params, FrozenBot, 50, `eval-champ-b${batch}`);

    const vsRandom = evalVs(params, RandomBot, EVAL_RAND / 2, `eval-rand-b${batch}`);
    const evalMs = Date.now() - tEval;

    const fullWR = vsFull.winRate;
    const champWR = vsChamp.winRate;
    const randWR = vsRandom.winRate;
    const fullWilson = wilsonInterval(vsFull.aWins, vsFull.totalGames);

    // Save best
    let newBest = false;
    if (fullWR > bestVsFull) {
        bestVsFull = fullWR;
        fs.writeFileSync(path.join(checkpointDir, 'best.json'), JSON.stringify(serializeParams(params)));
        newBest = true;
    }
    fs.writeFileSync(path.join(checkpointDir, 'latest.json'), JSON.stringify(serializeParams(params)));

    // Ratchet AFTER eval
    frozenParams = new Float32Array(params);

    // Dashboard
    const genEntry = {
        gen: batch, at: new Date().toISOString(),
        selfplayMs: genMs, trainMs: tdMs, evalMs,
        policyLoss: avgTDError, valueLoss: lr, gradNorm: totalSteps, entropyBonus: 0,
        replayBufferSize: games.length,
        vsRandom: { wins: vsRandom.aWins, losses: vsRandom.bWins, ties: vsRandom.ties, total: vsRandom.totalGames, winRate: randWR, wilson: wilsonInterval(vsRandom.aWins, vsRandom.totalGames) },
        vsStatic: { wins: vsFull.aWins, losses: vsFull.bWins, ties: vsFull.ties, total: vsFull.totalGames, winRate: fullWR, wilson: fullWilson },
        vsChampion: { wins: vsChamp.aWins, losses: vsChamp.bWins, ties: vsChamp.ties, total: vsChamp.totalGames, winRate: champWR, wilson: wilsonInterval(vsChamp.aWins, vsChamp.totalGames), decision: newBest ? 'new_best' : 'continue' },
        promoted: newBest,
    };
    live.history.push(genEntry);
    live.generation = batch;
    if (newBest) live.events.push({ gen: batch, at: new Date().toISOString(), type: 'promotion', message: `New best: ${(100*fullWR).toFixed(1)}% vs FloodBotFull` });
    writeLive();

    const totalSec = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(
        `batch=${batch.toString().padStart(3)} ` +
        `total=${totalSec}s [gen=${(genMs/1000).toFixed(0)}s td=${(tdMs/1000).toFixed(0)}s eval=${(evalMs/1000).toFixed(0)}s] ` +
        `lr=${lr.toFixed(5)} tdErr=${avgTDError.toFixed(3)} ` +
        `vs-full=${vsFull.aWins}/${vsFull.totalGames} (${(100*fullWR).toFixed(1)}%) [${(100*fullWilson.lo).toFixed(0)}-${(100*fullWilson.hi).toFixed(0)}] ` +
        `vs-champ=${(100*champWR).toFixed(0)}% ` +
        `vs-rand=${(100*randWR).toFixed(0)}% ` +
        `best=${(100*bestVsFull).toFixed(1)}%` +
        `${newBest ? ' *BEST*' : ''}` +
        `${lrChanged ? ` lr→${lr.toFixed(5)}` : ''}`
    );

    if (batch > 5 && randWR < 0.70) {
        console.log(`\n⚠ vs-Random dropped to ${(100*randWR).toFixed(1)}% — stopping.`);
        break;
    }
}
console.log(`\nDone. Best vs FloodBotFull: ${(100*bestVsFull).toFixed(1)}%`);
};

run().catch(e => { console.error(e); process.exit(1); });
