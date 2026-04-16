#!/usr/bin/env node
// training/cli/train-selfplay.mjs
// Self-play value learning for the compact CNN.
//
// Unlike search distillation (train-compact.mjs), targets come from
// actual game outcomes — not teacher labels — so the model can learn
// to exceed the teacher's strength.
//
// Pipeline per generation:
//   1. Play self-play games (CNN search bot vs frozen copy).
//   2. Label each position with the game outcome.
//   3. Train the CNN on outcome labels with Adam + cosine LR.
//   4. Evaluate vs Random / Static / Full / Frozen.
//   5. If improved, promote and freeze the new params.

import fs from 'fs';
import path from 'path';
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
import { INPUT_SIZE, encodeState } from '../td/encode.mjs';
import { makeCompactSearchBot, COMPACT_SEARCH_CONFIG } from '../compact/bot.mjs';
import { FloodBotStatic, FloodBotFull } from '../bot/tiers.mjs';
import { playMatch } from '../selfplay/selfplay.mjs';
import { newGame, applyMove, isTerminal, getWinner, getLegalMoves } from '../engine/core.mjs';
import { wilsonInterval } from '../league/evaluate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = process.argv[2] ?? 'training/configs/selfplay.json';
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const checkpointDir = path.resolve(process.cwd(), config.checkpointDir ?? 'training/checkpoints');
if (!fs.existsSync(checkpointDir)) fs.mkdirSync(checkpointDir, { recursive: true });

const livePath = path.join(checkpointDir, 'live.json');
const bestPath = path.join(checkpointDir, 'compact-best.json');
const deployPath = path.resolve(process.cwd(), config.deployPath ?? 'flood-compact-model.json');

const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));

const randomBot = {
    name: 'Random',
    getMove: (state, player) => {
        const legal = getLegalMoves(state, player);
        return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
    }
};

const serializeCheckpoint = (params, extra = {}) => ({
    ...serializeParams(params),
    type: 'cnn-value',
    metadata: {
        leafScale: config.inference?.leafScale ?? COMPACT_SEARCH_CONFIG.leafScale,
        leafBlend: config.inference?.leafBlend ?? COMPACT_SEARCH_CONFIG.leafBlend,
        trainingMode: 'selfplay',
        generatedAt: new Date().toISOString(),
        ...extra
    }
});

// ====== Self-play data generation ======

const playSelfPlayGames = (params, frozenParams, numGames, genIndex, liveRef = null) => {
    const bot = makeCompactSearchBot(params, config.inference ?? COMPACT_SEARCH_CONFIG);
    const frozenBot = makeCompactSearchBot(frozenParams, config.inference ?? COMPACT_SEARCH_CONFIG);
    const positions = [];
    let totalTurns = 0;
    let wins = 0, losses = 0, draws = 0;

    for (let g = 0; g < numGames; g++) {
        if (g % 10 === 0) {
            process.stdout.write(`\r  self-play: ${g}/${numGames} games (${positions.length} positions)   `);
            if (liveRef) {
                liveRef.dataset = {
                    ...liveRef.dataset,
                    gamesPlayed: g,
                    positions: positions.length,
                    progress: g / numGames
                };
                writeJson(livePath, liveRef);
            }
        }
        const seed = `sp:${genIndex}:${g}`;
        // Alternate sides: even games bot is red, odd games bot is black
        const botIsRed = g % 2 === 0;
        const redBot = botIsRed ? bot : frozenBot;
        const blackBot = botIsRed ? frozenBot : bot;
        const botColor = botIsRed ? 'red' : 'black';

        const state = newGame({ seed });
        const gamePositions = [];
        let turns = 0;
        const MAX_TURNS = 300;

        while (!isTerminal(state) && state.gamePhase !== 'ended' && turns < MAX_TURNS) {
            const player = state.currentPlayer;

            // Record position for training (both sides — the CNN learns from all perspectives)
            if (state.gamePhase === 'playing') {
                const input = encodeState(state, player);
                const { value: selfEval } = forward(params, input);
                gamePositions.push({
                    input,
                    perspective: player,
                    selfEval // model's own assessment at time of play
                });
            }

            const currentBot = player === 'red' ? redBot : blackBot;
            const move = currentBot.getMove(state, player);
            if (!move) break;
            applyMove(state, move);
            turns += 1;
        }

        const winner = getWinner(state);
        // Label positions: blend game outcome with model's own eval for smoother targets.
        // Pure outcomes (+1/-1) are very noisy in a stochastic card game.
        // Blending with selfEval provides a per-position signal that reduces variance
        // while still grounding in the actual game result.
        const outcomeBlend = config.outcomeBlend ?? 0.7; // 70% outcome, 30% self-eval
        for (const pos of gamePositions) {
            const outcome = winner === null ? 0 : (winner === pos.perspective ? 1 : -1);
            pos.targetValue = outcomeBlend * outcome + (1 - outcomeBlend) * pos.selfEval;
        }
        positions.push(...gamePositions);
        totalTurns += turns;

        if (winner === botColor) wins++;
        else if (winner === null) draws++;
        else losses++;
    }

    return { positions, totalTurns, wins, losses, draws };
};

