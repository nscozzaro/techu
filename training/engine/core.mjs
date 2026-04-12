// training/engine/core.mjs
// Pure, headless Flood game engine. Copied/ported verbatim from
// index.html so it can be run in Node.js for RL training and parity-tested
// against the browser version.
//
// Data shapes:
//   Card       = { rank: 'A'|...|'2', suit: '♥'|'♦'|'♠'|'♣', color: 'red'|'black' }
//   Cell       = { card: Card, owner: 'red'|'black', faceUp: bool, coveredCell: Cell|null } | null
//   GameState  = {
//       board: Cell[BOARD_SIZE][BOARD_SIZE],
//       redHand, blackHand: (Card|null)[HAND_SIZE],
//       redDeck, blackDeck: Card[],
//       redDiscard, blackDiscard: Card[],
//       currentPlayer: 'red'|'black',
//       gamePhase: 'setup'|'playing'|'ended',
//       setupPlacements: { red: {row,col,card}|null, black: same },
//       setupRevealed: { red: bool, black: bool },
//       setupWidePlacement: bool,
//       openingMoveComplete: bool,
//       waitingForFlip: 'red'|'black'|null,
//       turnCount: number,
//   }
//   Move       = { type: 'place'|'discard', slotIndex: 0|1|2,
//                  row?: 0..4, col?: 0..4 }

// ====== CONSTANTS (verbatim from index.html lines 3450-3557) ======

export const CARD_VALUES = {
    'A': 14, 'K': 13, 'Q': 12, 'J': 11,
    '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
};
export const CARD_RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
export const PLAYER_SUITS = { red: ['♥', '♦'], black: ['♠', '♣'] };
export const PLAYERS = ['red', 'black'];
export const BOARD_SIZE = 5;
export const HAND_SIZE = 3;
export const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
export const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export const BOT_STRATEGY = {
    cardBands: {
        utilityMax: 6,
        developmentMax: 7,
        powerMin: 11,
        premiumMin: 12,
        finisherMin: 13,
        aceValue: 14
    },
    setup: { lead: 10, lowCard: 8, saveTwo: 4, noLowSlope: 2, saveHigh: 8 },
    move: {
        claim: 6, capture: 14, selfCover: 16, center: 10, centerProximity: 3,
        forward: 4, advance: 5, homeExpansion: 8, homeAnchor: 5, highHome: 7,
        connect: 10, disconnect: 7, frontier: 4, support: 4, pressure: 2,
        lowClaim: 4, reservePower: 9, cleanCapture: 8, overkill: 4,
        efficientCapture: 5, captureEconomy: 3, premiumClaimTax: 7,
        premiumCaptureTax: 8, fragileAdvance: 6, deepPremiumClaim: 8,
        exposedCapture: 11, supportShield: 4, safeCapture: 6,
        supportedClaim: 4, unsupportedHigh: 8, deepRaid: 6,
        captureRisk: 1.15, claimRisk: 0.95, hiddenThreat: 3, safeRisk: 8
    },
    search: {
        position: {
            early:   { score: 58,  connected: 8, disconnected: 3, frontier: 3, pressure: 5, mobility: 6, threat: 0.6, hand: 1, home: 2 },
            late:    { score: 110, connected: 8, disconnected: 3, frontier: 3, pressure: 6, mobility: 6, threat: 0.8, hand: 1, home: 3 },
            endgame: { score: 180, connected: 8, disconnected: 3, frontier: 3, pressure: 8, mobility: 8, threat: 1,   hand: 1, home: 4 }
        },
        config: {
            early:   { depth: 3, rootMoveLimit: 7, nodeMoveLimit: 4, discardLimit: 1, tacticalWidth: 3, staticBlend: 0.035, timeMs: 30, nodeBudget: 1400 },
            late:    { depth: 3, rootMoveLimit: 8, nodeMoveLimit: 5, discardLimit: 1, tacticalWidth: 3, staticBlend: 0.03,  timeMs: 42, nodeBudget: 2400 },
            endgame: { depth: 4, rootMoveLimit: 9, nodeMoveLimit: 5, discardLimit: 2, tacticalWidth: 4, staticBlend: 0.02,  timeMs: 58, nodeBudget: 4200 }
        }
    }
};

