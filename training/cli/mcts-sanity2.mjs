#!/usr/bin/env node
// Larger-scale MCTS vs random sanity check.
import { createParams } from '../net/mlp.mjs';
import { playMatch, makeMctsBot } from '../selfplay/selfplay.mjs';
import { getLegalMoves } from '../engine/core.mjs';

const randomBot = {
    name: 'Random',
    getMove: (state, player) => {
        const legal = getLegalMoves(state, player);
        return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
    }
};

const params = createParams(42);

for (const sims of [32, 128, 400]) {
    const mctsBot = makeMctsBot(params, { name: `MCTS-${sims}`, numSimulations: sims });
    const t0 = performance.now();
    const vsRandom = playMatch(mctsBot, randomBot, 25, { seedPrefix: `sanity2-${sims}` });
    const ms = performance.now() - t0;
    console.log(
        `MCTS-${sims} vs Random: ${vsRandom.aWins}-${vsRandom.bWins}-${vsRandom.ties}  ` +
        `(${(100 * vsRandom.aWins / vsRandom.totalGames).toFixed(1)}%)  ` +
        `${(ms / vsRandom.totalGames).toFixed(0)}ms/game`
    );
}