// ====== Training ======

const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
};

const wrapMatch = (match) => {
    const adjustedWins = match.aWins + match.ties * 0.5;
    const winRate = adjustedWins / Math.max(1, match.totalGames);
    return { ...match, winRate, wilson: wilsonInterval(adjustedWins, match.totalGames) };
};

const evaluateBot = (params, frozenParams) => {
    const bot = makeCompactSearchBot(params, config.inference ?? COMPACT_SEARCH_CONFIG);
    const frozenBot = makeCompactSearchBot(frozenParams, config.inference ?? COMPACT_SEARCH_CONFIG);

    const vsRandom = wrapMatch(playMatch(bot, randomBot, config.evalPairsRandom ?? 10, { seedPrefix: 'sp-eval-random' }));
    const vsStatic = wrapMatch(playMatch(bot, FloodBotStatic, config.evalPairsStatic ?? 10, { seedPrefix: 'sp-eval-static' }));
    const vsFull = wrapMatch(playMatch(bot, FloodBotFull, config.evalPairsFull ?? 15, { seedPrefix: 'sp-eval-full' }));
    const vsFrozen = wrapMatch(playMatch(bot, frozenBot, config.evalPairsFrozen ?? 10, { seedPrefix: 'sp-eval-frozen' }));

    return { vsRandom, vsStatic, vsFull, vsFrozen };
};

// ====== Main loop ======

