// training/bot/tiers.mjs
// Tiered wrappers around the headless Flood bot. These are the opponents
// that self-play agents train against. All three share the same heuristic
// port but differ in whether/how they search.

import {
    BOT_STRATEGY,
    BOARD_SIZE,
    HAND_SIZE,
    getHomeRow,
    otherPlayer,
    getPlayerState,
    getLegalMoves
} from '../engine/core.mjs';
import {
    getRankedMoves,
    getRankedDiscardChoices,
    getRankedSetupChoices,
    getPreferredSetupColumns
} from '../engine/heuristic.mjs';
import { getBestSearchAction } from '../engine/search.mjs';

/** Pick a move for `player` in state. Expected to return either:
 *    - { type: 'place', slotIndex, row, col }
 *    - { type: 'discard', slotIndex }
 *  or null if there are no legal moves.
 *  The state's currentPlayer should equal `player`. */

// ---------- FloodBotStatic ----------
// Pure static heuristic, no search. Matches the "staticScore" ordering the
// browser bot uses as its move prior before any tree search. Also handles
// the setup phase via getRankedSetupChoices and first-move column logic.

export const floodBotStaticMove = (state, player) => {
    if (state.gamePhase === 'setup') {
        // Pick best setup card via heuristic, place at preferred home-row col
        const choices = getRankedSetupChoices(state, player);
        if (!choices.length) return null;
        const { card, index } = choices[0];
        const homeRow = getHomeRow(player);
        const cols = state.setupWidePlacement ? getPreferredSetupColumns() : [2];
        const targetCol = cols.find((col) => !state.board[homeRow][col]) ?? 2;
        return { type: 'place', slotIndex: index, row: homeRow, col: targetCol };
    }
    if (state.gamePhase === 'playing') {
        const moves = getRankedMoves(state, player);
        if (moves.length > 0) {
            const best = moves[0];
            return { type: 'place', slotIndex: best.slotIndex, row: best.row, col: best.col };
        }
        // No placement available - try discard (only if opening move is done)
        if (state.openingMoveComplete) {
            const discards = getRankedDiscardChoices(state, player);
            if (discards.length > 0) {
                return { type: 'discard', slotIndex: discards[0].slotIndex };
            }
        }
        return null;
    }
    return null;
};

export const FloodBotStatic = {
    name: 'FloodBotStatic',
    getMove: floodBotStaticMove
};

// ---------- FloodBotShallow ----------
// Depth-2 alpha-beta with a tight node/time budget. About 5-10x slower than
// Static but dramatically stronger — catches obvious one-move traps.

export const floodBotShallowMove = (state, player) => {
    // Setup and no-hand cases: defer to static logic (search only applies
    // to the playing phase with real options).
    if (state.gamePhase !== 'playing') return floodBotStaticMove(state, player);
    const moves = getRankedMoves(state, player);
    if (moves.length === 0 && !state.openingMoveComplete) return floodBotStaticMove(state, player);
    const decision = getBestSearchAction(state, player, {
        depth: 2,
        rootMoveLimit: 6,
        nodeMoveLimit: 4,
        discardLimit: 1,
        tacticalWidth: 2,
        staticBlend: 0.05,
        timeMs: 12,
        nodeBudget: 600
    });
    if (!decision.bestAction) return floodBotStaticMove(state, player);
    const a = decision.bestAction;
    return a.type === 'move'
        ? { type: 'place', slotIndex: a.slotIndex, row: a.row, col: a.col }
        : { type: 'discard', slotIndex: a.slotIndex ?? a.index };
};

export const FloodBotShallow = {
    name: 'FloodBotShallow',
    getMove: floodBotShallowMove
};

// ---------- FloodBotFull ----------
// Exactly the phased config the browser bot uses in BOT_STRATEGY.search.config.
// This is the headline baseline the RL bot must eventually beat.

export const floodBotFullMove = (state, player) => {
    if (state.gamePhase !== 'playing') return floodBotStaticMove(state, player);
    const decision = getBestSearchAction(state, player); // no overrides = use phased config
    if (!decision.bestAction) return floodBotStaticMove(state, player);
    const a = decision.bestAction;
    return a.type === 'move'
        ? { type: 'place', slotIndex: a.slotIndex, row: a.row, col: a.col }
        : { type: 'discard', slotIndex: a.slotIndex ?? a.index };
};

export const FloodBotFull = {
    name: 'FloodBotFull',
    getMove: floodBotFullMove
};
