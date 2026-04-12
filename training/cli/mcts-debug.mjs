#!/usr/bin/env node
// Debug: what does MCTS actually do on a specific state?

import { newGame, applyMove, isTerminal, getWinner, getLegalMoves, getScores } from '../engine/core.mjs';
import { createParams } from '../net/mlp.mjs';
import { runMcts, sampleFromDistribution } from '../mcts/mcts.mjs';
import { decodeAction, encodeActionMask } from '../engine/encoding.mjs';

const params = createParams(42);

// Play one full game MCTS vs random. Print every move and the MCTS's choice.
const state = newGame({ seed: 'debug:1' });
let turns = 0;
const MAX = 120;

console.log('=== MCTS (red) vs Random (black), 64 sims, debug trace ===\n');

while (!isTerminal(state) && state.gamePhase !== 'ended' && turns < MAX) {
    const legal = getLegalMoves(state, state.currentPlayer);
    const who = state.currentPlayer;
    const phase = state.gamePhase;
    const scores = getScores(state);
    if (who === 'red') {
        const { visitDistribution, value, totalVisits } = runMcts(state, who, params, { numSimulations: 64, dirichletAlpha: 0 });
        // Top 3 picks by visit count
        const ranked = [];
        for (let i = 0; i < visitDistribution.length; i++) {
            if (visitDistribution[i] > 0) ranked.push([i, visitDistribution[i]]);
        }
        ranked.sort((a, b) => b[1] - a[1]);
        const top = ranked.slice(0, 3).map(([i, p]) => `${JSON.stringify(decodeAction(i))}=${p.toFixed(2)}`);
        const idx = sampleFromDistribution(visitDistribution, 0);
        const move = decodeAction(idx);
        console.log(`t=${turns} ${phase} red: scores=${scores.red}-${scores.black} legal=${legal.length} topMoves=[${top.join(', ')}]`);
        console.log(`  → MCTS picks ${JSON.stringify(move)} (value=${value.toFixed(3)}, visits=${totalVisits})`);
        applyMove(state, move);
    } else {
        const move = legal[Math.floor(Math.random() * legal.length)];
        console.log(`t=${turns} ${phase} black (random): ${JSON.stringify(move)}`);
        applyMove(state, move);
    }
    turns += 1;
}

const finalScores = getScores(state);
console.log(`\nFinal: red=${finalScores.red}, black=${finalScores.black}, winner=${getWinner(state)}, turns=${turns}`);
