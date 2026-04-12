#!/usr/bin/env node
// training/cli/train.mjs
// Main training loop. Runs generations of:
//   1. Self-play (mix of MCTS vs Static/Random/Self)
//   2. Training (minibatch SGD on gathered examples)
//   3. Eval (vs random, vs static, sprt vs champion)
//   4. Checkpoint save (if promoted)
// All metrics streamed to the dashboard via a shared state file + SSE.
//
// Usage:
//   node training/cli/train.mjs [configPath]

import fs from 'fs';
import path from 'path';
import {
    createParams,
    backward,
    sgdStep,
    adamStep,
    createAdamState,
    resetAdamState,
    PARAM_COUNT,
    serializeParams,
    deserializeParams
} from '../net/mlp.mjs';
import { playSelfPlayGame, makeMctsBot, playMatch } from '../selfplay/selfplay.mjs';
import { FloodBotStatic } from '../bot/tiers.mjs';
import { getLegalMoves } from '../engine/core.mjs';
import { evaluateChallenger, wilsonInterval, shouldPromote } from '../league/evaluate.mjs';
import { evaluateTriggers, applyChanges } from '../hyper/autoadjust.mjs';

const CONFIG_PATH = process.argv[2] ?? 'training/configs/fast.json';
// Mutable config: autoadjust may modify LR, mctsSims, dirichletAlpha, gradClip at runtime.
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

console.log(`\n=== Flood RL training ===`);
console.log(`Config: ${CONFIG_PATH}`);
console.log(`  ${config.description}\n`);

const checkpointDir = path.resolve(process.cwd(), config.checkpointDir);
if (!fs.existsSync(checkpointDir)) fs.mkdirSync(checkpointDir, { recursive: true });
const livePath = path.join(checkpointDir, 'live.json');
const latestPath = path.join(checkpointDir, 'latest.json');
const championPath = path.join(checkpointDir, 'champion.json');

// ---- Init params ----
// Champion is the best-confirmed model. Challenger = the model we train.
// If an existing champion.json is on disk (e.g. from a prior run or the
// heuristic warm-start), load it. Otherwise start from zero-init.
let championParams;
if (fs.existsSync(championPath)) {
    championParams = deserializeParams(JSON.parse(fs.readFileSync(championPath, 'utf8')));
    console.log(`Loaded existing champion from ${championPath}`);
} else {
    championParams = createParams(12345);
    fs.writeFileSync(championPath, JSON.stringify(serializeParams(championParams)));
    console.log('Initialized new champion from zero-init');
}
let challengerParams = new Float32Array(championParams);
const grads = new Float32Array(PARAM_COUNT);

// ---- Rolling replay buffer ----
// Accumulates (input, mask, policy, targetValue) tuples across multiple
// generations, trimmed to `config.replayCapacity`. This gives the training
// loop a much richer signal per generation (typical ~15-20k examples rather
// than ~3k) and lets each SGD/Adam step average over more positions.
const REPLAY_CAPACITY = config.replayCapacity ?? 16000;
let replayBuffer = [];

// ---- Adam optimizer state ----
// Only used when config.optimizer === 'adam'. Moments are zero-initialized
// and also reset whenever rollback fires (stale momentum would otherwise
// corrupt a freshly-reset challenger).
const useAdam = config.optimizer === 'adam';
const adamState = useAdam ? createAdamState() : null;
console.log(`Optimizer: ${useAdam ? 'adam' : 'sgd'}`);
console.log(`Replay buffer capacity: ${REPLAY_CAPACITY}`);

// ---- Baselines ----
const randomBot = {
    name: 'Random',
    getMove: (state, player) => {
        const legal = getLegalMoves(state, player);
        return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
    }
};

// ---- Live state written for the dashboard ----
const live = {
    config,
    generation: 0,
    startedAt: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
    history: [], // one entry per generation
    events: []   // autoadjust / promote events
};

const writeLive = () => {
    live.lastUpdate = new Date().toISOString();
    fs.writeFileSync(livePath, JSON.stringify(live, null, 2));
};
writeLive();

const chooseOpponent = (mix) => {
    const r = Math.random();
    let acc = 0;
    for (const [name, weight] of Object.entries(mix)) {
        acc += weight;
        if (r < acc) return name;
    }
    return Object.keys(mix)[0];
};

// ---- Training loop ----