// ====== SEED/RANDOM (verbatim) ======

export const hashSeed = (seed) => {
    let hash = 2166136261;
    for (const char of String(seed)) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

export const createSeededRandom = (seed = null) => {
    if (seed === null || seed === undefined || seed === '') return Math.random;
    let state = hashSeed(seed) || 1;
    return () => {
        state = (state + 0x6D2B79F5) | 0;
        let next = Math.imul(state ^ (state >>> 15), 1 | state);
        next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
        return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
};

// ====== DECK/BOARD HELPERS (verbatim) ======

export const createPlayerMap = (factory) =>
    Object.fromEntries(PLAYERS.map((player) => [player, factory(player)]));

export const createBoard = () =>
    Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

export const createDeck = (player) =>
    PLAYER_SUITS[player].flatMap((suit) =>
        CARD_RANKS.map((rank) => ({ rank, suit, color: player }))
    );

export const shuffleInPlace = (items, random = Math.random) => {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
};

export const getCardValue = (cardOrRank) => {
    const rank = typeof cardOrRank === 'string' ? cardOrRank : cardOrRank?.rank;
    return CARD_VALUES[rank] ?? 0;
};

export const otherPlayer = (p) => (p === 'red' ? 'black' : 'red');

export const getHomeRow = (player) => (player === 'red' ? BOARD_SIZE - 1 : 0);

export const getPlayerState = (state, player) => ({
    hand: state[`${player}Hand`],
    deck: state[`${player}Deck`],
    discard: state[`${player}Discard`]
});

// Card band predicates (verbatim from FloodGame)
export const isUtilityCard    = (value) => value <= BOT_STRATEGY.cardBands.utilityMax;
export const isDevelopmentCard = (value) => value <= BOT_STRATEGY.cardBands.developmentMax;
export const isPowerCard      = (value) => value >= BOT_STRATEGY.cardBands.powerMin;
export const isPremiumCard    = (value) => value >= BOT_STRATEGY.cardBands.premiumMin;
export const isFinisherCard   = (value) => value >= BOT_STRATEGY.cardBands.finisherMin;
export const isAceCard        = (value) => value === BOT_STRATEGY.cardBands.aceValue;

// ====== CONNECTIVITY & METRICS (ported from FloodGame) ======

/** BFS from (row,col) through cells owned by player, looking for home row.
 *  Matches FloodGame.isConnectedToHome at index.html:5197-5218 (uses target
 *  cell as a free pass regardless of who owns it — that's important for
 *  the "is this move legal" semantics before placement). */
export const isConnectedToHome = (state, row, col, player) => {
    const homeRow = getHomeRow(player);
    const board = state.board;
    const visited = new Set();
    const queue = [[row, col]];
    while (queue.length > 0) {
        const [r, c] = queue.shift();
        const key = `${r},${c}`;
        if (visited.has(key)) continue;
        visited.add(key);
        const isTargetCell = r === row && c === col;
        const isOwnedByPlayer = board[r][c]?.owner === player;
        if (!isTargetCell && !isOwnedByPlayer) continue;
        if (r === homeRow) return true;
        for (const [dr, dc] of DIRECTIONS) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                queue.push([nr, nc]);
            }
        }
    }
    return false;
};

/** Full set of {row,col} keys reachable from home row through own-owned cells. */
export const getConnectedCellKeys = (state, player) => {
    const board = state.board;
    const homeRow = getHomeRow(player);
    const connected = new Set();
    const queue = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[homeRow][c]?.owner === player) {
            queue.push([homeRow, c]);
        }
    }
    while (queue.length > 0) {
        const [r, c] = queue.shift();
        const key = `${r},${c}`;
        if (connected.has(key)) continue;
        connected.add(key);
        for (const [dr, dc] of DIRECTIONS) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE
                && board[nr][nc]?.owner === player
                && !connected.has(`${nr},${nc}`)) {
                queue.push([nr, nc]);
            }
        }
    }
    return connected;
};

