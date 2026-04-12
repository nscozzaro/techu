// training/engine/search.mjs
// Iterative-deepening alpha-beta minimax matching index.html:5723-6145 exactly.
// Uses mutate-revert on the GameState for speed (no deep clones per node).
//
// Public entry:
//   getBestSearchAction(state, botPlayer, configOverride?) -> {
//     bestAction, rankedActions, searchedDepth, timedOut, nodes, config
//   }
//
// The `SEARCH_TIMEOUT` sentinel is thrown from touchSearchNode and caught by
// the iterative-deepening loop to implement anytime behavior.

import {
    BOT_STRATEGY,
    BOARD_SIZE,
    HAND_SIZE,
    DIRECTIONS,
    otherPlayer,
    getHomeRow,
    getCardValue,
    getPlayerState,
    isValidMove,
    getBoardMetrics,
    getConnectedCellKeys,
    getFrontierCellKeys,
    countAdjacentOwned,
    countDiagonalOwned,
    getForwardProgress,
    isOwnSideRow,
    isOpponentSideRow,
    getMovePhaseProfile,
    forEachBoardCell,
    countUnknownHigherCards,
    findLeastWinningCard,
    isDevelopmentCard,
    isPowerCard,
    isPremiumCard,
    isUtilityCard,
    isFinisherCard,
    isAceCard,
    isTerminal,
    getScores
} from './core.mjs';

import {
    evaluateMove,
    getRankedMoves,
    getRankedDiscardChoices,
    estimateReplyRisk
} from './heuristic.mjs';

export const SEARCH_TIMEOUT = Symbol('flood-search-timeout');

// ====== Phase-based config selection (index.html:5905-5913) ======

export const getSearchConfig = (state, botPlayer) => {
    const phase = getMovePhaseProfile(state, botPlayer);
    const stage = phase.reserveCards <= 8
        ? BOT_STRATEGY.search.config.endgame
        : phase.reserveCards <= 12 || phase.emptyCells <= 9
            ? BOT_STRATEGY.search.config.late
            : BOT_STRATEGY.search.config.early;
    return { ...stage };
};

// ====== Session/budget (index.html:5914-5934) ======

export const createSearchSession = (config) => {
    const startTime = performance.now();
    return {
        startTime,
        deadline: startTime + (config.timeMs ?? 24),
        nodeBudget: config.nodeBudget ?? 1200,
        nodes: 0
    };
};

const isSearchBudgetExceeded = (session) =>
    session.nodes >= session.nodeBudget || performance.now() >= session.deadline;

const touchSearchNode = (session) => {
    if (!session) return;
    session.nodes += 1;
    if (session.nodes >= session.nodeBudget) throw SEARCH_TIMEOUT;
    if (performance.now() >= session.deadline) throw SEARCH_TIMEOUT;
};

// ====== State snapshot/restore for tree search ======
// These avoid cloning on every node by mutating and rolling back.

const cloneSearchCell = (cell) => cell ? {
    card: cell.card,
    owner: cell.owner,
    faceUp: cell.faceUp,
    coveredCell: cloneSearchCell(cell.coveredCell)
} : null;

const captureSearchState = (state) => ({
    board: state.board.map((row) => row.map((cell) => cloneSearchCell(cell))),
    redHand: [...state.redHand],
    blackHand: [...state.blackHand],
    redDeck: [...state.redDeck],
    blackDeck: [...state.blackDeck],
    redDiscard: [...state.redDiscard],
    blackDiscard: [...state.blackDiscard],
    currentPlayer: state.currentPlayer,
    openingMoveComplete: state.openingMoveComplete,
    gamePhase: state.gamePhase,
    searchFocus: state._searchFocus ? { ...state._searchFocus } : null
});

const restoreSearchState = (state, snap) => {
    state.board = snap.board.map((row) => row.map((cell) => cloneSearchCell(cell)));
    state.redHand = [...snap.redHand];
    state.blackHand = [...snap.blackHand];
    state.redDeck = [...snap.redDeck];
    state.blackDeck = [...snap.blackDeck];
    state.redDiscard = [...snap.redDiscard];
    state.blackDiscard = [...snap.blackDiscard];
    state.currentPlayer = snap.currentPlayer;
    state.openingMoveComplete = snap.openingMoveComplete;
    state.gamePhase = snap.gamePhase;
    state._searchFocus = snap.searchFocus ? { ...snap.searchFocus } : null;
};

