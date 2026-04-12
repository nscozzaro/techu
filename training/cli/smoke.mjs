#!/usr/bin/env node
// training/cli/smoke.mjs
// Plays N random games through the headless engine and reports basic stats.
// Used as a first-line check that the engine doesn't crash and produces
// sensible outcomes. This is NOT the rigorous parity test — that comes later.

import { newGame, applyMove, getLegalMoves, isTerminal, getScores, getWinner, BOARD_SIZE } from '../engine/core.mjs';

const NUM_GAMES = Number(process.argv[2] ?? 100);
const SEED_PREFIX = 'smoke';

const stats = {
    games: 0,
    redWins: 0,
    blackWins: 0,
    ties: 0,
    errors: 0,
    totalTurns: 0,
    minTurns: Infinity,
    maxTurns: 0,
    totalLegalMovesPerTurn: 0,
    decisions: 0
};

for (let i = 0; i < NUM_GAMES; i++) {
    const state = newGame({ seed: `${SEED_PREFIX}:${i}` });
    let turns = 0;
    try {
        // Hard cap to avoid infinite loops while debugging. A real Flood game
        // should fit in well under 120 turns.
        const MAX_TURNS = 300;
        while (!isTerminal(state) && turns < MAX_TURNS) {
            const moves = getLegalMoves(state, state.currentPlayer);
            if (moves.length === 0) {
                // Should not happen — skipEmpty handles this, but guard anyway.
                console.error(`Game ${i}: no legal moves at turn ${turns}, phase=${state.gamePhase}, current=${state.currentPlayer}`);
                stats.errors += 1;
                break;
            }
            stats.totalLegalMovesPerTurn += moves.length;
            stats.decisions += 1;
            // Pick a random move
            const move = moves[Math.floor(Math.random() * moves.length)];
            applyMove(state, move);
            turns += 1;
        }
        if (turns >= 300) {
            console.error(`Game ${i}: exceeded 300-turn cap, phase=${state.gamePhase}`);
            stats.errors += 1;
        }
    } catch (err) {
        console.error(`Game ${i} errored at turn ${turns}:`, err.message);
        console.error('State snapshot:', {
            phase: state.gamePhase,
            currentPlayer: state.currentPlayer,
            redHand: state.redHand.map((c) => c?.rank ?? null),
            blackHand: state.blackHand.map((c) => c?.rank ?? null),
            redDeckLen: state.redDeck.length,
            blackDeckLen: state.blackDeck.length,
            setupPlacements: state.setupPlacements
        });
        stats.errors += 1;
        continue;
    }
    stats.games += 1;
    stats.totalTurns += turns;
    stats.minTurns = Math.min(stats.minTurns, turns);
    stats.maxTurns = Math.max(stats.maxTurns, turns);
    const winner = getWinner(state);
    if (winner === 'red') stats.redWins += 1;
    else if (winner === 'black') stats.blackWins += 1;
    else stats.ties += 1;
}

const pct = (x) => `${(100 * x / stats.games).toFixed(1)}%`;
console.log(`\n=== Smoke test results over ${NUM_GAMES} games ===`);
console.log(`Completed:   ${stats.games}  (errors: ${stats.errors})`);
console.log(`Red wins:    ${stats.redWins} (${pct(stats.redWins)})`);
console.log(`Black wins:  ${stats.blackWins} (${pct(stats.blackWins)})`);
console.log(`Ties:        ${stats.ties} (${pct(stats.ties)})`);
console.log(`Turns:       avg=${(stats.totalTurns / stats.games).toFixed(1)}  min=${stats.minTurns}  max=${stats.maxTurns}`);
console.log(`Avg legal moves per decision: ${(stats.totalLegalMovesPerTurn / stats.decisions).toFixed(2)}`);

if (stats.errors > 0) {
    process.exit(1);
}
