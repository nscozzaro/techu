#!/usr/bin/env node
// training/cli/warmstart-eval.mjs
// Quick evaluation: MCTS bot using a warmstart checkpoint vs Random + FloodBotStatic.
// Prints paired-match scores with side-swap.

import fs from 'fs';
import { deserializeParams } from '../net/mlp.mjs';
import { makeMctsBot, playMatch } from '../selfplay/selfplay.mjs';
import { FloodBotStatic } from '../bot/tiers.mjs';
import { getLegalMoves } from '../engine/core.mjs';

const CKPT = process.argv[2] ?? 'training/checkpoints/warmstart.json';
const NUM_PAIRS = Number(process.argv[3] ?? 20);
const SIMS = Number(process.argv[4] ?? 48);

console.log(`\n=== Warmstart eval ===`);
console.log(`checkpoint: ${CKPT}`);
console.log(`pairs: ${NUM_PAIRS}  (= ${NUM_PAIRS * 2} games per opponent)`);
console.log(`MCTS sims: ${SIMS}\n`);

const params = deserializeParams(JSON.parse(fs.readFileSync(CKPT, 'utf8')));
const bot = makeMctsBot(params, { name: 'Warmstart', numSimulations: SIMS, cPuct: 1.5 });

const randomBot = {
    name: 'Random',
    getMove: (state, player) => {
        const legal = getLegalMoves(state, player);
        return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
    }
};

const t0 = Date.now();
console.log(`Playing vs Random...`);
const vsRandom = playMatch(bot, randomBot, NUM_PAIRS, { seedPrefix: 'ws-rand' });
console.log(`  Warmstart wins: ${vsRandom.aWins}/${vsRandom.totalGames}  (${(100 * vsRandom.aWins / vsRandom.totalGames).toFixed(1)}%)`);

console.log(`Playing vs FloodBotStatic...`);
const vsStatic = playMatch(bot, FloodBotStatic, NUM_PAIRS, { seedPrefix: 'ws-static' });
console.log(`  Warmstart wins: ${vsStatic.aWins}/${vsStatic.totalGames}  (${(100 * vsStatic.aWins / vsStatic.totalGames).toFixed(1)}%)`);

console.log(`\nElapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