const drawSearchCard = (state, player) => {
    const { deck, hand } = getPlayerState(state, player);
    const empty = hand.findIndex((s) => s === null);
    if (empty === -1 || deck.length === 0) return;
    hand[empty] = deck.pop();
};

const advanceSearchTurn = (state, nextPlayer) => {
    state.currentPlayer = nextPlayer;
    state.openingMoveComplete = true;
    let safety = 0;
    while (safety++ < 4) {
        if (isTerminal(state)) return;
        const { hand, deck } = getPlayerState(state, state.currentPlayer);
        const hasCards = hand.some((c) => c !== null);
        if (hasCards || deck.length > 0) break;
        state.currentPlayer = otherPlayer(state.currentPlayer);
    }
    if (isTerminal(state)) {
        state.gamePhase = 'ended';
        return;
    }
    drawSearchCard(state, state.currentPlayer);
};

const applySearchAction = (state, action, player) => {
    if (action.type === 'move') {
        const targetCell = state.board[action.row][action.col];
        state._searchFocus = {
            row: action.row,
            col: action.col,
            player,
            targetOwner: targetCell?.owner ?? null
        };
        getPlayerState(state, player).hand[action.slotIndex] = null;
        state.board[action.row][action.col] = {
            card: action.card,
            owner: player,
            faceUp: true,
            coveredCell: null
        };
    } else {
        const { hand, discard } = getPlayerState(state, player);
        hand[action.index ?? action.slotIndex] = null;
        discard.push(action.card);
        state._searchFocus = null;
    }
    advanceSearchTurn(state, otherPlayer(player));
};

// ====== Home-row expansion moves (index.html:6259-6273) ======

const getHomeRowExpansionMoves = (state, player) => {
    const homeRow = getHomeRow(player);
    const { hand } = getPlayerState(state, player);
    const moves = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
        if (state.board[homeRow][col]) continue;
        hand.forEach((card, slotIndex) => {
            if (card !== null && isValidMove(state, homeRow, col, card, player)) {
                const score = evaluateMove(state, homeRow, col, card, player);
                moves.push({ row: homeRow, col, card, slotIndex, score });
            }
        });
    }
    return moves.sort((a, b) => b.score - a.score);
};

const hasHomeRowExpansionMove = (state, player) => getHomeRowExpansionMoves(state, player).length > 0;

// ====== Focused response + tactical moves (index.html:5779-5862) ======

