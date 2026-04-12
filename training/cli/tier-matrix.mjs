#!/usr/bin/env node
// training/cli/tier-matrix.mjs
// Validate the three Flood bot tiers by running round-robin matches
// plus each tier vs random. Expected ordering:
//   FloodBotFull > FloodBotShallow > FloodBotStatic >> random

import { newGame, applyMove, getLegalMoves, isTerminal, getWinner } from '../engine/core.mjs';
import { FloodBotStatic, FloodBotShallow, FloodBotFull } from '../bot/tiers.mjs';

const NUM_GAMES = Number(process.argv[2] ?? 20);

const randomBot = {
    name: 'Random',
    getMove: (state, player) => {
        const moves = getLegalMoves(state, player);
        if (moves.length === 0) return null;
        return moves[Math.floor(Math.random() * moves.length)];
    }
};

const playGame = (redBot, blackBot, seed) => {
    const state = newGame({ seed });
    const MAX_TURNS = 300;
    let turns = 0;
    const t0 = performance.now();
    while (!isTerminal(state) && state.gamePhase !== 'ended' && turns < MAX_TURNS) {
        const bot = state.currentPlayer === 'red' ? redBot : blackBot;
        const move = bot.getMove(state, state.currentPlayer);
        if (!move) break;
        applyMove(state, move);
        turns += 1;
    }
    return { winner: getWinner(state), turns, elapsedMs: performance.now() - t0 };
};

const runPairedMatch = (botA, botB, n) => {
    let aWins = 0, bWins = 0, ties = 0, totalMs = 0, totalTurns = 0;
    for (let i = 0; i < n; i++) {
        const seed = `match:${botA.name}:${botB.name}:${i}`;
        const r1 = playGame(botA, botB, seed);
        if (r1.winner === 'red') aWins++;
        else if (r1.winner === 'black') bWins++;
        else ties++;
        totalMs += r1.elapsedMs;
        totalTurns += r1.turns;
        const r2 = playGame(botB, botA, seed);
        if (r2.winner === 'black') aWins++;
        else if (r2.winner === 'red') bWins++;
        else ties++;
        totalMs += r2.elapsedMs;
        totalTurns += r2.turns;
    }
    return { aWins, bWins, ties, totalGames: 2 * n, totalMs, totalTurns };
};

const report = (label, result) => {
    const { aWins, bWins, ties, totalGames, totalMs, totalTurns } = result;
    const pct = (x) => `${(100 * x / totalGames).toFixed(1)}%`;
    const msPerGame = (totalMs / totalGames).toFixed(1);
    const turnsPerGame = (totalTurns / totalGames).toFixed(1);
    console.log(`${label.padEnd(44)}  ${aWins}W ${ties}T ${bWins}L  A=${pct(aWins)}  (${msPerGame}ms/game, ${turnsPerGame}turns)`);
};

console.log(`\n=== Tier matrix (${NUM_GAMES * 2} paired games per matchup) ===\n`);

const matchups = [
    ['Static  vs Random ', FloodBotStatic,  randomBot],
    ['Shallow vs Random ', FloodBotShallow, randomBot],
    ['Full    vs Random ', FloodBotFull,    randomBot],
    ['Shallow vs Static ', FloodBotShallow, FloodBotStatic],
    ['Full    vs Static ', FloodBotFull,    FloodBotStatic],
    ['Full    vs Shallow', FloodBotFull,    FloodBotShallow]
];

for (const [label, a, b] of matchups) {
    const result = runPairedMatch(a, b, NUM_GAMES);
    report(label, result);
}
