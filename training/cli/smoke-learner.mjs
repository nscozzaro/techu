#!/usr/bin/env node
// training/cli/smoke-learner.mjs
// Smoke test for the full MLP + MCTS + self-play training pipeline.
// Runs a few generations:
//   1. Create fresh MLP params
//   2. Play some self-play games vs FloodBotStatic
//   3. Train on the gathered examples
//   4. Evaluate the trained bot vs random and vs FloodBotStatic
//   5. Repeat for a few generations and print results
//
// This is NOT full training — it's a correctness check for the pipeline.
// Numbers will be modest. Expected: after ~3 generations, the MCTS-with-
// trained-policy bot should beat random >90% and at least trade games
// with FloodBotStatic.

import { createParams, backward, sgdStep, PARAM_COUNT } from '../net/mlp.mjs';
import { playSelfPlayGame, playMatch, makeMctsBot } from '../selfplay/selfplay.mjs';
import { FloodBotStatic } from '../bot/tiers.mjs';
import { newGame, isTerminal, getWinner, applyMove, getLegalMoves } from '../engine/core.mjs';

const GENERATIONS = Number(process.argv[2] ?? 3);
const GAMES_PER_GEN = Number(process.argv[3] ?? 20);
const EVAL_GAMES = Number(process.argv[4] ?? 10);
const MCTS_SIMS = Number(process.argv[5] ?? 32);

const randomBot = {
    name: 'Random',
    getMove: (state, player) => {
        const legal = getLegalMoves(state, player);
        return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
    }
};

console.log(`\n=== Smoke learner: ${GENERATIONS} gens × ${GAMES_PER_GEN} games, ${MCTS_SIMS} sims ===\n`);

const params = createParams(12345);
const grads = new Float32Array(PARAM_COUNT);

console.log(`Params initialized (${PARAM_COUNT} weights, ${(PARAM_COUNT * 4 / 1024).toFixed(1)} KB)`);

for (let gen = 0; gen < GENERATIONS; gen++) {
    const t0 = performance.now();

    // ---- Self-play ----
    // Mix: half games MCTS vs FloodBotStatic, half games MCTS self-play
    let allExamples = [];
    let wins = 0, losses = 0, ties = 0;
    for (let i = 0; i < GAMES_PER_GEN; i++) {
        const learnerPlayer = i % 2 === 0 ? 'red' : 'black';
        const opponent = i < GAMES_PER_GEN / 2 ? FloodBotStatic : null; // null = MCTS self-play
        const seed = `gen${gen}:game${i}`;
        const { examples, winner, turns } = playSelfPlayGame({
            params,
            seed,
            numSimulations: MCTS_SIMS,
            dirichletAlpha: 0.25,
            dirichletWeight: 0.25,
            temperatureMoves: 20,
            opponent,
            learnerPlayer: opponent ? learnerPlayer : null
        });
        // Track learner's winrate (only when we have an opponent to compare against)
        if (opponent) {
            if (winner === learnerPlayer) wins++;
            else if (winner && winner !== learnerPlayer) losses++;
            else ties++;
        }
        allExamples.push(...examples);
    }
    const selfplayMs = performance.now() - t0;

    // ---- Training ----
    const t1 = performance.now();
    let totalPolicyLoss = 0, totalValueLoss = 0, totalEntropy = 0, steps = 0;
    // Simple minibatch SGD: one example per step, a few epochs over data
    const EPOCHS = 3;
    const LR = 5e-3;
    for (let epoch = 0; epoch < EPOCHS; epoch++) {
        // Shuffle
        for (let i = allExamples.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allExamples[i], allExamples[j]] = [allExamples[j], allExamples[i]];
        }
        // Minibatch size 32 via gradient accumulation
        const BATCH = 32;
        for (let b = 0; b < allExamples.length; b += BATCH) {
            grads.fill(0);
            const end = Math.min(b + BATCH, allExamples.length);
            let batchSteps = 0;
            for (let k = b; k < end; k++) {
                const ex = allExamples[k];
                const { policyLoss, valueLoss, entropyBonus } = backward(
                    params, grads, ex.input, ex.policy, ex.targetValue, ex.mask, 0.01
                );
                totalPolicyLoss += policyLoss;
                totalValueLoss += valueLoss;
                totalEntropy += entropyBonus;
                batchSteps += 1;
            }
            if (batchSteps > 0) {
                // Average grads over the batch
                const scale = 1 / batchSteps;
                for (let i = 0; i < PARAM_COUNT; i++) grads[i] *= scale;
                sgdStep(params, grads, LR, { gradClip: 1.0 });
            }
            steps += batchSteps;
        }
    }
    const trainMs = performance.now() - t1;
    const avgPolicy = totalPolicyLoss / Math.max(1, steps);
    const avgValue = totalValueLoss / Math.max(1, steps);
    const avgEntropy = totalEntropy / Math.max(1, steps);

    // ---- Evaluation ----
    const t2 = performance.now();
    const mctsBot = makeMctsBot(params, { name: `MCTS-gen${gen}`, numSimulations: MCTS_SIMS });
    const vsRandom = playMatch(mctsBot, randomBot, EVAL_GAMES / 2, { seedPrefix: `eval-random-gen${gen}` });
    const vsStatic = playMatch(mctsBot, FloodBotStatic, EVAL_GAMES / 2, { seedPrefix: `eval-static-gen${gen}` });
    const evalMs = performance.now() - t2;

    const genMs = performance.now() - t0;

    console.log(
        `gen=${gen} ` +
        `selfplay=${selfplayMs.toFixed(0)}ms train=${trainMs.toFixed(0)}ms eval=${evalMs.toFixed(0)}ms total=${genMs.toFixed(0)}ms ` +
        `| policyLoss=${avgPolicy.toFixed(3)} valueLoss=${avgValue.toFixed(3)} entropy=${avgEntropy.toFixed(3)} ` +
        `| learner-vs-static W:${wins} L:${losses} T:${ties} ` +
        `| eval-vs-random ${vsRandom.aWins}-${vsRandom.bWins}-${vsRandom.ties} ` +
        `| eval-vs-static ${vsStatic.aWins}-${vsStatic.bWins}-${vsStatic.ties}`
    );
}

console.log('\n✓ Smoke learner completed without crashing.');