const getFocusedResponseMoves = (state, player, row, col, limit = 2) => {
    const targetCell = state.board[row]?.[col];
    if (!targetCell) return [];
    const targetValue = getCardValue(targetCell.card);
    const { hand } = getPlayerState(state, player);
    return hand
        .map((card, slotIndex) => {
            if (!card || !isValidMove(state, row, col, card, player)) return null;
            const gap = getCardValue(card) - targetValue;
            if (gap <= 0) return null;
            return {
                row, col, card, slotIndex, gap,
                score: evaluateMove(state, row, col, card, player)
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            const gapDiff = a.gap - b.gap;
            if (gapDiff !== 0) return gapDiff;
            const scoreDiff = b.score - a.score;
            if (scoreDiff !== 0) return scoreDiff;
            return getCardValue(a.card) - getCardValue(b.card);
        })
        .slice(0, limit);
};

const getTacticalSearchActions = (state, player, config, depth) => {
    const opponent = otherPlayer(player);
    const tacticalMoves = [];
    const addMove = (move, bonus = 0) => {
        if (!move) return;
        tacticalMoves.push({
            ...move,
            type: 'move',
            staticScore: move.score + bonus,
            score: move.score + bonus
        });
    };
    if (state._searchFocus) {
        const focus = state._searchFocus;
        const focusCell = state.board[focus.row]?.[focus.col];
        if (focusCell && focusCell.owner === opponent) {
            getFocusedResponseMoves(
                state, player, focus.row, focus.col,
                Math.min(3, (config.tacticalWidth ?? 3) + (depth === config.depth ? 1 : 0))
            ).forEach((move, index) => addMove(move, 24 - index * 6));
        }
    }
    const targets = [];
    forEachBoardCell(state, (cell, row, col) => {
        if (cell.owner !== opponent) return;
        let urgency = getCardValue(cell.card) * 1.8;
        if (row === 2 && col === 2) urgency += 18;
        if (isOwnSideRow(row, player)) urgency += 14;
        if (row === getHomeRow(player)) urgency += 12;
        if (state._searchFocus && row === state._searchFocus.row && col === state._searchFocus.col) urgency += 30;
        if (urgency < 18) return;
        targets.push({ row, col, urgency });
    });
    targets
        .sort((a, b) => b.urgency - a.urgency)
        .slice(0, config.tacticalWidth ?? 3)
        .forEach((target) => {
            getFocusedResponseMoves(state, player, target.row, target.col, 2)
                .forEach((move, index) => addMove(move, target.urgency * 0.25 - index * 4));
        });
    const deduped = new Map();
    tacticalMoves.forEach((move) => {
        const key = getSearchActionKey(move);
        const current = deduped.get(key);
        if (!current || move.staticScore > current.staticScore) deduped.set(key, move);
    });
    return [...deduped.values()].sort((a, b) => {
        const scoreDiff = b.staticScore - a.staticScore;
        if (scoreDiff !== 0) return scoreDiff;
        return getCardValue(a.card) - getCardValue(b.card);
    });
};

// ====== Action key + ranked actions (index.html:5774-5978) ======

const cardToCode = (card) => card ? `${card.rank}${card.suit}` : null;

const getSearchActionKey = (action) =>
    action.type === 'move'
        ? `move:${action.row}:${action.col}:${action.slotIndex}:${cardToCode(action.card)}`
        : `discard:${action.index ?? action.slotIndex}:${cardToCode(action.card)}`;

export const getRankedSearchActions = (state, player, config, depth) => {
    const moveLimit = depth === config.depth ? config.rootMoveLimit : config.nodeMoveLimit;
    const baseMoves = getRankedMoves(state, player)
        .slice(0, moveLimit)
        .map((move) => ({ ...move, type: 'move', staticScore: move.score }));
    const homeRowMoves = getHomeRowExpansionMoves(state, player)
        .map((move) => ({ ...move, type: 'move', staticScore: move.score }));
    const tacticalMoves = getTacticalSearchActions(state, player, config, depth);
    const canExpandHomeRow = homeRowMoves.length > 0;
    // canDiscard: playing phase + openingMoveComplete + not setup
    const canDiscard = state.gamePhase === 'playing' && state.openingMoveComplete;
    const discards = canDiscard && !canExpandHomeRow
        ? getRankedDiscardChoices(state, player)
            .slice(0, config.discardLimit)
            .map((option) => ({
                ...option, type: 'discard', staticScore: option.score
            }))
        : [];
    const merged = new Map();
    [...baseMoves, ...homeRowMoves, ...tacticalMoves, ...discards].forEach((action) => {
        const normalized = {
            ...action,
            staticScore: Number.isFinite(action.staticScore) ? action.staticScore : action.score,
            score: Number.isFinite(action.score) ? action.score : action.staticScore
        };
        const key = getSearchActionKey(normalized);
        const current = merged.get(key);
        if (!current || normalized.staticScore > current.staticScore) {
            merged.set(key, normalized);
        }
    });
    return [...merged.values()].sort((a, b) => {
        const scoreDiff = b.staticScore - a.staticScore;
        if (scoreDiff !== 0) return scoreDiff;
        return getCardValue(a.card) - getCardValue(b.card);
    });
};

// ====== Leaf evaluator (index.html:5864-5903) ======

const countLegalMoves = (state, player) => {
    const { hand } = getPlayerState(state, player);
    let total = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            for (const card of hand) {
                if (card && isValidMove(state, r, c, card, player)) total++;
            }
        }
    }
    return total;
};

const evaluateHandForSearch = (state, player) => {
    const opponent = otherPlayer(player);
    const { hand, deck } = getPlayerState(state, player);
    const metrics = getBoardMetrics(state, player);
    return hand.filter(Boolean).reduce((total, card) => {
        const value = getCardValue(card);
        let cardScore = isPowerCard(value) ? 10 : 0;
        if (isUtilityCard(value)) cardScore += 6 + metrics.openHomeSpaces * 1.4;
        if (countUnknownHigherCards(state, opponent, value, { includeHand: true }) === 0) cardScore += 6;
        if (isPremiumCard(value) && metrics.openHomeSpaces <= 1) cardScore -= 6;
        return total + cardScore;
    }, deck.length * 1.5);
};

