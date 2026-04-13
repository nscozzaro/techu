// training/td/worker.mjs
// Worker thread for parallel game generation.
// Workers play games using FROZEN read-only params and return trajectories.
// The main thread processes trajectories sequentially with proper TD-lambda.
// This fixes the Hogwild! averaging bug where independent TD updates on
// separate param copies produced incoherent averaged weights.

import { workerData, parentPort } from 'worker_threads';
import { forward, PARAM_COUNT } from './network.mjs';
import { encodeState } from './encode.mjs';
import {
    newGame, applyMove, isTerminal, getWinner, getScores,
    getLegalMoves, cloneState, otherPlayer
} from '../engine/core.mjs';
import { FloodBotFull, floodBotStaticMove } from '../bot/tiers.mjs';

const { games, paramsArr, frozenParamsArr, config } = workerData;

// Read-only params — NO TD updates happen in the worker
const params = new Float32Array(paramsArr);
const frozenParams = frozenParamsArr ? new Float32Array(frozenParamsArr) : null;

const selectMove = (state, player, netParams) => {
    const legal = getLegalMoves(state, player);
    if (legal.length === 0) return null;
    let bestMove = null, bestValue = -Infinity;
    for (const move of legal) {
        const clone = cloneState(state);
        applyMove(clone, move);
        const input = encodeState(clone, player);
        const { value } = forward(netParams, input);
        if (value > bestValue) { bestValue = value; bestMove = move; }
    }
    return bestMove;
};

// Play one game, return the trajectory (list of encoded states from learner's perspective)
const playGame = (seed, opponentType, learnerSide) => {
    const state = newGame({ seed });
    const trajectory = []; // list of Float32Array(INPUT_SIZE) encoded states
    let turns = 0;

    while (!isTerminal(state) && state.gamePhase !== 'ended' && turns < 300) {
        const player = state.currentPlayer;
        const isLearner = player === learnerSide;
        let move;

        if (state.gamePhase === 'setup') {
            move = floodBotStaticMove(state, player);
        } else if (isLearner) {
            // Record the state BEFORE the learner moves
            trajectory.push(encodeState(state, player));
            move = selectMove(state, player, params);
        } else {
            if (opponentType === 'frozen') {
                move = selectMove(state, player, frozenParams);
            } else if (opponentType === 'full') {
                move = FloodBotFull.getMove(state, player);
            } else {
                const legal = getLegalMoves(state, player);
                move = legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
            }
        }

        if (!move) break;
        applyMove(state, move);
        turns++;
    }

    // Compute final outcome
    const scores = getScores(state);
    const myScore = scores[learnerSide];
    const oppScore = scores[otherPlayer(learnerSide)];
    const diff = myScore - oppScore;
    const sign = diff > 0 ? 1 : (diff < 0 ? -1 : 0);
    const margin = Math.abs(Math.tanh(diff / 10));
    const outcome = sign * (0.8 + 0.2 * margin);

    return { trajectory, outcome, myScore, oppScore };
};

// Play all assigned games
const results = [];
for (const game of games) {
    const result = playGame(game.seed, game.opponentType, game.learnerSide);
    results.push({
        // Flatten trajectory to transferable format: [state0_float0, state0_float1, ..., state1_float0, ...]
        trajectoryFlat: Float32Array.from(result.trajectory.flatMap(s => Array.from(s))),
        trajectoryLen: result.trajectory.length,
        outcome: result.outcome,
        won: result.myScore > result.oppScore,
    });
}

parentPort.postMessage({ results });