export const getFrontierCellKeys = (state, player) => {
    const board = state.board;
    const connected = getConnectedCellKeys(state, player);
    const frontier = new Set();
    const homeRow = getHomeRow(player);
    for (let c = 0; c < BOARD_SIZE; c++) {
        const key = `${homeRow},${c}`;
        if (!(board[homeRow][c]?.owner === player && connected.has(key))) {
            frontier.add(key);
        }
    }
    connected.forEach((key) => {
        const [row, col] = key.split(',').map(Number);
        for (const [dr, dc] of DIRECTIONS) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
            const nkey = `${nr},${nc}`;
            if (board[nr][nc]?.owner === player && connected.has(nkey)) continue;
            frontier.add(nkey);
        }
    });
    return frontier;
};

export const countAdjacentOwned = (state, row, col, player) => {
    const board = state.board;
    return DIRECTIONS.reduce((count, [dr, dc]) => {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) return count;
        return count + (board[nr][nc]?.owner === player ? 1 : 0);
    }, 0);
};

export const countDiagonalOwned = (state, row, col, player) => {
    const board = state.board;
    return DIAGONALS.reduce((count, [dr, dc]) => {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) return count;
        return count + (board[nr][nc]?.owner === player ? 1 : 0);
    }, 0);
};

export const getForwardProgress = (row, player) =>
    player === 'red' ? (BOARD_SIZE - 1) - row : row;

export const isOwnSideRow = (row, player) =>
    player === 'red' ? row >= 2 : row <= 2;

export const isOpponentSideRow = (row, player) =>
    player === 'red' ? row <= 1 : row >= 3;

// ====== BOARD ITERATION HELPERS ======

/** Visit every non-null top-of-stack cell. */
export const forEachBoardCell = (state, visitor) => {
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = state.board[r][c];
            if (cell) visitor(cell, r, c);
        }
    }
};

/** Visit every cell in every stack, including covered cells. */
export const forEachKnownCard = (state, visitor) => {
    const walk = (cell, row, col, depth = 0) => {
        if (!cell) return;
        visitor(cell, row, col, depth);
        walk(cell.coveredCell, row, col, depth + 1);
    };
    forEachBoardCell(state, (cell, row, col) => walk(cell, row, col));
};

// ====== BOARD METRICS (verbatim port of FloodGame.getBoardMetrics) ======

export const getBoardMetrics = (state, player) => {
    const connected = getConnectedCellKeys(state, player);
    const frontier = getFrontierCellKeys(state, player);
    const homeRow = getHomeRow(player);
    let owned = 0;
    let disconnected = 0;
    let disconnectedValue = 0;
    let openHomeSpaces = 0;
    for (let c = 0; c < BOARD_SIZE; c++) {
        if (!state.board[homeRow][c]) openHomeSpaces++;
    }
    forEachBoardCell(state, (cell, row, col) => {
        if (cell.owner !== player) return;
        owned++;
        const key = `${row},${col}`;
        if (!connected.has(key)) {
            disconnected++;
            disconnectedValue += getCardValue(cell.card);
        }
    });
    return { connected, frontier, owned, disconnected, disconnectedValue, openHomeSpaces };
};

// ====== PHASE PROFILE ======

export const getMovePhaseProfile = (state, player) => {
    const opponent = otherPlayer(player);
    const selfState = getPlayerState(state, player);
    const oppState = getPlayerState(state, opponent);
    const reserveCards =
        selfState.deck.length +
        oppState.deck.length +
        selfState.hand.filter(Boolean).length +
        oppState.hand.filter(Boolean).length;
    let emptyCells = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (!state.board[r][c]) emptyCells++;
        }
    }
    return {
        emptyCells,
        reserveCards,
        lateGame: emptyCells <= 10 || reserveCards <= 14,
        endgame: emptyCells <= 7 || reserveCards <= 8
    };
};

// ====== BELIEF TRACKING ======