const evaluateImmediateCapturePressure = (state, player) => {
    const opponent = otherPlayer(player);
    const { hand } = getPlayerState(state, player);
    let pressure = 0;
    forEachBoardCell(state, (cell, row, col) => {
        if (cell.owner !== opponent) return;
        const targetValue = getCardValue(cell.card);
        let cheapestGap = Infinity;
        hand.forEach((card) => {
            if (!card || !isValidMove(state, row, col, card, player)) return;
            const gap = getCardValue(card) - targetValue;
            if (gap > 0 && gap < cheapestGap) cheapestGap = gap;
        });
        if (!Number.isFinite(cheapestGap)) return;
        let swing = targetValue * 2.2 + Math.max(0, 11 - cheapestGap * 2.2);
        if (row === 2 && col === 2) swing += 9;
        if (isOwnSideRow(row, player)) swing += 7;
        if (isOpponentSideRow(row, player)) swing += 4;
        pressure += swing;
    });
    return pressure;
};

export const evaluateSearchPosition = (state, botPlayer) => {
    const opponent = otherPlayer(botPlayer);
    const selfMetrics = getBoardMetrics(state, botPlayer);
    const opponentMetrics = getBoardMetrics(state, opponent);
    const phase = getMovePhaseProfile(state, botPlayer);
    const stage = phase.endgame
        ? BOT_STRATEGY.search.position.endgame
        : phase.lateGame
            ? BOT_STRATEGY.search.position.late
            : BOT_STRATEGY.search.position.early;
    const scores = getScores(state);
    const scoreDiff = scores[botPlayer] - scores[opponent];
    const ownMobility = countLegalMoves(state, botPlayer);
    const oppMobility = countLegalMoves(state, opponent);
    const ownThreat = evaluateImmediateCapturePressure(state, botPlayer);
    const oppThreat = evaluateImmediateCapturePressure(state, opponent);
    let ownPressure = 0, oppPressure = 0;
    forEachBoardCell(state, (cell, row) => {
        if (cell.owner === botPlayer && isOpponentSideRow(row, botPlayer)) ownPressure++;
        if (cell.owner === opponent && isOpponentSideRow(row, opponent)) oppPressure++;
    });
    return (
        scoreDiff * stage.score +
        (selfMetrics.connected.size - opponentMetrics.connected.size) * stage.connected +
        (opponentMetrics.disconnectedValue - selfMetrics.disconnectedValue) * stage.disconnected +
        (selfMetrics.frontier.size - opponentMetrics.frontier.size) * stage.frontier +
        (ownPressure - oppPressure) * stage.pressure +
        (ownMobility - oppMobility) * stage.mobility +
        (ownThreat - oppThreat) * stage.threat +
        (evaluateHandForSearch(state, botPlayer) - evaluateHandForSearch(state, opponent)) * stage.hand +
        (opponentMetrics.openHomeSpaces - selfMetrics.openHomeSpaces) * stage.home
    );
};

const getTerminalSearchScore = (state, botPlayer) => {
    const scores = getScores(state);
    const userPlayer = otherPlayer(botPlayer);
    const diff = scores[botPlayer] - scores[userPlayer];
    if (diff > 0) return 100000 + diff * 1000;
    if (diff < 0) return -100000 + diff * 1000;
    return 0;
};

// ====== Transposition state key ======

const encodeCard = (card) => card ? `${card.rank}${card.suit}` : '--';

const encodeCell = (cell) => {
    if (!cell) return '__';
    const parts = [];
    let current = cell;
    while (current) {
        parts.push(`${current.owner[0]}:${encodeCard(current.card)}:${current.faceUp ? 'u' : 'd'}`);
        current = current.coveredCell;
    }
    return parts.join('>');
};

const getSearchStateKey = (state, depth) => {
    const boardKey = state.board.map((row) => row.map(encodeCell).join(',')).join('/');
    const focusKey = state._searchFocus
        ? `${state._searchFocus.row},${state._searchFocus.col},${state._searchFocus.player},${state._searchFocus.targetOwner ?? '_'}`
        : 'none';
    return [
        depth,
        state.currentPlayer,
        state.openingMoveComplete ? '1' : '0',
        focusKey,
        boardKey,
        state.redHand.map(encodeCard).join(','),
        state.blackHand.map(encodeCard).join(','),
        state.redDeck.map(encodeCard).join(','),
        state.blackDeck.map(encodeCard).join(','),
        state.redDiscard.map(encodeCard).join(','),
        state.blackDiscard.map(encodeCard).join(',')
    ].join('|');
};

