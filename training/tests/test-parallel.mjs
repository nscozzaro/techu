import { runParallelSelfPlay } from '../selfplay/pool.mjs';
import { createParams, PARAM_COUNT } from '../net/mlp.mjs';
import os from 'os';

const params = createParams(42);
const games = Array.from({length: 8}, (_, i) => ({
    seed: `test:${i}`,
    opponentType: i < 4 ? 'self' : 'static',
    learnerPlayer: i % 2 === 0 ? 'red' : 'black',
}));

console.log(`Testing parallel self-play with ${os.cpus().length} workers, 8 games...`);
const t0 = Date.now();
const result = await runParallelSelfPlay({
    challengerParams: params,
    championParams: params,
    games,
    config: { mctsSims: 32, cPuct: 1.5, dirichletAlpha: 0.25, dirichletWeight: 0.25, temperatureMoves: 10, valueTargetBlend: 0.25 },
    numWorkers: os.cpus().length,
});
console.log(`Done in ${((Date.now()-t0)/1000).toFixed(1)}s`);
console.log(`Examples: ${result.examples.length}`);
console.log(`Stats:`, result.stats);
console.log(`Sample example keys:`, Object.keys(result.examples[0]));
console.log(`Input size: ${result.examples[0].input.length}, mask size: ${result.examples[0].mask.length}`);
console.log('✓ Parallel self-play works');