export const getKnownCardCounts = (state, player, { includeHand = false } = {}) => {
    const counts = {};
    const push = (card) => {
        if (!card) return;
        counts[card.rank] = (counts[card.rank] || 0) + 1;
    };
    forEachKnownCard(state, (cell) => {
        if (cell.owner === player) push(cell.card);
    });
    getPlayerState(state, player).discard.forEach(push);
    if (includeHand) {
        getPlayerState(state, player).hand.forEach(push);
    }
    return counts;
};

export const getUnknownRankCount = (state, player, rank, options = {}) => {
    const counts = getKnownCardCounts(state, player, options);
    return Math.max(0, 2 - (counts[rank] || 0));
};

export const countUnknownHigherCards = (state, player, value, options = {}) => {
    return Object.entries(CARD_VALUES).reduce((total, [rank, rankValue]) => {
        if (rankValue <= value) return total;
        return total + getUnknownRankCount(state, player, rank, options);
    }, 0);
};

/** Find the cheapest card in `player`'s hand that can legally beat the card
 *  at (row, col) with value > targetValue. */
export const findLeastWinningCard = (state, player, row, col, targetValue) => {
    const { hand } = getPlayerState(state, player);
    let best = null;
    hand.forEach((card, slotIndex) => {
        if (!card) return;
        const value = getCardValue(card);
        if (value <= targetValue || !isValidMove(state, row, col, card, player)) return;
        const candidate = { card, slotIndex, value, gap: value - targetValue };
        if (!best || candidate.value < best.value || (candidate.value === best.value && candidate.gap < best.gap)) {
            best = candidate;
        }
    });
    return best;
};

// ====== MOVE LEGALITY (verbatim from index.html:5184-5195) ======

export const isValidMove = (state, row, col, card, player) => {
    if (state.gamePhase === 'setup') {
        return row === getHomeRow(player)
            && !state.board[row][col]
            && (state.setupWidePlacement || col === 2);
    }
    const cell = state.board[row][col];
    if (cell?.owner) {
        if (CARD_VALUES[cell.card.rank] === CARD_VALUES[card.rank]) return false;
        if (CARD_VALUES[card.rank] <= CARD_VALUES[cell.card.rank]) return false;
    }
    return isConnectedToHome(state, row, col, player);
};

// ====== LEGAL MOVE ENUMERATION ======

/** Return all legal placements and discards for the current player.
 *  During 'setup' only placements are legal. During 'playing' discards are
 *  allowed only once openingMoveComplete is true. */
export const getLegalMoves = (state, player = state.currentPlayer) => {
    const moves = [];
    const hand = state[`${player}Hand`];
    // Placements
    for (let slot = 0; slot < HAND_SIZE; slot++) {
        const card = hand[slot];
        if (!card) continue;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (isValidMove(state, r, c, card, player)) {
                    moves.push({ type: 'place', slotIndex: slot, row: r, col: c });
                }
            }
        }
    }
    // Discards
    if (state.gamePhase === 'playing' && state.openingMoveComplete) {
        for (let slot = 0; slot < HAND_SIZE; slot++) {
            if (hand[slot]) moves.push({ type: 'discard', slotIndex: slot });
        }
    }
    return moves;
};

// ====== SCORING & TERMINAL ======

/** Count top-of-stack cells per owner. Verbatim from FloodGame.getScores. */
export const getScores = (state) => {
    let red = 0, black = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = state.board[r][c];
            if (!cell) continue;
            if (cell.owner === 'red') red++;
            else if (cell.owner === 'black') black++;
        }
    }
    return { red, black };
};

/** Both players empty hand AND empty deck. Verbatim from FloodGame.isGameOver. */
export const isTerminal = (state) => {
    const redEmpty = state.redDeck.length === 0 && state.redHand.every((c) => c === null);
    const blackEmpty = state.blackDeck.length === 0 && state.blackHand.every((c) => c === null);
    return redEmpty && blackEmpty;
};

export const getWinner = (state) => {
    const { red, black } = getScores(state);
    if (red > black) return 'red';
    if (black > red) return 'black';
    return null; // tie
};

// ====== STATE CONSTRUCTION ======

/** Create a fresh game state from seeds. Each player gets a deterministic
 *  shuffle from their own seed. Opening hands (3 cards) are dealt immediately.
 *  gamePhase starts at 'setup'. */
