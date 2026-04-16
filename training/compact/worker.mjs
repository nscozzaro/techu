// training/compact/worker.mjs
// Parallel teacher-data generation for the compact value network.

import { workerData, parentPort } from 'worker_threads';
import { newGame, applyMove, isTerminal, getLegalMoves } from '../engine/core.mjs';
import { getBestSearchAction, evaluateSearchPosition } from '../engine/search.mjs';
import { encodeState } from '../td/encode.mjs';
import { floodBotStaticMove, floodBotFullMove } from '../bot/tiers.mjs';

const {
    games,
    teacherConfig,
    minTeacherDepth = 2,
    targetScale = 480
} = workerData;

const randomMove = (state, player) => {
    const legal = getLegalMoves(state, player);
    return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
};

const teacherDecisionFor = (state, player) => getBestSearchAction(state, player, teacherConfig);

const actionToMove = (action) => {
    if (!action) return null;
    if (action.type === 'move') {
        return {
            type: 'place',
            slotIndex: action.slotIndex,
            row: action.row,
            col: action.col
        };
    }
    return {
        type: 'discard',
        slotIndex: action.slotIndex ?? action.index
    };
};

const scoreToTarget = (score, scale) => Math.tanh(score / scale);

const playGame = (spec) => {
    const state = newGame({ seed: spec.seed });
    const positions = [];
    let turns = 0;
    let teacherSamples = 0;
    let depthSum = 0;
    let rawScoreSum = 0;
    const MAX_TURNS = 300;

    while (!isTerminal(state) && state.gamePhase !== 'ended' && turns < MAX_TURNS) {
        const player = state.currentPlayer;
        let teacherDecision = null;

        if (state.gamePhase === 'playing') {
            teacherDecision = teacherDecisionFor(state, player);
            const action = teacherDecision.bestAction;
            const rawScore = Number.isFinite(action?.searchScore)
                ? action.searchScore
                : Number.isFinite(action?.score)
                    ? action.score
                    : evaluateSearchPosition(state, player);
            if (teacherDecision.searchedDepth >= minTeacherDepth && action) {
                positions.push({
                    input: encodeState(state, player),
                    targetValue: scoreToTarget(rawScore, targetScale),
                    rawScore,
                    searchedDepth: teacherDecision.searchedDepth
                });
                teacherSamples += 1;
                depthSum += teacherDecision.searchedDepth;
                rawScoreSum += rawScore;
            }
        }

        let move;
        const useTeacher = spec.teacherSide == null || player === spec.teacherSide;
        if (state.gamePhase === 'setup') {
            move = floodBotStaticMove(state, player);
        } else if (useTeacher) {
            move = actionToMove((teacherDecision ?? teacherDecisionFor(state, player)).bestAction);
        } else if (spec.opponentType === 'full') {
            move = floodBotFullMove(state, player);
        } else if (spec.opponentType === 'static') {
            move = floodBotStaticMove(state, player);
        } else {
            move = randomMove(state, player);
        }

        if (!move) break;
        applyMove(state, move);
        turns += 1;
    }

    return {
        positions,
        turns,
        teacherSamples,
        avgTeacherDepth: teacherSamples ? depthSum / teacherSamples : 0,
        avgRawScore: teacherSamples ? rawScoreSum / teacherSamples : 0
    };
};

const allPositions = [];
let gamesPlayed = 0;
let totalTurns = 0;
let teacherSamples = 0;
let depthWeighted = 0;
let scoreWeighted = 0;
const PROGRESS_EVERY = 1;

const emitProgress = () => {
    parentPort.postMessage({
        type: 'progress',
        gamesPlayed,
        totalTurns,
        positions: allPositions.length,
        teacherSamples,
        avgTeacherDepth: teacherSamples ? depthWeighted / teacherSamples : 0,
        avgRawScore: teacherSamples ? scoreWeighted / teacherSamples : 0
    });
};

for (const spec of games) {
    const result = playGame(spec);
    allPositions.push(...result.positions);
    gamesPlayed += 1;
    totalTurns += result.turns;
    teacherSamples += result.teacherSamples;
    depthWeighted += result.avgTeacherDepth * result.teacherSamples;
    scoreWeighted += result.avgRawScore * result.teacherSamples;
    if (gamesPlayed % PROGRESS_EVERY === 0) {
        emitProgress();
    }
}

emitProgress();

parentPort.postMessage({
    type: 'done',
    positions: allPositions,
    gamesPlayed,
    totalTurns,
    teacherSamples,
    avgTeacherDepth: teacherSamples ? depthWeighted / teacherSamples : 0,
    avgRawScore: teacherSamples ? scoreWeighted / teacherSamples : 0
});
