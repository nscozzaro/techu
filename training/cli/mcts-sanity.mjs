#!/usr/bin/env node
// training/cli/mcts-sanity.mjs
// Sanity check: does untrained MCTS beat random? If not, there's a bug in
// MCTS itself (not in training). MCTS with ANY reasonable prior + sims
// should destroy random.

import { createParams } from '../net/mlp.mjs';
import { playMatch, makeMctsBot } from '../selfplay/selfplay.mjs';
import { FloodBotStatic } from '../bot/tiers.mjs';
import { getLegalMoves } from '../engine/core.mjs';

const randomBot = {
    name: 'Random',
    getMove: (state, player) => {
        const legal = getLegalMoves(state, player);
        return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
    }
};

const params = createParams(42);

for (const sims of [8, 32, 128]) {
    const mctsBot = makeMctsBot(params, { name: `MCTS-${sims}`, numSimulations: sims });
    const vsRandom = playMatch(mctsBot, randomBot, 15, { seedPrefix: `sanity-r-${sims}` });
    console.log(
        `MCTS-${sims} vs Random:  ${vsRandom.aWins}-${vsRandom.bWins}-${vsRandom.ties}  ` +
        `(${(100 * vsRandom.aWins / vsRandom.totalGames).toFixed(1)}%)`
    );
}

console.log();
for (const sims of [32, 128]) {
    const mctsBot = makeMctsBot(params, { name: `MCTS-${sims}`, numSimulations: sims });
    const vsStatic = playMatch(mctsBot, FloodBotStatic, 10, { seedPrefix: `sanity-s-${sims}` });
    console.log(
        `MCTS-${sims} vs Static:  ${vsStatic.aWins}-${vsStatic.bWins}-${vsStatic.ties}  ` +
        `(${(100 * vsStatic.aWins / vsStatic.totalGames).toFixed(1)}%)`
    );
}
