// training/compact/bot.mjs
// Compact search-guided bot: reuse the existing Flood alpha-beta search,
// but replace the hand-tuned leaf evaluator with the 116-feature value net.

import { BOT_STRATEGY, getMovePhaseProfile } from '../engine/core.mjs';
import { getBestSearchAction } from '../engine/search.mjs';
import { floodBotStaticMove } from '../bot/tiers.mjs';
import { encodeState } from '../td/encode.mjs';
import { forward } from '../td/cnn-network.mjs';

const COMPACT_STAGE_OVERRIDES = {
    early: {
        depth: 4,
        rootMoveLimit: 8,
        nodeMoveLimit: 5,
        discardLimit: 1,
        tacticalWidth: 3,
        staticBlend: 0.02,
        timeMs: 38,
        nodeBudget: 2600
    },
    late: {
        depth: 4,
        rootMoveLimit: 9,
        nodeMoveLimit: 5,
        discardLimit: 2,
        tacticalWidth: 4,
        staticBlend: 0.02,
        timeMs: 52,
        nodeBudget: 4200
    },
    endgame: {
        depth: 5,
        rootMoveLimit: 10,
        nodeMoveLimit: 6,
        discardLimit: 2,
        tacticalWidth: 4,
        staticBlend: 0.015,
        timeMs: 76,
        nodeBudget: 7600
    }
};

export const createCompactLeafEvaluator = (params, {
    leafScale = 420
} = {}) => (state, player) => {
    const { value } = forward(params, encodeState(state, player));
    return value * leafScale;
};

const getStageKey = (state, player) => {
    const phase = getMovePhaseProfile(state, player);
    if (phase.endgame) return 'endgame';
    if (phase.lateGame) return 'late';
    return 'early';
};

export const makeCompactSearchBot = (params, {
    name = 'CompactSearch',
    leafScale = 420,
    leafBlend = 0.85,
    stageOverrides = COMPACT_STAGE_OVERRIDES
} = {}) => {
    const leafEvaluator = createCompactLeafEvaluator(params, { leafScale });
    return {
        name,
        getMove(state, player) {
            if (state.gamePhase === 'setup') {
                return floodBotStaticMove(state, player);
            }
            if (state.gamePhase !== 'playing') {
                return null;
            }
            const stageKey = getStageKey(state, player);
            const decision = getBestSearchAction(state, player, {
                ...stageOverrides[stageKey],
                leafBlend,
                leafEvaluator
            });
            const action = decision.bestAction;
            if (!action) {
                return floodBotStaticMove(state, player);
            }
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
        }
    };
};

export const COMPACT_SEARCH_CONFIG = {
    leafScale: 420,
    leafBlend: 0.85,
    stageOverrides: COMPACT_STAGE_OVERRIDES
};