export const newGame = ({ seed = null, redSeed = null, blackSeed = null } = {}) => {
    const rng = createSeededRandom(seed);
    const redRng = createSeededRandom(redSeed ?? (seed !== null ? `${seed}:red` : null));
    const blackRng = createSeededRandom(blackSeed ?? (seed !== null ? `${seed}:black` : null));

    const redDeck = shuffleInPlace(createDeck('red'), redRng);
    const blackDeck = shuffleInPlace(createDeck('black'), blackRng);

    const redHand = Array(HAND_SIZE).fill(null);
    const blackHand = Array(HAND_SIZE).fill(null);
    for (let i = 0; i < HAND_SIZE; i++) {
        redHand[i] = redDeck.pop();
        blackHand[i] = blackDeck.pop();
    }

    return {
        board: createBoard(),
        redHand, blackHand,
        redDeck, blackDeck,
        redDiscard: [], blackDiscard: [],
        currentPlayer: 'red',
        gamePhase: 'setup',
        setupPlacements: { red: null, black: null },
        setupRevealed: { red: false, black: false },
        setupWidePlacement: false,
        openingMoveComplete: false,
        waitingForFlip: null,
        turnCount: 0,
        rng,             // used by deterministic non-gameplay randomness (none currently)
        redRng, blackRng // stashed so we can draw more cards later during a tiebreaker refresh
    };
};

// ====== APPLY MOVE ======

/** Draw one card from `player`'s deck into their first null hand slot.
 *  No-op if deck empty or hand full. */
const drawOne = (state, player) => {
    const deck = state[`${player}Deck`];
    const hand = state[`${player}Hand`];
    if (deck.length === 0) return;
    const slot = hand.findIndex((c) => c === null);
    if (slot === -1) return;
    hand[slot] = deck.pop();
};

/** Remove the card at `slot` from `player`'s hand and return it. */
const takeFromHand = (state, player, slot) => {
    const hand = state[`${player}Hand`];
    const card = hand[slot];
    hand[slot] = null;
    return card;
};

/** Skip the current player if they have no hand cards and empty deck.
 *  Recursive so that both-empty terminates. Matches
 *  FloodGame.checkAndSkipIfNoCards at index.html:6375-6389. */
const skipEmpty = (state) => {
    const { hand, deck } = getPlayerState(state, state.currentPlayer);
    const hasCards = hand.some((c) => c !== null);
    if (hasCards || deck.length > 0) return;
    if (isTerminal(state)) {
        state.gamePhase = 'ended';
        return;
    }
    state.currentPlayer = otherPlayer(state.currentPlayer);
    skipEmpty(state);
};

/** Resolve setup placement. Called after a setup move completes. If both
 *  players have placed, reveal and decide who starts playing. Equal-rank
 *  setup ⇒ tiebreaker: both players draw a replacement from their deck,
 *  setupWidePlacement becomes true, and we restart setup. */
const resolveSetupPlacements = (state) => {
    const redPlaced = state.setupPlacements.red;
    const blackPlaced = state.setupPlacements.black;
    if (!redPlaced || !blackPlaced) return; // still waiting
    // Reveal both
    state.setupRevealed = { red: true, black: true };
    const redCell = state.board[redPlaced.row][redPlaced.col];
    const blackCell = state.board[blackPlaced.row][blackPlaced.col];
    if (redCell) redCell.faceUp = true;
    if (blackCell) blackCell.faceUp = true;
    const redValue = getCardValue(redPlaced.card);
    const blackValue = getCardValue(blackPlaced.card);
    if (redValue === blackValue) {
        // Tiebreaker: remove both cards from board, draw replacements, restart setup.
        state.board[redPlaced.row][redPlaced.col] = null;
        state.board[blackPlaced.row][blackPlaced.col] = null;
        // Draw replacement into an empty slot (the slot we just played from)
        drawOne(state, 'red');
        drawOne(state, 'black');
        state.setupPlacements = { red: null, black: null };
        state.setupRevealed = { red: false, black: false };
        state.setupWidePlacement = true;
        state.currentPlayer = 'red'; // restart with red
        return;
    }
    // Lower rank starts
    state.currentPlayer = redValue < blackValue ? 'red' : 'black';
    state.gamePhase = 'playing';
    state.setupWidePlacement = false;
    state.openingMoveComplete = false;
};

