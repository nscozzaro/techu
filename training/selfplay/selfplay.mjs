// training/selfplay/selfplay.mjs
// Single-process self-play loop. MCTS plays both sides (or MCTS vs a
// fixed opponent) and returns a trajectory of (state, policy, value)
// training examples.
//
// Trajectory shape: { examples: Array<{ input, mask, policy, perspective }>,
//                     winner: 'red'|'black'|null, turns: number }

import { newGame, applyMove, isTerminal, getWinner, getScores, otherPlayer, cloneState, getLegalMoves } from '../engine/core.mjs';
import { INPUT_SIZE, ACTION_SIZE, encodeState, encodeActionMask, decodeAction } from '../engine/encoding.mjs';
import { runMcts, sampleFromDistribution } from '../mcts/mcts.mjs';

/** Play one self-play game. `getMoveForPlayer(state, player)` is called for
 *  each player's turn. In full self-play, both are MCTS with the same params.
 *  Returns training examples + game outcome. */
export const playSelfPlayGame = ({
    params,
    seed,
    numSimulations = 64,
    cPuct = 1.5,
    dirichletAlpha = 0.25,
    dirichletWeight = 0.25,
    temperatureMoves = 20,
    opponent = null, // optional: { getMove(state, player) } — the non-learner
    learnerPlayer = null, // 'red' | 'black' — which side is learning
    rng = Math.random
} = {}) => {
    const state = newGame({ seed });
    const examples = [];
    let turns = 0;
    const MAX_TURNS = 300;
    while (!isTerminal(state) && state.gamePhase !== 'ended' && turns < MAX_TURNS) {
        const current = state.currentPlayer;
        const useLearner = opponent == null || current === learnerPlayer;
        let move;
        if (useLearner) {
            // MCTS for the learner
            const temperature = turns < temperatureMoves ? 1.0 : 0.0;
            const { visitDistribution } = runMcts(state, current, params, {
                numSimulations,
                cPuct,
                dirichletAlpha,
                dirichletWeight,
                rng
            });
            // Record training example
            const input = encodeState(state, current);
            const mask = encodeActionMask(state, current);
            examples.push({
                input,
                mask,
                policy: visitDistribution,
                perspective: current
            });
            const actionIdx = sampleFromDistribution(visitDistribution, temperature, rng);
            if (actionIdx < 0) break;
            move = decodeAction(actionIdx);
        } else {
            move = opponent.getMove(state, current);
            if (!move) {
                // Fallback: random legal
                const legal = getLegalMoves(state, current);
                if (legal.length === 0) break;
                move = legal[Math.floor(rng() * legal.length)];
            }
        }
        applyMove(state, move);
        turns += 1;
    }
    const winner = getWinner(state);
    // Label each example with the game outcome from its perspective
    for (const ex of examples) {
        if (winner === null) ex.targetValue = 0;
        else if (winner === ex.perspective) ex.targetValue = 1;
        else ex.targetValue = -1;
    }
    return { examples, winner, turns, scores: getScores(state) };
};

/** Play a match between two bots, paired seeds and side-swap.
 *  Returns { aWins, bWins, ties, totalGames, avgTurns }. */
export const playMatch = (botA, botB, numPairs, { seedPrefix = 'match' } = {}) => {
    let aWins = 0, bWins = 0, ties = 0, totalTurns = 0;
    for (let i = 0; i < numPairs; i++) {
        const seed = `${seedPrefix}:${i}`;
        // A as red
        const r1 = playSingleGame(botA, botB, seed);
        if (r1.winner === 'red') aWins++;
        else if (r1.winner === 'black') bWins++;
        else ties++;
        totalTurns += r1.turns;
        // A as black
        const r2 = playSingleGame(botB, botA, seed);
        if (r2.winner === 'black') aWins++;
        else if (r2.winner === 'red') bWins++;
        else ties++;
        totalTurns += r2.turns;
    }
    const totalGames = 2 * numPairs;
    return { aWins, bWins, ties, totalGames, avgTurns: totalTurns / totalGames };
};

const playSingleGame = (redBot, blackBot, seed) => {
    const state = newGame({ seed });
    let turns = 0;
    const MAX_TURNS = 300;
    while (!isTerminal(state) && state.gamePhase !== 'ended' && turns < MAX_TURNS) {
        const bot = state.currentPlayer === 'red' ? redBot : blackBot;
        const move = bot.getMove(state, state.currentPlayer);
        if (!move) {
            const legal = getLegalMoves(state, state.currentPlayer);
            if (legal.length === 0) break;
            applyMove(state, legal[Math.floor(Math.random() * legal.length)]);
        } else {
            applyMove(state, move);
        }
        turns += 1;
    }
    return { winner: getWinner(state), turns };
};

/** Wrap MLP params in a bot interface for head-to-head matches.
 *  Runs greedy MCTS with temperature 0. */
export const makeMctsBot = (params, { name = 'MCTS', numSimulations = 64, cPuct = 1.5 } = {}) => ({
    name,
    getMove: (state, player) => {
        const { visitDistribution } = runMcts(state, player, params, {
            numSimulations, cPuct, dirichletAlpha: 0
        });
        const actionIdx = sampleFromDistribution(visitDistribution, 0);
        return actionIdx < 0 ? null : decodeAction(actionIdx);
    }
});
