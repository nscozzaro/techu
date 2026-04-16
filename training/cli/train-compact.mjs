#!/usr/bin/env node
// training/cli/train-compact.mjs
// Search-guided training for the compact 116-feature value net.
//
// Pipeline:
//   1. Generate teacher-labeled states in parallel across all CPU cores.
//   2. Train the compact value net with Adam on those states.
//   3. Periodically evaluate the compact search bot vs Random/Static/Full
//      plus a frozen-copy benchmark and fixed regression suites.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import {
    createParams,
    forward,
    backwardValue,
    adamStep,
    createAdamState,
    serializeParams,
    deserializeParams,
    PARAM_COUNT
} from '../td/cnn-network.mjs';
import { makeCompactSearchBot, COMPACT_SEARCH_CONFIG } from '../compact/bot.mjs';
import { FloodBotStatic, FloodBotFull } from '../bot/tiers.mjs';
import { playMatch } from '../selfplay/selfplay.mjs';
import { getLegalMoves } from '../engine/core.mjs';
import { wilsonInterval } from '../league/evaluate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_PATH = path.join(__dirname, '../compact/worker.mjs');

const CONFIG_PATH = process.argv[2] ?? 'training/configs/compact.json';
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const checkpointDir = path.resolve(process.cwd(), config.checkpointDir ?? 'training/checkpoints');
if (!fs.existsSync(checkpointDir)) fs.mkdirSync(checkpointDir, { recursive: true });

const livePath = path.join(checkpointDir, 'live.json');
const latestPath = path.join(checkpointDir, 'compact-latest.json');
const bestPath = path.join(checkpointDir, 'compact-best.json');
const deployPath = path.resolve(process.cwd(), config.deployPath ?? 'flood-compact-model.json');

const numWorkers = config.numWorkers ?? os.cpus().length;

const randomBot = {
    name: 'Random',
    getMove: (state, player) => {
        const legal = getLegalMoves(state, player);
        return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
    }
};

const serializeCompactCheckpoint = (params, extra = {}) => ({
    ...serializeParams(params),
    type: 'compact-value',
    metadata: {
        leafScale: config.inference?.leafScale ?? COMPACT_SEARCH_CONFIG.leafScale,
        leafBlend: config.inference?.leafBlend ?? COMPACT_SEARCH_CONFIG.leafBlend,
        targetScale: config.targetScale,
        generatedAt: new Date().toISOString(),
        configPath: CONFIG_PATH,
        ...extra
    }
});

const writeJson = (targetPath, value) => {
    fs.writeFileSync(targetPath, JSON.stringify(value, null, 2));
};

const loadStartingParams = () => {
    const startPath = config.startFrom ? path.resolve(process.cwd(), config.startFrom) : null;
    if (startPath && fs.existsSync(startPath)) {
        console.log(`Loaded starting checkpoint from ${startPath}`);
        return deserializeParams(JSON.parse(fs.readFileSync(startPath, 'utf8')));
    }
    return createParams(20260415);
};

const params = loadStartingParams();
const frozenParams = new Float32Array(params);
const grads = new Float32Array(PARAM_COUNT);
const adamState = createAdamState();

const live = {
    mode: 'compact-value',
    config,
    phase: 'init',
    generation: 0,
    startedAt: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
    dataset: null,
    history: [],
    events: [],
    best: null,
    evalProgress: null
};

const writeLive = () => {
    live.lastUpdate = new Date().toISOString();
    writeJson(livePath, live);
};

const addEvent = (type, message, extra = {}) => {
    live.events.push({
        type,
        at: new Date().toISOString(),
        gen: live.generation,
        message,
        ...extra
    });
    writeLive();
};

const allocateCounts = (total, mix) => {
    const entries = Object.entries(mix);
    const counts = {};
    let assigned = 0;
    entries.forEach(([key, weight], index) => {
        const count = index === entries.length - 1
            ? total - assigned
            : Math.round(total * weight);
        counts[key] = count;
        assigned += count;
    });
    return counts;
};