/** Apply a move. Mutates state in place and returns it for chaining. */
export const applyMove = (state, move, playerOverride = null) => {
    const player = playerOverride ?? state.currentPlayer;
    if (state.gamePhase === 'ended') return state;

    if (state.gamePhase === 'setup') {
        // Setup placements only
        if (move.type !== 'place') {
            throw new Error(`Invalid setup move type: ${move.type}`);
        }
        const card = takeFromHand(state, player, move.slotIndex);
        if (!card) throw new Error('Invalid setup move: empty slot');
        const previousCell = state.board[move.row][move.col];
        state.board[move.row][move.col] = {
            card, owner: player, faceUp: false,
            coveredCell: previousCell ?? null
        };
        state.setupPlacements[player] = { row: move.row, col: move.col, card };
        // Advance to the other player if they haven't placed yet
        if (!state.setupPlacements[otherPlayer(player)]) {
            state.currentPlayer = otherPlayer(player);
        } else {
            // Both placed — resolve
            resolveSetupPlacements(state);
        }
        state.turnCount += 1;
        return state;
    }

    if (state.gamePhase === 'playing') {
        if (move.type === 'place') {
            const card = takeFromHand(state, player, move.slotIndex);
            if (!card) throw new Error('Invalid playing move: empty slot');
            const previousCell = state.board[move.row][move.col];
            state.board[move.row][move.col] = {
                card, owner: player, faceUp: true,
                coveredCell: previousCell ?? null
            };
        } else if (move.type === 'discard') {
            if (!state.openingMoveComplete) {
                throw new Error('Cannot discard before opening move');
            }
            const card = takeFromHand(state, player, move.slotIndex);
            if (!card) throw new Error('Invalid discard: empty slot');
            state[`${player}Discard`].push(card);
        } else {
            throw new Error(`Unknown move type: ${move.type}`);
        }
        // First playing-phase move is complete
        state.openingMoveComplete = true;
        // Draw one
        drawOne(state, player);
        // Advance turn
        state.currentPlayer = otherPlayer(player);
        state.turnCount += 1;
        // Skip empty players and potentially terminate
        skipEmpty(state);
        if (isTerminal(state)) state.gamePhase = 'ended';
        return state;
    }

    throw new Error(`Invalid game phase: ${state.gamePhase}`);
};

// ====== CLONING ======

/** Shallow-ish clone for tree search. Board cells are cloned recursively
 *  because of the `covered` chain. Hands/decks/discards are fresh arrays
 *  of shared-ref Card objects (which are immutable by convention). */
export const cloneState = (state) => {
    const cloneCell = (cell) => cell ? {
        card: cell.card,
        owner: cell.owner,
        faceUp: cell.faceUp,
        coveredCell: cloneCell(cell.coveredCell)
    } : null;
    return {
        board: state.board.map((row) => row.map(cloneCell)),
        redHand: [...state.redHand],
        blackHand: [...state.blackHand],
        redDeck: [...state.redDeck],
        blackDeck: [...state.blackDeck],
        redDiscard: [...state.redDiscard],
        blackDiscard: [...state.blackDiscard],
        currentPlayer: state.currentPlayer,
        gamePhase: state.gamePhase,
        setupPlacements: {
            red: state.setupPlacements.red ? { ...state.setupPlacements.red } : null,
            black: state.setupPlacements.black ? { ...state.setupPlacements.black } : null
        },
        setupRevealed: { ...state.setupRevealed },
        setupWidePlacement: state.setupWidePlacement,
        openingMoveComplete: state.openingMoveComplete,
        waitingForFlip: state.waitingForFlip,
        turnCount: state.turnCount,
        // RNGs are functions — cloning would break their closed-over state.
        // For tree search we don't need to re-shuffle mid-game, so we skip.
        rng: state.rng,
        redRng: state.redRng,
        blackRng: state.blackRng
    };
};
