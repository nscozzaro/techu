// training/selfplay/worker.mjs
// Worker thread for parallel self-play. Receives a batch of game specs,
// plays them using the challenger params, and posts back training examples.

import { workerData, parentPort } from 'worker_threads';
import { playSelfPlayGame } from './selfplay.mjs';
import { makeMctsBot } from './selfplay.mjs';
import { FloodBotStatic } from '../bot/tiers.mjs';
import { getLegalMoves } from '../engine/core.mjs';

const {
    challengerParamsArr,
    championParamsArr,
    games,
    config,
} = workerData;

// Reconstruct Float32Arrays from transferred buffers
const challengerParams = new Float32Array(challengerParamsArr);
const championParams = championParamsArr ? new Float32Array(championParamsArr) : null;

// Build opponent bots
const randomBot = {
    name: 'Random',
    getMove: (state, player) => {
        const legal = getLegalMoves(state, player);
        return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
    }
};

const championBot = championParams
    ? makeMctsBot(championParams, { name: 'Champion', numSimulations: config.mctsSims, cPuct: config.cPuct, heuristicBlend: config.heuristicBlend ?? 0, heuristicScale: config.heuristicScale ?? 580 })
    : null;

// Play all assigned games
const allExamples = [];
let winsVsStatic = 0, lossesVsStatic = 0, gamesVsStatic = 0;

for (const game of games) {
    let opponent = null;
    if (game.opponentType === 'champion') opponent = championBot;
    else if (game.opponentType === 'static') opponent = FloodBotStatic;
    else if (game.opponentType === 'random') opponent = randomBot;
    // 'self' → opponent = null

    const { examples, winner } = playSelfPlayGame({
        params: challengerParams,
        seed: game.seed,
        numSimulations: config.mctsSims,
        cPuct: config.cPuct,
        dirichletAlpha: config.dirichletAlpha,
        dirichletWeight: config.dirichletWeight,
        temperatureMoves: config.temperatureMoves,
        valueTargetBlend: config.valueTargetBlend ?? 0,
        heuristicBlend: config.heuristicBlend ?? 0,
        heuristicScale: config.heuristicScale ?? 580,
        opponent,
        learnerPlayer: opponent ? game.learnerPlayer : null,
    });

    if (game.opponentType === 'static') {
        gamesVsStatic++;
        if (winner === game.learnerPlayer) winsVsStatic++;
        else if (winner) lossesVsStatic++;
    }

    allExamples.push(...examples);
}

// Post results back — structured clone handles Float32Arrays
parentPort.postMessage({
    examples: allExamples,
    stats: { winsVsStatic, lossesVsStatic, gamesVsStatic },
});
