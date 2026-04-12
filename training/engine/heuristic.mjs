// training/engine/heuristic.mjs
// Direct port of FloodGame.evaluateMove + supporting heuristic functions
// from index.html. All weights and logic match the browser bot verbatim
// so FloodBotStatic plays identically to the browser bot's "static"
// (no-search) selection.

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
    isConnectedToHome,
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
    isAceCard
} from './core.mjs';

// ====== simulateMove: mutate-evaluate-revert ======
// Matches index.html:5564-5578 exactly.

export const simulateMove = (state, row, col, card, player, evaluate) => {
    const previousCell = state.board[row][col];
    state.board[row][col] = {
        card,
        owner: player,
        faceUp: true,
        coveredCell: previousCell ?? null
    };
    try {
        return evaluate(previousCell);
    } finally {
        state.board[row][col] = previousCell;
    }
};

// ====== estimateReplyRisk (index.html:5548-5562) ======

export const estimateReplyRisk = (state, row, col, card, player) => {
    const opponent = otherPlayer(player);
    const value = getCardValue(card);
    if (!isConnectedToHome(state, row, col, opponent)) {
        return 0;
    }
    const exactReply = findLeastWinningCard(state, opponent, row, col, value);
    const higherCards = countUnknownHigherCards(state, opponent, value);
    if (!higherCards && !exactReply) {
        return 0;
    }
    const adjacentPressure = countAdjacentOwned(state, row, col, opponent) * 2;
    const frontierPressure = getFrontierCellKeys(state, opponent).has(`${row},${col}`) ? 4 : 0;
    const exactPressure = exactReply ? 8 + exactReply.gap * 2 : 0;
    return Math.min(26, exactPressure + higherCards * 2 + adjacentPressure + frontierPressure);
};

// ====== evaluateMove (index.html:6286-6373) ======