const maxGen = config.maxGenerations ?? 50;
for (let gen = 0; gen < maxGen; gen++) {
    const t0 = Date.now();

    // Evaluate autoadjust triggers BEFORE this gen runs, based on history so far.
    // This lets us react to the last generation's metrics before burning compute.
    if (gen > 0) {
        const { changes, events } = evaluateTriggers(live, config);
        for (const ev of events) {
            live.events.push({ gen, at: new Date().toISOString(), type: ev.type, message: ev.message });
            console.log(`  [autoadjust] ${ev.type}: ${ev.message}`);
        }
        const rollback = changes.some(c => c.key === 'rollbackToChampion');
        if (rollback) {
            // Reset challenger to the current champion params (abandon divergent gradients)
            challengerParams = new Float32Array(championParams);
            // Discard buffered examples produced by the divergent policy — training
            // the reset challenger on stale targets would drag it right back.
            replayBuffer = [];
            // Zero Adam moments so we don't carry stale momentum into the recovery.
            if (useAdam) resetAdamState(adamState);
            console.log('  [rollback] challenger reset to champion, replay buffer cleared, Adam moments zeroed');
        }
        applyChanges(config, changes);
    }

    // ---- Self-play ----
    const championBot = makeMctsBot(championParams, {
        name: `Champion-gen${gen}`, numSimulations: config.mctsSims, cPuct: config.cPuct
    });
    const genExamples = [];
    let winsVsStatic = 0, lossesVsStatic = 0;
    let gamesVsStatic = 0;
    for (let i = 0; i < config.gamesPerGen; i++) {
        const type = chooseOpponent(config.opponentMix);
        const seed = `gen${gen}:game${i}:${type}`;
        const learnerPlayer = i % 2 === 0 ? 'red' : 'black';
        let opponent = null;
        if (type === 'static') opponent = FloodBotStatic;
        else if (type === 'random') opponent = randomBot;
        // 'self' leaves opponent = null (MCTS both sides with challenger params)
        const { examples, winner } = playSelfPlayGame({
            params: challengerParams,
            seed,
            numSimulations: config.mctsSims,
            cPuct: config.cPuct,
            dirichletAlpha: config.dirichletAlpha,
            dirichletWeight: config.dirichletWeight,
            temperatureMoves: config.temperatureMoves,
            opponent,
            learnerPlayer: opponent ? learnerPlayer : null
        });
        if (opponent === FloodBotStatic) {
            gamesVsStatic++;
            if (winner === learnerPlayer) winsVsStatic++;
            else if (winner) lossesVsStatic++;
        }
        genExamples.push(...examples);
    }
    const selfplayMs = Date.now() - t0;

    // ---- Add this gen's examples to the replay buffer (and trim oldest) ----
    replayBuffer.push(...genExamples);
    if (replayBuffer.length > REPLAY_CAPACITY) {
        replayBuffer.splice(0, replayBuffer.length - REPLAY_CAPACITY);
    }

    // ---- Training ----
    // Train over the REPLAY BUFFER (not just this gen's examples). An
    // index array is shuffled each epoch so the underlying buffer isn't
    // reordered (O(N) on a 16k-entry buffer is fine, but avoiding in-place
    // shuffles also keeps the oldest-is-first invariant clear).
    const t1 = Date.now();
    let totalPolicyLoss = 0, totalValueLoss = 0, totalEntropy = 0, steps = 0, gradNormSum = 0, gradNormCount = 0;
    const bufferIndices = new Int32Array(replayBuffer.length);
    for (let i = 0; i < replayBuffer.length; i++) bufferIndices[i] = i;

    for (let epoch = 0; epoch < (config.epochsPerGen ?? 2); epoch++) {
        // Shuffle index array (Fisher-Yates)
        for (let i = bufferIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = bufferIndices[i]; bufferIndices[i] = bufferIndices[j]; bufferIndices[j] = tmp;
        }
        // Minibatch via gradient accumulation
        const batchSize = config.batchSize ?? 32;
        for (let b = 0; b < bufferIndices.length; b += batchSize) {
            grads.fill(0);
            const end = Math.min(b + batchSize, bufferIndices.length);
            let batchSteps = 0;
            for (let k = b; k < end; k++) {
                const ex = replayBuffer[bufferIndices[k]];
                const { policyLoss, valueLoss, entropyBonus } = backward(
                    challengerParams,
                    grads,
                    ex.input,
                    ex.policy,
                    ex.targetValue,
                    ex.mask,
                    config.entropyCoeff ?? 0.01,
                    config.valueCoeff ?? 1.5
                );
                totalPolicyLoss += policyLoss;
                totalValueLoss += valueLoss;
                totalEntropy += entropyBonus;
                batchSteps += 1;
            }
            if (batchSteps > 0) {
                const scale = 1 / batchSteps;
                for (let i = 0; i < PARAM_COUNT; i++) grads[i] *= scale;
                const lr = config.learningRate ?? (useAdam ? 3e-4 : 5e-3);
                const clipOpts = { gradClip: config.gradClip ?? 1.0 };
                const { gradNorm } = useAdam
                    ? adamStep(challengerParams, grads, lr, adamState, {
                        beta1: config.adamBeta1 ?? 0.9,
                        beta2: config.adamBeta2 ?? 0.999,
                        eps: config.adamEps ?? 1e-8,
                        ...clipOpts
                    })
                    : sgdStep(challengerParams, grads, lr, clipOpts);
                gradNormSum += gradNorm;
                gradNormCount += 1;
            }
            steps += batchSteps;
        }
    }
    const trainMs = Date.now() - t1;

    // ---- Eval ----
    const t2 = Date.now();
    const challengerBot = makeMctsBot(challengerParams, {
        name: `Challenger-gen${gen}`, numSimulations: config.mctsSims, cPuct: config.cPuct
    });
    const vsRandom = playMatch(challengerBot, randomBot, Math.floor(config.evalGamesVsRandom / 2), { seedPrefix: `eval-r-gen${gen}` });
    const vsStatic = playMatch(challengerBot, FloodBotStatic, Math.floor(config.evalGamesVsStatic / 2), { seedPrefix: `eval-s-gen${gen}` });
    const vsChampion = evaluateChallenger(challengerBot, championBot, {
        minGames: config.promoSprtMin,
        maxGames: config.promoSprtMax,
        seedPrefix: `promo-gen${gen}`
    });
    const evalMs = Date.now() - t2;

    // ---- Promotion decision ----
    let promoted = false;
    const vsRandomWR = vsRandom.aWins / vsRandom.totalGames;
    const vsStaticWR = vsStatic.aWins / vsStatic.totalGames;
    if (shouldPromote(vsChampion, { winRateFloor: 0.60 }) && vsRandomWR >= 0.85) {
        championParams = new Float32Array(challengerParams);
        fs.writeFileSync(championPath, JSON.stringify(serializeParams(championParams)));
        promoted = true;
        live.events.push({
            gen, at: new Date().toISOString(),
            type: 'promotion',
            message: `New champion: ${vsChampion.winRate.toFixed(3)} vs prev, ${vsRandomWR.toFixed(3)} vs random`
        });
    } else if (vsChampion.decision !== 'continue') {
        live.events.push({
            gen, at: new Date().toISOString(),
            type: 'rejected',
            message: `Challenger rejected: sprt=${vsChampion.decision}, vs-prev ${vsChampion.winRate.toFixed(3)}, vs-rand ${vsRandomWR.toFixed(3)}`
        });
        // NOTE: do NOT reset challenger to champion on SPRT rejection.
        // Keep accumulating gradients across rejected gens so the replay buffer
        // actually builds useful learning over multiple generations. The
        // autoadjust rollback trigger (vs-random drop >10% from peak) remains
        // the hard safety net for genuine divergence.
    }

    // ---- Save latest ----
    fs.writeFileSync(latestPath, JSON.stringify(serializeParams(challengerParams)));

    // ---- Record gen ----
    const avgPolicy = totalPolicyLoss / Math.max(1, steps);
    const avgValue = totalValueLoss / Math.max(1, steps);
    const avgEntropy = totalEntropy / Math.max(1, steps);
    const avgGradNorm = gradNormSum / Math.max(1, gradNormCount);
    const genEntry = {
        gen,
        at: new Date().toISOString(),
        selfplayMs, trainMs, evalMs,
        policyLoss: avgPolicy, valueLoss: avgValue, entropyBonus: avgEntropy,
        gradNorm: avgGradNorm,
        replayBufferSize: replayBuffer.length,
        vsRandom: { wins: vsRandom.aWins, losses: vsRandom.bWins, ties: vsRandom.ties, total: vsRandom.totalGames, winRate: vsRandomWR, wilson: wilsonInterval(vsRandom.aWins, vsRandom.totalGames) },
        vsStatic: { wins: vsStatic.aWins, losses: vsStatic.bWins, ties: vsStatic.ties, total: vsStatic.totalGames, winRate: vsStaticWR, wilson: wilsonInterval(vsStatic.aWins, vsStatic.totalGames) },
        vsChampion: { wins: vsChampion.aWins, losses: vsChampion.bWins, ties: vsChampion.ties, total: vsChampion.totalGames, winRate: vsChampion.winRate, decision: vsChampion.decision },
        winsVsStaticDuringSelfplay: { wins: winsVsStatic, losses: lossesVsStatic, total: gamesVsStatic },
        promoted
    };
    live.history.push(genEntry);
    live.generation = gen;
    writeLive();

    console.log(
        `gen=${gen.toString().padStart(2)} ` +
        `time=${((Date.now() - t0) / 1000).toFixed(1)}s ` +
        `buf=${replayBuffer.length}/${REPLAY_CAPACITY} ` +
        `pLoss=${avgPolicy.toFixed(2)} vLoss=${avgValue.toFixed(3)} ` +
        `vs-random=${vsRandom.aWins}/${vsRandom.totalGames} (${(100 * vsRandomWR).toFixed(0)}%) ` +
        `vs-static=${vsStatic.aWins}/${vsStatic.totalGames} (${(100 * vsStaticWR).toFixed(0)}%) ` +
        `vs-champ=${vsChampion.aWins}/${vsChampion.totalGames} (${(100 * vsChampion.winRate).toFixed(0)}%) [${vsChampion.decision}]` +
        `${promoted ? ' *PROMOTED*' : ''}`
    );
}

console.log('\nTraining complete. Latest checkpoint:', latestPath);
console.log('Champion checkpoint:', championPath);
