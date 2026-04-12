#!/usr/bin/env node
// training/cli/bot-vs-random.mjs
// Quick validation: FloodBotStatic vs random uniform moves.
// If the heuristic port is correct, Static should win ≥85% of games.

import { newGame, applyMove, getLegalMoves, isTerminal, getWinner } from '../engine/core.mjs';
import { FloodBotStatic } from '../bot/tiers.mjs';

const NUM_GAMES = Number(process.argv[2] ?? 100);

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
    while (!isTerminal(state) && state.gamePhase !== 'ended' && turns < MAX_TURNS) {
        const bot = state.currentPlayer === 'red' ? redBot : blackBot;
        const move = bot.getMove(state, state.currentPlayer);
        if (!move) {
            // Shouldn't happen if engine's skipEmpty is working, but guard.
            break;
        }
        applyMove(state, move);
        turns += 1;
    }
    return { winner: getWinner(state), turns };
};

const runMatch = (redBot, blackBot, numGames) => {
    let redWins = 0, blackWins = 0, ties = 0, totalTurns = 0;
    for (let i = 0; i < numGames; i++) {
        const { winner, turns } = playGame(redBot, blackBot, `match:${i}`);
        if (winner === 'red') redWins++;
        else if (winner === 'black') blackWins++;
        else ties++;
        totalTurns += turns;
    }
    return { redWins, blackWins, ties, totalTurns, n: numGames };
};

console.log(`\n=== FloodBotStatic vs Random: ${NUM_GAMES * 2} games (paired, side-swap) ===\n`);

// Half games: Static as red
const staticAsRed = runMatch(FloodBotStatic, randomBot, NUM_GAMES);
// Half games: Static as black
const staticAsBlack = runMatch(randomBot, FloodBotStatic, NUM_GAMES);

const totalStaticWins = staticAsRed.redWins + staticAsBlack.blackWins;
const totalRandomWins = staticAsRed.blackWins + staticAsBlack.redWins;
const totalTies = staticAsRed.ties + staticAsBlack.ties;
const totalGames = NUM_GAMES * 2;

const pct = (x) => `${(100 * x / totalGames).toFixed(1)}%`;

console.log(`FloodBotStatic wins: ${totalStaticWins} (${pct(totalStaticWins)})`);
console.log(`Random wins:         ${totalRandomWins} (${pct(totalRandomWins)})`);
console.log(`Ties:                ${totalTies} (${pct(totalTies)})`);
console.log(`\nBreakdown:`);
console.log(`  Static as red:   ${staticAsRed.redWins}W - ${staticAsRed.ties}T - ${staticAsRed.blackWins}L`);
console.log(`  Static as black: ${staticAsBlack.blackWins}W - ${staticAsBlack.ties}T - ${staticAsBlack.redWins}L`);
console.log(`Avg turns/game: ${((staticAsRed.totalTurns + staticAsBlack.totalTurns) / totalGames).toFixed(1)}`);

if (totalStaticWins < 0.7 * totalGames) {
    console.error('\n❌ FloodBotStatic won <70% vs random — heuristic port is likely buggy.');
    process.exit(1);
}
console.log('\n✓ FloodBotStatic beats random by a wide margin.');