const buildGameSpecs = () => {
    const counts = allocateCounts(config.datasetGames, config.datasetMix);
    const specs = [];
    let index = 0;
    const pushGames = (count, opponentType, teacherSideMode, prefix = opponentType) => {
        for (let i = 0; i < count; i++) {
            specs.push({
                seed: `compact:${prefix}:${i}`,
                opponentType,
                teacherSide: teacherSideMode === 'alternate' ? (index++ % 2 === 0 ? 'red' : 'black') : null
            });
        }
    };
    // teacherSelf uses `teacherSide: null`; opponentType is ignored when teacher controls both sides.
    pushGames(counts.teacherSelf ?? 0, 'random', 'self', 'self');
    pushGames(counts.vsFull ?? 0, 'full', 'alternate');
    pushGames(counts.vsStatic ?? 0, 'static', 'alternate');
    pushGames(counts.vsRandom ?? 0, 'random', 'alternate');
    return specs;
};

const generateDataset = async () => {
    live.phase = 'dataset';
    const datasetStartedAt = Date.now();
    live.dataset = {
        plannedGames: config.datasetGames,
        workers: numWorkers,
        gamesPlayed: 0,
        totalTurns: 0,
        positions: 0,
        teacherSamples: 0,
        avgTeacherDepth: 0,
        avgRawScore: 0,
        startedAt: new Date(datasetStartedAt).toISOString(),
        elapsedMs: 0,
        progress: 0
    };
    writeLive();

    const games = buildGameSpecs();
    const actualWorkers = Math.min(numWorkers, Math.max(1, games.length));
    const batches = Array.from({ length: actualWorkers }, () => []);
    const progressByWorker = Array.from({ length: actualWorkers }, () => ({
        gamesPlayed: 0,
        totalTurns: 0,
        positions: 0,
        teacherSamples: 0,
        avgTeacherDepth: 0,
        avgRawScore: 0
    }));
    for (let i = 0; i < games.length; i++) {
        batches[i % actualWorkers].push(games[i]);
    }

    const updateDatasetProgress = () => {
        let gamesPlayed = 0;
        let totalTurns = 0;
        let positionsCount = 0;
        let teacherSamples = 0;
        let depthWeighted = 0;
        let scoreWeighted = 0;

        for (const progress of progressByWorker) {
            gamesPlayed += progress.gamesPlayed;
            totalTurns += progress.totalTurns;
            positionsCount += progress.positions;
            teacherSamples += progress.teacherSamples;
            depthWeighted += progress.avgTeacherDepth * progress.teacherSamples;
            scoreWeighted += progress.avgRawScore * progress.teacherSamples;
        }

        const elapsedMs = Date.now() - datasetStartedAt;
        const progress = config.datasetGames > 0 ? gamesPlayed / config.datasetGames : 0;
        const etaMs = progress > 0 && progress < 1
            ? Math.max(0, elapsedMs * ((1 / progress) - 1))
            : 0;

        live.dataset = {
            ...live.dataset,
            plannedGames: config.datasetGames,
            workers: actualWorkers,
            gamesPlayed,
            totalTurns,
            positions: positionsCount,
            teacherSamples,
            avgTeacherDepth: teacherSamples ? depthWeighted / teacherSamples : 0,
            avgRawScore: teacherSamples ? scoreWeighted / teacherSamples : 0,
            elapsedMs,
            etaMs,
            progress
        };
        writeLive();
    };

    const workerPromises = batches.map((batch, workerIndex) => new Promise((resolve, reject) => {
        const worker = new Worker(WORKER_PATH, {
            workerData: {
                games: batch,
                teacherConfig: config.teacherSearch,
                minTeacherDepth: config.minTeacherDepth ?? 2,
                targetScale: config.targetScale ?? 480
            }
        });
        worker.on('message', (message) => {
            if (message?.type === 'progress') {
                progressByWorker[workerIndex] = {
                    gamesPlayed: message.gamesPlayed ?? 0,
                    totalTurns: message.totalTurns ?? 0,
                    positions: message.positions ?? 0,
                    teacherSamples: message.teacherSamples ?? 0,
                    avgTeacherDepth: message.avgTeacherDepth ?? 0,
                    avgRawScore: message.avgRawScore ?? 0
                };
                updateDatasetProgress();
                return;
            }
            if (message?.type === 'done') {
                progressByWorker[workerIndex] = {
                    gamesPlayed: message.gamesPlayed ?? 0,
                    totalTurns: message.totalTurns ?? 0,
                    positions: message.positions?.length ?? 0,
                    teacherSamples: message.teacherSamples ?? 0,
                    avgTeacherDepth: message.avgTeacherDepth ?? 0,
                    avgRawScore: message.avgRawScore ?? 0
                };
                updateDatasetProgress();
                resolve(message);
            }
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Dataset worker exited with code ${code}`));
        });
    }));

    const results = await Promise.all(workerPromises);
    const positions = [];
    let gamesPlayed = 0;
    let totalTurns = 0;
    let teacherSamples = 0;
    let depthWeighted = 0;
    let scoreWeighted = 0;

    for (const result of results) {
        positions.push(...result.positions);
        gamesPlayed += result.gamesPlayed;
        totalTurns += result.totalTurns;
        teacherSamples += result.teacherSamples;
        depthWeighted += result.avgTeacherDepth * result.teacherSamples;
        scoreWeighted += result.avgRawScore * result.teacherSamples;
    }

    live.dataset = {
        plannedGames: config.datasetGames,
        gamesPlayed,
        totalTurns,
        positions: positions.length,
        teacherSamples,
        avgTeacherDepth: teacherSamples ? depthWeighted / teacherSamples : 0,
        avgRawScore: teacherSamples ? scoreWeighted / teacherSamples : 0,
        workers: actualWorkers,
        elapsedMs: Date.now() - datasetStartedAt,
        etaMs: 0,
        progress: 1
    };
    writeLive();
    return positions;
};

const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
};

const splitDataset = (positions) => {
    const indices = Array.from({ length: positions.length }, (_, i) => i);
    shuffle(indices);
    const valCount = Math.max(1, Math.floor(indices.length * (config.validationFraction ?? 0.1)));
    return {
        trainIndices: indices.slice(valCount),
        valIndices: indices.slice(0, valCount)
    };
};

const evaluateValidation = (positions, valIndices) => {
    let mse = 0;
    let mae = 0;
    for (const idx of valIndices) {
        const { value } = forward(params, positions[idx].input);
        const error = value - positions[idx].targetValue;
        mse += error * error;
        mae += Math.abs(error);
    }
    return {
        rmse: Math.sqrt(mse / Math.max(1, valIndices.length)),
        mae: mae / Math.max(1, valIndices.length)
    };
};

const wrapMatch = (match) => {
    const adjustedWins = match.aWins + match.ties * 0.5;
    const winRate = adjustedWins / Math.max(1, match.totalGames);
    return {
        ...match,
        winRate,
        wilson: wilsonInterval(adjustedWins, match.totalGames)
    };
};

const evaluateBot = () => {
    live.phase = 'eval';
    live.evalProgress = null;
    writeLive();

    const compactBot = makeCompactSearchBot(params, config.inference ?? COMPACT_SEARCH_CONFIG);
    const frozenBot = makeCompactSearchBot(frozenParams, config.inference ?? COMPACT_SEARCH_CONFIG);

    const runBenchmark = (label, index, total, fn) => {
        live.evalProgress = { label, index, total };
        writeLive();
        return fn();
    };

    const vsRandom = wrapMatch(runBenchmark('vs Random', 1, 6, () =>
        playMatch(compactBot, randomBot, config.evalPairsRandom, { seedPrefix: 'compact-eval-random' })
    ));
    const vsStatic = wrapMatch(runBenchmark('vs FloodBotStatic', 2, 6, () =>
        playMatch(compactBot, FloodBotStatic, config.evalPairsStatic, { seedPrefix: 'compact-eval-static' })
    ));
    const vsFull = wrapMatch(runBenchmark('vs FloodBotFull', 3, 6, () =>
        playMatch(compactBot, FloodBotFull, config.evalPairsFull, { seedPrefix: 'compact-eval-full' })
    ));
    const vsFrozen = wrapMatch(runBenchmark('vs Frozen Copy', 4, 6, () =>
        playMatch(compactBot, frozenBot, config.evalPairsFrozen, { seedPrefix: 'compact-eval-frozen' })
    ));

    const suiteStatic = wrapMatch(runBenchmark('suite vs Static', 5, 6, () =>
        playMatch(compactBot, FloodBotStatic, config.stopPairsStatic, { seedPrefix: 'compact-suite-static' })
    ));
    const suiteFull = wrapMatch(runBenchmark('suite vs Full', 6, 6, () =>
        playMatch(compactBot, FloodBotFull, config.stopPairsFull, { seedPrefix: 'compact-suite-full' })
    ));

    live.evalProgress = null;
    writeLive();

    return {
        vsRandom,
        vsStatic,
        vsFull,
        vsFrozen,
        suites: {
            static: suiteStatic,
            full: suiteFull
        },
        stopConditionMet:
            suiteStatic.winRate >= (config.stopTargets?.vsStatic ?? 1) &&
            suiteFull.winRate >= (config.stopTargets?.vsFull ?? 1)
    };
};

const isBetterEvaluation = (candidate, best) => {
    if (!best) return true;
    const rank = (evalResult) => [
        evalResult.suites.full.winRate,
        evalResult.suites.static.winRate,
        evalResult.vsFull.winRate,
        evalResult.vsStatic.winRate,
        evalResult.vsFrozen.winRate,
        evalResult.vsRandom.winRate
    ];
    const a = rank(candidate);
    const b = rank(best);
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
};

const main = async () => {
    console.log(`\n=== Flood compact value training ===`);
    console.log(`Config: ${CONFIG_PATH}`);
    console.log(`Dataset games: ${config.datasetGames} | Epochs: ${config.epochs} | Workers: ${numWorkers}\n`);

    writeLive();
    const datasetStartedAt = Date.now();
    const positions = await generateDataset();
    const datasetMs = Date.now() - datasetStartedAt;
    if (positions.length < 100) {
        throw new Error(`Too few training positions generated (${positions.length})`);
    }

    const { trainIndices, valIndices } = splitDataset(positions);
    const trainBatchSize = config.batchSize ?? 128;
    const bestState = {
        params: new Float32Array(params),
        evaluation: null
    };

    addEvent('dataset', `Generated ${positions.length} labeled positions from ${config.datasetGames} games in ${(datasetMs / 1000).toFixed(1)}s`);

    const getLR = (epoch) => {
        const lrMax = config.learningRate;
        const lrMin = config.lrMin ?? lrMax * 0.06;
        if (config.lrSchedule === 'cosine') {
            return lrMin + 0.5 * (lrMax - lrMin) * (1 + Math.cos(Math.PI * (epoch - 1) / config.epochs));
        }
        return lrMax;
    };

    for (let epoch = 1; epoch <= config.epochs; epoch++) {
        live.phase = 'train';
        live.generation = epoch;
        writeLive();

        const epochStartedAt = Date.now();
        const lr = getLR(epoch);
        shuffle(trainIndices);

        let trainLoss = 0;
        let trainMae = 0;
        let steps = 0;

        for (let start = 0; start < trainIndices.length; start += trainBatchSize) {
            grads.fill(0);
            const end = Math.min(start + trainBatchSize, trainIndices.length);
            let batchCount = 0;
            for (let cursor = start; cursor < end; cursor++) {
                const pos = positions[trainIndices[cursor]];
                const { loss, error } = backwardValue(params, grads, pos.input, pos.targetValue, {
                    loss: config.loss ?? 'huber',
                    huberDelta: config.huberDelta ?? 0.75
                });
                trainLoss += loss;
                trainMae += Math.abs(error);
                batchCount += 1;
            }
            if (batchCount > 0) {
                for (let i = 0; i < PARAM_COUNT; i++) grads[i] /= batchCount;
                adamStep(params, grads, lr, adamState, {
                    gradClip: config.gradClip ?? 1.0,
                    weightDecay: config.weightDecay ?? 0
                });
                steps += batchCount;
            }
        }

        const val = evaluateValidation(positions, valIndices);
        const epochMs = Date.now() - epochStartedAt;
        const shouldEval =
            epoch === 1 ||
            epoch === config.epochs ||
            epoch % (config.evalEvery ?? 5) === 0;

        let evaluation = live.history[live.history.length - 1]?.evaluation ?? null;
        let promoted = false;

        if (shouldEval) {
            evaluation = evaluateBot();
            if (isBetterEvaluation(evaluation, bestState.evaluation)) {
                bestState.params = new Float32Array(params);
                bestState.evaluation = evaluation;
                promoted = true;
                writeJson(bestPath, serializeCompactCheckpoint(bestState.params, {
                    evaluation,
                    epoch
                }));
                writeJson(deployPath, serializeCompactCheckpoint(bestState.params, {
                    evaluation,
                    epoch,
                    deployed: true
                }));
                live.best = {
                    epoch,
                    vsFull: evaluation.vsFull.winRate,
                    vsStatic: evaluation.vsStatic.winRate,
                    suiteFull: evaluation.suites.full.winRate,
                    suiteStatic: evaluation.suites.static.winRate
                };
                addEvent('promotion', `New best at epoch ${epoch}: ${(100 * evaluation.vsFull.winRate).toFixed(1)}% vs FloodBotFull, ${(100 * evaluation.vsStatic.winRate).toFixed(1)}% vs FloodBotStatic`);
            }
            if (evaluation.stopConditionMet) {
                addEvent('stop', `Stop suite reached at epoch ${epoch}: ${(100 * evaluation.suites.full.winRate).toFixed(1)}% vs Full suite, ${(100 * evaluation.suites.static.winRate).toFixed(1)}% vs Static suite`);
            }
        }

        writeJson(latestPath, serializeCompactCheckpoint(params, {
            epoch,
            validation: val,
            evaluation
        }));

        live.history.push({
            epoch,
            trainLoss: trainLoss / Math.max(1, steps),
            trainMae: trainMae / Math.max(1, steps),
            valRmse: val.rmse,
            valMae: val.mae,
            datasetPositions: positions.length,
            datasetGames: config.datasetGames,
            teacherSamples: live.dataset?.teacherSamples ?? positions.length,
            avgTeacherDepth: live.dataset?.avgTeacherDepth ?? 0,
            datasetMs,
            epochMs,
            evaluation,
            promoted,
            stopConditionMet: evaluation?.stopConditionMet ?? false
        });
        writeLive();

        console.log(
            `epoch ${String(epoch).padStart(3)} | ` +
            `trainLoss=${(trainLoss / Math.max(1, steps)).toFixed(4)} ` +
            `trainMae=${(trainMae / Math.max(1, steps)).toFixed(4)} ` +
            `valRmse=${val.rmse.toFixed(4)} ` +
            `valMae=${val.mae.toFixed(4)} ` +
            `${evaluation ? `| full=${(100 * evaluation.vsFull.winRate).toFixed(1)}% static=${(100 * evaluation.vsStatic.winRate).toFixed(1)}% frozen=${(100 * evaluation.vsFrozen.winRate).toFixed(1)}% suiteFull=${(100 * evaluation.suites.full.winRate).toFixed(1)}%` : ''}`
        );

        if (evaluation?.stopConditionMet) {
            break;
        }
    }

    live.phase = 'done';
    writeLive();

    console.log(`\nLatest checkpoint: ${latestPath}`);
    console.log(`Best checkpoint:   ${bestPath}`);
    console.log(`Deploy path:       ${deployPath}`);
    console.log(`Live metrics:      ${livePath}`);
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