// ====== searchGameTree (alpha-beta, index.html:6036-6077) ======

const searchGameTree = (state, botPlayer, depth, alpha, beta, cache, config, session) => {
    touchSearchNode(session);
    if (isTerminal(state)) {
        return getTerminalSearchScore(state, botPlayer);
    }
    if (depth <= 0) {
        return evaluateSearchPosition(state, botPlayer);
    }
    const key = getSearchStateKey(state, depth);
    if (cache.has(key)) return cache.get(key);

    const player = state.currentPlayer;
    const maximizing = player === botPlayer;
    const actions = getRankedSearchActions(state, player, config, depth);
    if (!actions.length) {
        const fallback = evaluateSearchPosition(state, botPlayer);
        cache.set(key, fallback);
        return fallback;
    }
    let best = maximizing ? -Infinity : Infinity;
    for (const action of actions) {
        const snap = captureSearchState(state);
        let value;
        try {
            applySearchAction(state, action, player);
            value = searchGameTree(state, botPlayer, depth - 1, alpha, beta, cache, config, session);
        } finally {
            restoreSearchState(state, snap);
        }
        if (maximizing) {
            best = Math.max(best, value);
            alpha = Math.max(alpha, best);
        } else {
            best = Math.min(best, value);
            beta = Math.min(beta, best);
        }
        if (beta <= alpha) break;
    }
    cache.set(key, best);
    return best;
};

// ====== getBestSearchAction (iterative deepening, index.html:6078-6145) ======

export const getBestSearchAction = (state, botPlayer, configOverride = null) => {
    // Prepare a mutable copy that we'll mutate-and-revert during search.
    // Use captureSearchState / restoreSearchState for the game state copy
    // so we don't stomp caller's state.
    const snap = captureSearchState(state);
    const searchState = { ...state };
    restoreSearchState(searchState, snap);
    searchState._searchFocus = null;

    const config = configOverride ? { ...getSearchConfig(searchState, botPlayer), ...configOverride } : getSearchConfig(searchState, botPlayer);
    const baseActions = getRankedSearchActions(searchState, botPlayer, config, config.depth)
        .map((action) => ({
            ...action,
            searchScore: action.staticScore,
            score: action.staticScore
        }));
    if (!baseActions.length) {
        return { bestAction: null, rankedActions: [], config, searchedDepth: 0, timedOut: false, nodes: 0 };
    }
    const session = createSearchSession(config);
    let rankedActions = baseActions;
    let bestCompleted = {
        bestAction: rankedActions[0] ? { ...rankedActions[0] } : null,
        rankedActions: rankedActions.map((a) => ({ ...a })),
        config,
        searchedDepth: 0,
        timedOut: false
    };
    for (let depth = 1; depth <= config.depth; depth++) {
        if (isSearchBudgetExceeded(session)) break;
        const cache = new Map();
        let completedDepth = true;
        for (const action of rankedActions) {
            if (isSearchBudgetExceeded(session)) {
                completedDepth = false;
                break;
            }
            const snap2 = captureSearchState(searchState);
            try {
                applySearchAction(searchState, action, botPlayer);
                const searchScore = searchGameTree(searchState, botPlayer, depth - 1, -Infinity, Infinity, cache, config, session);
                action.searchScore = searchScore;
                action.score = searchScore + action.staticScore * config.staticBlend;
            } catch (error) {
                if (error !== SEARCH_TIMEOUT) throw error;
                completedDepth = false;
                break;
            } finally {
                restoreSearchState(searchState, snap2);
            }
        }
        rankedActions.sort((a, b) => {
            const scoreDiff = b.score - a.score;
            if (scoreDiff !== 0) return scoreDiff;
            return b.staticScore - a.staticScore;
        });
        if (completedDepth) {
            bestCompleted = {
                bestAction: rankedActions[0] ? { ...rankedActions[0] } : null,
                rankedActions: rankedActions.map((a) => ({ ...a })),
                config,
                searchedDepth: depth,
                timedOut: false
            };
        } else {
            break;
        }
    }
    return {
        ...bestCompleted,
        timedOut: bestCompleted.searchedDepth < config.depth,
        nodes: session.nodes
    };
};