export const evaluateMove = (state, row, col, card, player) => {
    const opponent = otherPlayer(player);
    const value = getCardValue(card);
    const targetCell = state.board[row][col];
    const targetValue = targetCell ? getCardValue(targetCell.card) : 0;
    const cheapestCapture = targetCell?.owner === opponent
        ? findLeastWinningCard(state, player, row, col, targetValue)
        : null;
    const beforeSelf = getBoardMetrics(state, player);
    const beforeOpponent = getBoardMetrics(state, opponent);
    const phase = getMovePhaseProfile(state, player);
    const weights = BOT_STRATEGY.move;
    const hiddenThreat = Math.min(BOT_STRATEGY.cardBands.utilityMax, countUnknownHigherCards(state, opponent, value));
    const developmentCard = isDevelopmentCard(value);
    const powerCard = isPowerCard(value);
    const premiumCard = isPremiumCard(value);
    const homeRow = getHomeRow(player);
    return simulateMove(state, row, col, card, player, () => {
        const afterSelf = getBoardMetrics(state, player);
        const afterOpponent = getBoardMetrics(state, opponent);
        const adjacentSelf = countAdjacentOwned(state, row, col, player);
        const diagonalSelf = countDiagonalOwned(state, row, col, player);
        const adjacentOpponent = countAdjacentOwned(state, row, col, opponent);
        const diagonalOpponent = countDiagonalOwned(state, row, col, opponent);
        const support = adjacentSelf + diagonalSelf * 0.5;
        const pressure = adjacentOpponent + diagonalOpponent * 0.5;
        const forward = getForwardProgress(row, player);
        const distFromCenter = Math.abs(row - 2) + Math.abs(col - 2);
        const risk = estimateReplyRisk(state, row, col, card, player);
        const capture = targetCell?.owner === opponent;
        const emptyClaim = !targetCell;
        const ownSide = row === getHomeRow(player) || isOwnSideRow(row, player);
        const opponentHome = row === getHomeRow(opponent);
        const gap = capture ? value - targetValue : 0;
        const exactReply = capture ? findLeastWinningCard(state, opponent, row, col, value) : null;
        const overspend = capture && cheapestCapture ? Math.max(0, value - cheapestCapture.value) : 0;
        const connectGain = afterSelf.connected.size - beforeSelf.connected.size;
        const disconnectGain = afterOpponent.disconnectedValue - beforeOpponent.disconnectedValue;
        const frontierSwing = (afterSelf.frontier.size - beforeSelf.frontier.size) + (beforeOpponent.frontier.size - afterOpponent.frontier.size);
        const homeExpansionGain = Math.max(0, beforeSelf.openHomeSpaces - afterSelf.openHomeSpaces);

        let score = capture ? weights.capture + targetValue : weights.claim;
        if (targetCell?.owner === player) {
            score = -weights.selfCover;
        }
        score += connectGain * weights.connect;
        score += disconnectGain * weights.disconnect;
        score += frontierSwing * weights.frontier;
        score += support * weights.support;
        score += pressure * (capture ? weights.pressure : weights.pressure * 0.5);
        score += (4 - distFromCenter) * weights.centerProximity;
        score += forward * weights.forward;
        score += homeExpansionGain * weights.homeExpansion;
        if (row === 2 && col === 2) score += weights.center;
        if (isOpponentSideRow(row, player)) score += weights.advance;
        if (emptyClaim && developmentCard) score += weights.lowClaim;
        if (emptyClaim && ownSide && developmentCard) score += weights.homeAnchor;
        if (emptyClaim && ownSide && powerCard) score -= weights.highHome;
        if (!phase.lateGame && emptyClaim && row !== homeRow && powerCard && beforeSelf.openHomeSpaces >= 2) {
            score -= weights.reservePower;
        }
        if (!phase.endgame && emptyClaim && premiumCard) {
            score -= weights.premiumClaimTax;
        }
        if (opponentHome && !phase.endgame) score -= weights.deepRaid;
        if (capture) {
            score += Math.max(0, weights.cleanCapture - Math.max(0, gap - 1) * weights.overkill);
            if (overspend === 0) score += weights.efficientCapture;
            score -= overspend * weights.captureEconomy;
            if (!phase.endgame && premiumCard && !isPowerCard(targetValue)) {
                score -= weights.premiumCaptureTax;
            }
            if (exactReply) {
                score -= weights.exposedCapture + exactReply.gap * weights.captureEconomy;
                if (support >= 1) score += weights.supportShield;
            }
            if (risk <= weights.safeRisk) score += weights.safeCapture;
        } else if (support >= 1) {
            score += weights.supportedClaim;
        }
        if (!capture && !phase.endgame && isOpponentSideRow(row, player) && powerCard && support < 2) {
            score -= weights.fragileAdvance;
            if (premiumCard) score -= weights.deepPremiumClaim;
        }
        if (support === 0 && powerCard) score -= weights.unsupportedHigh;
        score -= hiddenThreat * weights.hiddenThreat;
        score -= risk * (capture ? weights.captureRisk : weights.claimRisk);
        return score;
    });
};

// ====== evaluateSetupCard (index.html:5579-5592) ======

export const evaluateSetupCard = (state, card, handValues) => {
    const { lead, lowCard, saveTwo, noLowSlope, saveHigh } = BOT_STRATEGY.setup;
    const value = getCardValue(card);
    const lowestValue = Math.min(...handValues);
    const highestValue = Math.max(...handValues);
    const hasLowCard = handValues.some((v) => isUtilityCard(v));
    let score = lowestValue - value;
    if (value === lowestValue) score += lead;
    if (isUtilityCard(value)) score += lowCard;
    if (value === 2) score -= saveTwo;
    if (!hasLowCard) score += (highestValue - value) * noLowSlope;
    if (value === highestValue && isPowerCard(value)) score -= saveHigh;
    return score;
};

