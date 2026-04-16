#!/usr/bin/env node
// training/cli/eval-compact.mjs
// Evaluate a compact value checkpoint against Random, FloodBotStatic,
// FloodBotFull, and optionally a frozen/baseline compact checkpoint.

import fs from 'fs';
import { deserializeParams } from '../td/network.mjs';
import { makeCompactSearchBot, COMPACT_SEARCH_CONFIG } from '../compact/bot.mjs';
import { FloodBotStatic, FloodBotFull } from '../bot/tiers.mjs';
import { playMatch } from '../selfplay/selfplay.mjs';
import { getLegalMoves } from '../engine/core.mjs';
import { wilsonInterval } from '../league/evaluate.mjs';

const modelPath = process.argv[2] ?? 'flood-compact-model.json';
const pairs = Number(process.argv[3] ?? 20);
const frozenPath = process.argv[4] ?? null;

const randomBot = {
    name: 'Random',
    getMove: (state, player) => {
        const legal = getLegalMoves(state, player);
        return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
    }
};

const wrapMatch = (label, result) => {
    const adjustedWins = result.aWins + result.ties * 0.5;
    const winRate = adjustedWins / result.totalGames;
    const ci = wilsonInterval(adjustedWins, result.totalGames);
    console.log(
        `${label.padEnd(18)} ${result.aWins}W ${result.ties}T ${result.bWins}L ` +
        `${(100 * winRate).toFixed(1)}% ` +
        `Wilson [${(100 * ci.lo).toFixed(1)}, ${(100 * ci.hi).toFixed(1)}]`
    );
};

const loadParams = (filePath) => deserializeParams(JSON.parse(fs.readFileSync(filePath, 'utf8')));

const params = loadParams(modelPath);
const bot = makeCompactSearchBot(params, COMPACT_SEARCH_CONFIG);

console.log(`\n=== Compact checkpoint eval ===`);
console.log(`model: ${modelPath}`);
console.log(`pairs: ${pairs} (${pairs * 2} games per opponent)\n`);

wrapMatch('vs Random', playMatch(bot, randomBot, pairs, { seedPrefix: 'compact-eval-random' }));
wrapMatch('vs Static', playMatch(bot, FloodBotStatic, pairs, { seedPrefix: 'compact-eval-static' }));
wrapMatch('vs Full', playMatch(bot, FloodBotFull, pairs, { seedPrefix: 'compact-eval-full' }));

if (frozenPath) {
    const frozen = makeCompactSearchBot(loadParams(frozenPath), COMPACT_SEARCH_CONFIG);
    wrapMatch('vs Frozen', playMatch(bot, frozen, pairs, { seedPrefix: 'compact-eval-frozen' }));
}
