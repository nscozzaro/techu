// training/cli/expert-worker.mjs
// Worker thread for parallel expert dataset generation.
// Plays games using FloodBotFull as the expert, records per-position
// training data: { input, mask, policyTarget, rawValue }.

import { workerData, parentPort } from 'worker_threads';
import {
    newGame, applyMove, isTerminal, getLegalMoves, getWinner, otherPlayer
} from '../engine/core.mjs';
import { encodeState, encodeActionMask, ACTION_SIZE } from '../engine/encoding.mjs';
import { getBestSearchAction, evaluateSearchPosition } from '../engine/search.mjs';
import { floodBotStaticMove } from '../bot/tiers.mjs';

const { games, searchConfig } = workerData;

const POLICY_TEMP = 3.0;

const randomMove = (state, player) => {
    const legal = getLegalMoves(state, player);
    return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
};

const floodBotFullMove = (state, player) => {
    if (state.gamePhase === 'setup') return floodBotStaticMove(state, player);
    if (state.gamePhase !== 'playing') return null;
    const result = getBestSearchAction(state, player, searchConfig);
    const move = result.bestAction;
    if (!move) return null;
    // Search returns type:'move', but applyMove expects type:'place'
    return move.type === 'move'
        ? { type: 'place', slotIndex: move.slotIndex, row: move.row, col: move.col }
        : move;
};

// Build soft policy target from ranked search actions
const buildPolicyTarget = (rankedActions, mask) => {
    const policy = new Float32Array(ACTION_SIZE);
    if (!rankedActions || rankedActions.length === 0) return policy;

    const entries = [];
    for (const action of rankedActions) {
        let idx;
        if (action.type === 'move') {
            idx = action.slotIndex * 27 + (action.row * 5 + action.col);
        } else if (action.type === 'discard') {
            idx = (action.index ?? action.slotIndex) * 27 + 25;
        } else continue;
        if (idx >= 0 && idx < ACTION_SIZE && mask[idx] > 0) {
            entries.push({ idx, score: action.score ?? action.staticScore ?? 0 });
        }
    }
    if (entries.length === 0) return policy;

    const maxScore = Math.max(...entries.map(e => e.score));
    let sum = 0;
    const exps = entries.map(e => {
        const v = Math.exp((e.score - maxScore) / POLICY_TEMP);
        sum += v;
        return v;
    });
    if (sum > 0) {
        for (let i = 0; i < entries.length; i++) {
            policy[entries[i].idx] = exps[i] / sum;
        }
    }
    return policy;
};

// Play one game, collect expert positions
const playExpertGame = (seed, opponentType) => {
    const state = newGame({ seed });
    const positions = [];
    let turns = 0;
    const MAX_TURNS = 300;

    while (!isTerminal(state) && state.gamePhase !== 'ended' && turns < MAX_TURNS) {
        const player = state.currentPlayer;

        // Determine which side is the expert (FloodBotFull)
        // In vs-self games, both sides are experts
        // In vs-static/random, alternate: even games = expert as red, odd games = expert as black
        const isExpertTurn = opponentType === 'self'
            || (opponentType === 'static' && player === 'red')
            || (opponentType === 'random' && player === 'red');

        if (isExpertTurn && state.gamePhase === 'playing' && state.openingMoveComplete) {
            // Get FloodBotFull's decision with full search
            const result = getBestSearchAction(state, player, searchConfig);

            // Only keep positions with meaningful search depth
            if (result.searchedDepth >= 2 && result.rankedActions.length > 0) {
                const input = encodeState(state, player);
                const mask = encodeActionMask(state, player);
                const policyTarget = buildPolicyTarget(result.rankedActions, mask);
                const rawValue = evaluateSearchPosition(state, player);

                positions.push({ input, mask, policyTarget, rawValue });
            }

            // Apply the expert's chosen move
            // Search returns type:'move', but applyMove expects type:'place'
            const move = result.bestAction;
            if (!move) break;
            const gameMove = move.type === 'move'
                ? { type: 'place', slotIndex: move.slotIndex, row: move.row, col: move.col }
                : move;
            applyMove(state, gameMove);
        } else {
            // Non-expert side (or setup phase)
            let move;
            if (state.gamePhase === 'setup') {
                move = floodBotStaticMove(state, player);
            } else if (opponentType === 'static' || (opponentType === 'self' && !isExpertTurn)) {
                move = floodBotStaticMove(state, player);
            } else if (opponentType === 'random') {
                move = randomMove(state, player);
            } else {
                // For self-play, non-expert side also uses FloodBotFull
                move = floodBotFullMove(state, player);
            }
            if (!move) break;
            applyMove(state, move);
        }
        turns++;
    }
    return positions;
};

// Play all assigned games
const allPositions = [];
for (const game of games) {
    const positions = playExpertGame(game.seed, game.opponentType);
    allPositions.push(...positions);
}

parentPort.postMessage({ positions: allPositions, gamesPlayed: games.length });