// ====== evaluateDiscardValue (index.html:5615-5638) ======
// Note: the main-branch version uses hardcoded constants, not
// BOT_STRATEGY.discard (which doesn't exist on main).

export const evaluateDiscardValue = (state, card, player) => {
    const opponent = otherPlayer(player);
    const value = getCardValue(card);
    const boardMetrics = getBoardMetrics(state, player);
    const centerCell = state.board[2][2];
    let keepScore = value * 3;
    if (centerCell?.owner === opponent && value > getCardValue(centerCell.card)) {
        keepScore += Math.max(8, 18 - (value - getCardValue(centerCell.card)) * 3);
    }
    forEachBoardCell(state, (cell, row, col) => {
        if (cell.owner !== opponent) return;
        const targetValue = getCardValue(cell.card);
        if (value <= targetValue) return;
        keepScore += Math.max(0, 10 - (value - targetValue) * 2);
        if (row === 2 && col === 2) keepScore += 8;
        if (isOpponentSideRow(row, player)) keepScore += 4;
    });
    if (isUtilityCard(value)) {
        keepScore += boardMetrics.openHomeSpaces * 2;
    }
    if (isFinisherCard(value)) keepScore += 10;
    if (isAceCard(value)) keepScore += 8;
    if (countUnknownHigherCards(state, opponent, value) === 0) keepScore += 6;
    return keepScore;
};

// ====== sortMovesByPriority (index.html:6277-6285) ======

export const sortMovesByPriority = (moves, player) => {
    return moves.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) return scoreDiff;
        const cardDiff = getCardValue(a.card) - getCardValue(b.card);
        if (cardDiff !== 0) return cardDiff;
        return getForwardProgress(b.row, player) - getForwardProgress(a.row, player);
    });
};

// ====== getRankedMoves (index.html:6244-6258) ======

export const getRankedMoves = (state, player) => {
    const moves = [];
    const { hand } = getPlayerState(state, player);
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            hand.forEach((card, slotIndex) => {
                if (card !== null && isValidMove(state, r, c, card, player)) {
                    const score = evaluateMove(state, r, c, card, player);
                    moves.push({ row: r, col: c, card, slotIndex, score });
                }
            });
        }
    }
    return sortMovesByPriority(moves, player);
};

// ====== getRankedDiscardChoices (index.html:5640-5658) ======

export const getRankedDiscardChoices = (state, player) => {
    const { hand } = getPlayerState(state, player);
    return hand
        .map((card, index) => card ? { card, index } : null)
        .filter(Boolean)
        .map((option) => {
            const keepScore = evaluateDiscardValue(state, option.card, player);
            return {
                ...option,
                keepScore,
                score: -keepScore,
                slotIndex: option.index
            };
        })
        .sort((a, b) => {
            const scoreDiff = a.keepScore - b.keepScore;
            if (scoreDiff !== 0) return scoreDiff;
            return getCardValue(a.card) - getCardValue(b.card);
        });
};

// ====== getRankedSetupChoices (index.html:5593-5614) ======

export const getRankedSetupChoices = (state, player) => {
    const { hand } = getPlayerState(state, player);
    const options = hand
        .map((card, index) => card ? { card, index } : null)
        .filter(Boolean);
    if (!options.length) return [];
    const handValues = options
        .map(({ card }) => getCardValue(card))
        .sort((a, b) => b - a);
    return options
        .map((option) => ({
            ...option,
            score: evaluateSetupCard(state, option.card, handValues)
        }))
        .sort((a, b) => {
            const scoreDiff = b.score - a.score;
            if (scoreDiff !== 0) return scoreDiff;
            return getCardValue(a.card) - getCardValue(b.card);
        });
};

// ====== Setup column preference (matches FloodGame.getPreferredSetupColumns) ======
// During tiebreaker with setupWidePlacement, the bot prefers center columns first.

export const getPreferredSetupColumns = () => [2, 1, 3, 0, 4];
