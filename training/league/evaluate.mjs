// training/league/evaluate.mjs
// SPRT promotion evaluator: paired seeds + side-swap + Wilson CIs.
// Used to decide whether a new challenger should replace the current champion.

import { newGame, applyMove, isTerminal, getWinner, getLegalMoves } from '../engine/core.mjs';

/** Wilson score 95% confidence interval for a binomial proportion. */
export const wilsonInterval = (wins, n, z = 1.96) => {
    if (n === 0) return { lo: 0, hi: 1, point: 0 };
    const p = wins / n;
    const denom = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / denom;
    const halfWidth = (z / denom) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return { lo: Math.max(0, center - halfWidth), hi: Math.min(1, center + halfWidth), point: p };
};

/** Play one game between two bots with a given seed. */
const playOne = (redBot, blackBot, seed) => {
    const state = newGame({ seed });
    let turns = 0;
    while (!isTerminal(state) && state.gamePhase !== 'ended' && turns < 300) {
        const bot = state.currentPlayer === 'red' ? redBot : blackBot;
        let move = bot.getMove(state, state.currentPlayer);
        if (!move) {
            const legal = getLegalMoves(state, state.currentPlayer);
            if (legal.length === 0) break;
            move = legal[0]; // deterministic fallback — shouldn't happen in practice
        }
        applyMove(state, move);
        turns += 1;
    }
    return { winner: getWinner(state), turns };
};

/** Sequential probability ratio test for H0: p = p0 vs H1: p = p1.
 *  Returns one of 'accept_h1', 'accept_h0', 'continue' after each game.
 *  Early-stops when likelihood ratio crosses the upper or lower bound. */
export const sprtDecision = (wins, losses, { p0 = 0.5, p1 = 0.60, alpha = 0.05, beta = 0.05 } = {}) => {
    // Log-likelihood ratio under Bernoulli(p1) vs Bernoulli(p0)
    // llr = wins * log(p1/p0) + losses * log((1-p1)/(1-p0))
    const llr = wins * Math.log(p1 / p0) + losses * Math.log((1 - p1) / (1 - p0));
    const upper = Math.log((1 - beta) / alpha);
    const lower = Math.log(beta / (1 - alpha));
    if (llr >= upper) return 'accept_h1';
    if (llr <= lower) return 'accept_h0';
    return 'continue';
};

/** Run a paired match with side-swap and SPRT early-stop.
 *  Returns { aWins, bWins, ties, decision, totalGames, winRate, wilson }. */
export const evaluateChallenger = (challenger, champion, {
    minGames = 40,      // min paired (×2 for both sides)
    maxGames = 200,     // max paired
    sprtP0 = 0.5,
    sprtP1 = 0.60,
    sprtAlpha = 0.05,
    sprtBeta = 0.05,
    seedPrefix = 'promo',
    useSprt = true
} = {}) => {
    let aWins = 0, bWins = 0, ties = 0;
    let totalGames = 0;
    let decision = 'continue';
    for (let i = 0; i < maxGames; i++) {
        const seed = `${seedPrefix}:${i}`;
        // Challenger as red, champion as black
        const r1 = playOne(challenger, champion, seed);
        if (r1.winner === 'red') aWins++;
        else if (r1.winner === 'black') bWins++;
        else ties++;
        // Challenger as black, champion as red
        const r2 = playOne(champion, challenger, seed);
        if (r2.winner === 'black') aWins++;
        else if (r2.winner === 'red') bWins++;
        else ties++;
        totalGames += 2;
        if (useSprt && totalGames >= minGames) {
            // Count ties as half-wins for each side when feeding SPRT
            const adjWins = aWins + ties * 0.5;
            const adjLosses = bWins + ties * 0.5;
            decision = sprtDecision(adjWins, adjLosses, {
                p0: sprtP0, p1: sprtP1, alpha: sprtAlpha, beta: sprtBeta
            });
            if (decision !== 'continue') break;
        }
    }
    const winRate = totalGames > 0 ? (aWins + ties * 0.5) / totalGames : 0;
    const wilson = wilsonInterval(aWins + ties * 0.5, totalGames);
    return { aWins, bWins, ties, decision, totalGames, winRate, wilson };
};

/** Return true if challenger clearly beats champion per SPRT and multi-gate. */
export const shouldPromote = (result, { winRateFloor = 0.60 } = {}) =>
    result.decision === 'accept_h1' && result.winRate >= winRateFloor;
