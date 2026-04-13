// training/selfplay/pool.mjs
// Distributes self-play games across worker threads for parallel execution.
// Each worker gets a slice of the game list, plays them independently, and
// returns the training examples. The main thread aggregates results.

import { Worker } from 'worker_threads';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_PATH = path.join(__dirname, 'worker.mjs');

/**
 * Play self-play games in parallel across all CPU cores.
 *
 * @param {Object} opts
 * @param {Float32Array} opts.challengerParams
 * @param {Float32Array} opts.championParams
 * @param {Array} opts.games - Array of { seed, opponentType, learnerPlayer }
 * @param {Object} opts.config - Training config (mctsSims, cPuct, etc.)
 * @param {number} [opts.numWorkers] - Number of worker threads (default: all cores)
 * @returns {Promise<{ examples: Array, stats: Object }>}
 */
export const runParallelSelfPlay = async ({
    challengerParams,
    championParams,
    games,
    config,
    numWorkers = os.cpus().length,
}) => {
    if (games.length === 0) return { examples: [], stats: { winsVsStatic: 0, lossesVsStatic: 0, gamesVsStatic: 0 } };

    // Cap workers at game count (no point having more workers than games)
    const actualWorkers = Math.min(numWorkers, games.length);

    // Distribute games across workers (round-robin for even load)
    const batches = Array.from({ length: actualWorkers }, () => []);
    for (let i = 0; i < games.length; i++) {
        batches[i % actualWorkers].push(games[i]);
    }

    // Convert params to transferable arrays (copy once, each worker gets its own view)
    const challengerArr = Array.from(challengerParams);
    const championArr = championParams ? Array.from(championParams) : null;

    // Launch all workers
    const workerPromises = batches.map((batch) => {
        return new Promise((resolve, reject) => {
            const worker = new Worker(WORKER_PATH, {
                workerData: {
                    challengerParamsArr: challengerArr,
                    championParamsArr: championArr,
                    games: batch,
                    config: {
                        mctsSims: config.mctsSims,
                        cPuct: config.cPuct,
                        dirichletAlpha: config.dirichletAlpha,
                        dirichletWeight: config.dirichletWeight,
                        temperatureMoves: config.temperatureMoves,
                        valueTargetBlend: config.valueTargetBlend ?? 0,
                        heuristicBlend: config.heuristicBlend ?? 0,
                        heuristicScale: config.heuristicScale ?? 580,
                    },
                },
            });
            worker.on('message', (msg) => resolve(msg));
            worker.on('error', reject);
            worker.on('exit', (code) => {
                if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
            });
        });
    });

    // Wait for all workers to finish
    const results = await Promise.all(workerPromises);

    // Aggregate
    const allExamples = [];
    let winsVsStatic = 0, lossesVsStatic = 0, gamesVsStatic = 0;

    for (const result of results) {
        allExamples.push(...result.examples);
        winsVsStatic += result.stats.winsVsStatic;
        lossesVsStatic += result.stats.lossesVsStatic;
        gamesVsStatic += result.stats.gamesVsStatic;
    }

    return {
        examples: allExamples,
        stats: { winsVsStatic, lossesVsStatic, gamesVsStatic },
    };
};