const main = () => {
    console.log(`\n=== Flood CNN self-play training ===`);
    console.log(`Config: ${CONFIG_PATH}`);

    // Load warm-start checkpoint
    const startPath = config.startFrom
        ? path.resolve(process.cwd(), config.startFrom)
        : bestPath;
    let params;
    if (fs.existsSync(startPath)) {
        const checkpoint = JSON.parse(fs.readFileSync(startPath, 'utf8'));
        params = deserializeParams(checkpoint);
        console.log(`Warm start from ${startPath} (${PARAM_COUNT} params)`);
    } else {
        params = createParams(20260415);
        console.log(`No checkpoint found, starting fresh`);
    }

    const generations = config.generations ?? 10;
    const gamesPerGen = config.gamesPerGeneration ?? 200;
    const epochsPerGen = config.epochsPerGeneration ?? 8;
    const batchSize = config.batchSize ?? 64;
    const baseLR = config.learningRate ?? 0.0004;
    const lrMin = config.lrMin ?? 0.00005;

    let frozenParams = new Float32Array(params);
    let adamState = createAdamState();
    const grads = new Float32Array(PARAM_COUNT);
    let bestEval = null;

    const live = {
        mode: 'selfplay',
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
    const writeLive = () => { live.lastUpdate = new Date().toISOString(); writeJson(livePath, live); };

    // Initial evaluation
    console.log('Initial evaluation...');
    live.phase = 'eval';
    writeLive();
    const initialEval = evaluateBot(params, frozenParams);
    console.log(`  initial: full=${(initialEval.vsFull.winRate * 100).toFixed(0)}% static=${(initialEval.vsStatic.winRate * 100).toFixed(0)}%`);
    bestEval = initialEval;

    for (let gen = 1; gen <= generations; gen++) {
        live.generation = gen;

        // --- Self-play data generation ---
        live.phase = 'dataset';
        live.dataset = { plannedGames: gamesPerGen, gamesPlayed: 0, positions: 0, progress: 0 };
        writeLive();

        console.log(`\n--- Generation ${gen} ---`);
        const genStart = Date.now();
        const { positions, totalTurns, wins, losses, draws } = playSelfPlayGames(params, frozenParams, gamesPerGen, gen, live);
        process.stdout.write('\r' + ' '.repeat(70) + '\r');
        const genMs = Date.now() - genStart;

        live.dataset = {
            plannedGames: gamesPerGen,
            gamesPlayed: gamesPerGen,
            positions: positions.length,
            progress: 1,
            elapsedMs: genMs,
            etaMs: 0,
            vsFrozen: `${wins}W ${draws}D ${losses}L`
        };
        writeLive();

        console.log(`  games: ${gamesPerGen} (${wins}W ${draws}D ${losses}L vs frozen) | positions: ${positions.length} | ${(genMs / 1000).toFixed(1)}s`);

        if (positions.length < 50) {
            console.log('  too few positions, skipping training');
            continue;
        }

        // --- Training epochs ---
        live.phase = 'train';
        writeLive();

        const indices = Array.from({ length: positions.length }, (_, i) => i);
        const valCount = Math.max(1, Math.floor(positions.length * 0.1));
        shuffle(indices);
        const valIndices = indices.slice(0, valCount);
        const trainIndices = indices.slice(valCount);

        const getLR = (epoch) => {
            return lrMin + 0.5 * (baseLR - lrMin) * (1 + Math.cos(Math.PI * (epoch - 1) / epochsPerGen));
        };

        for (let epoch = 1; epoch <= epochsPerGen; epoch++) {
            const lr = getLR(epoch);
            shuffle(trainIndices);
            let trainLoss = 0, steps = 0;

            for (let start = 0; start < trainIndices.length; start += batchSize) {
                grads.fill(0);
                const end = Math.min(start + batchSize, trainIndices.length);
                let count = 0;
                for (let c = start; c < end; c++) {
                    const pos = positions[trainIndices[c]];
                    const { loss } = backwardValue(params, grads, pos.input, pos.targetValue, {
                        loss: config.loss ?? 'huber',
                        huberDelta: config.huberDelta ?? 1.0
                    });
                    trainLoss += loss;
                    count++;
                }
                if (count > 0) {
                    for (let i = 0; i < PARAM_COUNT; i++) grads[i] /= count;
                    adamStep(params, grads, lr, adamState, {
                        gradClip: config.gradClip ?? 1.0,
                        weightDecay: config.weightDecay ?? 0.0001
                    });
                    steps += count;
                }
            }

            // Validation
            let valLoss = 0;
            for (const vi of valIndices) {
                const pos = positions[vi];
                const { value } = forward(params, pos.input);
                const err = value - pos.targetValue;
                valLoss += err * err;
            }
            const valRmse = Math.sqrt(valLoss / Math.max(1, valIndices.length));

            if (epoch === 1 || epoch === epochsPerGen) {
                console.log(`  epoch ${epoch}/${epochsPerGen} | lr=${lr.toFixed(6)} | loss=${(trainLoss / Math.max(1, steps)).toFixed(4)} | valRmse=${valRmse.toFixed(4)}`);
            }
        }

        // --- Evaluation ---
        live.phase = 'eval';
        writeLive();

        const evaluation = evaluateBot(params, frozenParams);
        const promoted = !bestEval ||
            evaluation.vsFull.winRate > bestEval.vsFull.winRate ||
            (evaluation.vsFull.winRate === bestEval.vsFull.winRate &&
             evaluation.vsStatic.winRate > bestEval.vsStatic.winRate);

        console.log(`  eval: full=${(evaluation.vsFull.winRate * 100).toFixed(0)}% static=${(evaluation.vsStatic.winRate * 100).toFixed(0)}% frozen=${(evaluation.vsFrozen.winRate * 100).toFixed(0)}%${promoted ? ' ★' : ''}`);

        if (promoted) {
            bestEval = evaluation;
            writeJson(bestPath, serializeCheckpoint(params, { generation: gen, evaluation }));
            writeJson(deployPath, serializeCheckpoint(params, { generation: gen, evaluation, deployed: true }));
            live.best = {
                generation: gen,
                vsFull: evaluation.vsFull.winRate,
                vsStatic: evaluation.vsStatic.winRate,
                vsFrozen: evaluation.vsFrozen.winRate
            };
        }

        // Update frozen copy if model improved against it convincingly
        if (evaluation.vsFrozen.winRate >= (config.promoteThreshold ?? 0.55)) {
            console.log(`  frozen copy updated (${(evaluation.vsFrozen.winRate * 100).toFixed(0)}% >= ${((config.promoteThreshold ?? 0.55) * 100).toFixed(0)}% threshold)`);
            frozenParams = new Float32Array(params);
            adamState = createAdamState(); // reset optimizer for new phase
        }

        live.history.push({
            generation: gen,
            positions: positions.length,
            selfplayResult: `${wins}W ${draws}D ${losses}L`,
            genMs,
            evaluation,
            promoted,
            frozenUpdated: evaluation.vsFrozen.winRate >= (config.promoteThreshold ?? 0.55)
        });
        writeLive();
    }

    live.phase = 'done';
    writeLive();
    console.log(`\nBest checkpoint: ${bestPath}`);
    console.log(`Deploy path: ${deployPath}`);
};

main();
