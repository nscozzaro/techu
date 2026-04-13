// rl-inference.js — browser-side Flood RL inference.
// Loaded by index.html as a classic script. Exposes window.FloodRL with:
//   .loadModel(url) → Promise<params> — fetch flood-model.json
//   .getBestMove(gameInstance, player) → {type, slotIndex, row?, col?, card?}
//   .isReady()  → boolean
//
// This reimplements the MLP forward pass + PUCT MCTS in vanilla JS so it can
// run in the browser without any bundling. All constants MUST stay in sync
// with training/engine/encoding.mjs and training/net/mlp.mjs.

(function() {
    'use strict';

    // ====== Constants (mirror training/engine/encoding.mjs) ======
    const INPUT_SIZE = 256;
    const ACTION_SIZE = 81;
    const DISCARD_TARGET = 25;
    const BOARD_SIZE = 5;
    const HAND_SIZE = 3;
    const H1 = 64;
    const H2 = 64;

    // ====== Param offsets (mirror training/net/mlp.mjs) ======
    const SIZE_W1 = H1 * INPUT_SIZE;
    const SIZE_B1 = H1;
    const SIZE_W2 = H2 * H1;
    const SIZE_B2 = H2;
    const SIZE_WP = ACTION_SIZE * H2;
    const SIZE_BP = ACTION_SIZE;
    const SIZE_WV = 1 * H2;
    const OFF_W1 = 0;
    const OFF_B1 = OFF_W1 + SIZE_W1;
    const OFF_W2 = OFF_B1 + SIZE_B1;
    const OFF_B2 = OFF_W2 + SIZE_W2;
    const OFF_WP = OFF_B2 + SIZE_B2;
    const OFF_BP = OFF_WP + SIZE_WP;
    const OFF_WV = OFF_BP + SIZE_BP;
    const OFF_BV = OFF_WV + SIZE_WV;

    // ====== Card value table (mirror CARD_VALUES) ======
    const CARD_VAL = {
        'A': 14, 'K': 13, 'Q': 12, 'J': 11,
        '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
    };
    const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    let params = null;

    // ====== Utility: action index encoding/decoding ======
    const decodeAction = (idx) => {
        const slotIndex = Math.floor(idx / 27);
        const target = idx % 27;
        if (target === DISCARD_TARGET) return { type: 'discard', slotIndex };
        if (target === 26) return null;
        return { type: 'place', slotIndex, row: Math.floor(target / BOARD_SIZE), col: target % BOARD_SIZE };
    };

    // ====== Snapshot: convert a live FloodGame instance to a plain state
    //        object matching training/engine/core.mjs shape so the MCTS can
    //        clone / apply moves without touching the DOM. ======
    const cloneCell = (cell) => cell ? {
        card: cell.card,
        owner: cell.owner,
        faceUp: cell.faceUp,
        coveredCell: cloneCell(cell.coveredCell)
    } : null;

    const snapshotGame = (game) => ({
        board: game.board.map((row) => row.map(cloneCell)),
        redHand: [...game.redHand],
        blackHand: [...game.blackHand],
        redDeck: [...game.redDeck],
        blackDeck: [...game.blackDeck],
        redDiscard: [...game.redDiscard],
        blackDiscard: [...game.blackDiscard],
        currentPlayer: game.currentPlayer,
        gamePhase: game.gamePhase,
        setupPlacements: {
            red: game.setupPlacements?.red ? { ...game.setupPlacements.red } : null,
            black: game.setupPlacements?.black ? { ...game.setupPlacements.black } : null
        },
        setupRevealed: { ...(game.setupRevealed ?? { red: false, black: false }) },
        setupWidePlacement: !!game.setupWidePlacement,
        openingMoveComplete: !!game.openingMoveComplete,
        turnCount: game.turnCount ?? 0
    });

    const cloneState = (s) => ({
        board: s.board.map((row) => row.map(cloneCell)),
        redHand: [...s.redHand],
        blackHand: [...s.blackHand],
        redDeck: [...s.redDeck],
        blackDeck: [...s.blackDeck],
        redDiscard: [...s.redDiscard],
        blackDiscard: [...s.blackDiscard],
        currentPlayer: s.currentPlayer,
        gamePhase: s.gamePhase,
        setupPlacements: {
            red: s.setupPlacements.red ? { ...s.setupPlacements.red } : null,
            black: s.setupPlacements.black ? { ...s.setupPlacements.black } : null
        },
        setupRevealed: { ...s.setupRevealed },
        setupWidePlacement: s.setupWidePlacement,
        openingMoveComplete: s.openingMoveComplete,
        turnCount: s.turnCount
    });

    // ====== Game mechanics (subset of training/engine/core.mjs) ======
    const otherPlayer = (p) => p === 'red' ? 'black' : 'red';
    const getHomeRow = (p) => p === 'red' ? BOARD_SIZE - 1 : 0;
    const getCardValue = (c) => CARD_VAL[typeof c === 'string' ? c : c?.rank] ?? 0;

    const isConnectedToHome = (state, row, col, player) => {
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
            const isOwned = board[r][c]?.owner === player;
            if (!isTargetCell && !isOwned) continue;
            if (r === homeRow) return true;
            for (const [dr, dc] of DIRS) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) queue.push([nr, nc]);
            }
        }
        return false;
    };

    const getConnectedKeys = (state, player) => {
        const board = state.board;
        const homeRow = getHomeRow(player);
        const connected = new Set();
        const queue = [];
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[homeRow][c]?.owner === player) queue.push([homeRow, c]);
        }
        while (queue.length) {
            const [r, c] = queue.shift();
            const key = `${r},${c}`;
            if (connected.has(key)) continue;
            connected.add(key);
            for (const [dr, dc] of DIRS) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE
                    && board[nr][nc]?.owner === player && !connected.has(`${nr},${nc}`)) {
                    queue.push([nr, nc]);
                }
            }
        }
        return connected;
    };

    const isValidMove = (state, row, col, card, player) => {
        if (state.gamePhase === 'setup') {
            return row === getHomeRow(player)
                && !state.board[row][col]
                && (state.setupWidePlacement || col === 2);
        }
        const cell = state.board[row][col];
        if (cell?.owner) {
            if (getCardValue(cell.card) === getCardValue(card)) return false;
            if (getCardValue(card) <= getCardValue(cell.card)) return false;
        }
        return isConnectedToHome(state, row, col, player);
    };

    const getLegalMoves = (state, player) => {
        const moves = [];
        const hand = state[`${player}Hand`];
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
        if (state.gamePhase === 'playing' && state.openingMoveComplete) {
            for (let slot = 0; slot < HAND_SIZE; slot++) {
                if (hand[slot]) moves.push({ type: 'discard', slotIndex: slot });
            }
        }
        return moves;
    };

    const drawOne = (state, player) => {
        const deck = state[`${player}Deck`];
        const hand = state[`${player}Hand`];
        if (deck.length === 0) return;
        const slot = hand.findIndex((c) => c === null);
        if (slot === -1) return;
        hand[slot] = deck.pop();
    };

    const skipEmpty = (state) => {
        const hand = state[`${state.currentPlayer}Hand`];
        const deck = state[`${state.currentPlayer}Deck`];
        const hasCards = hand.some((c) => c !== null);
        if (hasCards || deck.length > 0) return;
        const redEmpty = state.redDeck.length === 0 && state.redHand.every(c => c === null);
        const blackEmpty = state.blackDeck.length === 0 && state.blackHand.every(c => c === null);
        if (redEmpty && blackEmpty) { state.gamePhase = 'ended'; return; }
        state.currentPlayer = otherPlayer(state.currentPlayer);
        skipEmpty(state);
    };

    const isTerminal = (state) => {
        const redEmpty = state.redDeck.length === 0 && state.redHand.every((c) => c === null);
        const blackEmpty = state.blackDeck.length === 0 && state.blackHand.every((c) => c === null);
        return redEmpty && blackEmpty;
    };

    const getScores = (state) => {
        let red = 0, black = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cell = state.board[r][c];
                if (!cell) continue;
                if (cell.owner === 'red') red++; else black++;
            }
        }
        return { red, black };
    };

    const resolveSetup = (state) => {
        const rp = state.setupPlacements.red;
        const bp = state.setupPlacements.black;
        if (!rp || !bp) return;
        state.setupRevealed = { red: true, black: true };
        const rv = getCardValue(rp.card);
        const bv = getCardValue(bp.card);
        const redCell = state.board[rp.row][rp.col];
        const blackCell = state.board[bp.row][bp.col];
        if (redCell) redCell.faceUp = true;
        if (blackCell) blackCell.faceUp = true;
        if (rv === bv) {
            state.board[rp.row][rp.col] = null;
            state.board[bp.row][bp.col] = null;
            drawOne(state, 'red');
            drawOne(state, 'black');
            state.setupPlacements = { red: null, black: null };
            state.setupRevealed = { red: false, black: false };
            state.setupWidePlacement = true;
            state.currentPlayer = 'red';
            return;
        }
        state.currentPlayer = rv < bv ? 'red' : 'black';
        state.gamePhase = 'playing';
        state.setupWidePlacement = false;
        state.openingMoveComplete = false;
    };

    const takeFromHand = (state, player, slot) => {
        const hand = state[`${player}Hand`];
        const card = hand[slot];
        hand[slot] = null;
        return card;
    };

    const applyMove = (state, move, playerOverride) => {
        const player = playerOverride ?? state.currentPlayer;
        if (state.gamePhase === 'ended') return state;
        if (state.gamePhase === 'setup') {
            const card = takeFromHand(state, player, move.slotIndex);
            if (!card) return state;
            const prev = state.board[move.row][move.col];
            state.board[move.row][move.col] = {
                card, owner: player, faceUp: false, coveredCell: prev ?? null
            };
            state.setupPlacements[player] = { row: move.row, col: move.col, card };
            if (!state.setupPlacements[otherPlayer(player)]) {
                state.currentPlayer = otherPlayer(player);
            } else {
                resolveSetup(state);
            }
            state.turnCount += 1;
            return state;
        }
        if (state.gamePhase === 'playing') {
            if (move.type === 'place') {
                const card = takeFromHand(state, player, move.slotIndex);
                if (!card) return state;
                const prev = state.board[move.row][move.col];
                state.board[move.row][move.col] = {
                    card, owner: player, faceUp: true, coveredCell: prev ?? null
                };
            } else {
                if (!state.openingMoveComplete) return state;
                const card = takeFromHand(state, player, move.slotIndex);
                if (!card) return state;
                state[`${player}Discard`].push(card);
            }
            state.openingMoveComplete = true;
            drawOne(state, player);
            state.currentPlayer = otherPlayer(player);
            state.turnCount += 1;
            skipEmpty(state);
            if (isTerminal(state)) state.gamePhase = 'ended';
        }
        return state;
    };

    // ====== State encoding (mirror training/engine/encoding.mjs) ======
    const encodeState = (state, perspective) => {
        const out = new Float32Array(INPUT_SIZE);
        const opp = otherPlayer(perspective);
        let offset = 0;
        const ownConnected = getConnectedKeys(state, perspective);
        const oppConnected = getConnectedKeys(state, opp);
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cell = state.board[r][c];
                const base = offset + (r * BOARD_SIZE + c) * 4;
                if (!cell) out[base + 0] = 1;
                else if (!cell.faceUp) out[base + 3] = 1;
                else if (cell.owner === perspective) out[base + 1] = 1;
                else out[base + 2] = 1;
            }
        }
        offset += 100;
        for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = state.board[r][c];
            out[offset + r * BOARD_SIZE + c] = cell ? (getCardValue(cell.card) - 2) / 12 : 0;
        }
        offset += 25;
        for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
            let depth = 0, cell = state.board[r][c];
            while (cell) { depth++; cell = cell.coveredCell; }
            out[offset + r * BOARD_SIZE + c] = Math.min(depth, 5) / 5;
        }
        offset += 25;
        for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
            out[offset + r * BOARD_SIZE + c] = ownConnected.has(`${r},${c}`) ? 1 : 0;
        }
        offset += 25;
        for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
            out[offset + r * BOARD_SIZE + c] = oppConnected.has(`${r},${c}`) ? 1 : 0;
        }
        offset += 25;
        const ownHand = state[`${perspective}Hand`];
        for (let i = 0; i < HAND_SIZE; i++) {
            const card = ownHand[i];
            out[offset + i * 2] = card ? 1 : 0;
            out[offset + i * 2 + 1] = card ? (getCardValue(card) - 2) / 12 : 0;
        }
        offset += 6;
        const redScore = getScores(state).red;
        const blackScore = getScores(state).black;
        const selfScore = perspective === 'red' ? redScore : blackScore;
        const oppScore = perspective === 'red' ? blackScore : redScore;
        out[offset + 0] = state[`${perspective}Deck`].length / 23;
        out[offset + 1] = state[`${opp}Deck`].length / 23;
        out[offset + 2] = state[`${perspective}Discard`].length / 23;
        out[offset + 3] = state[`${opp}Discard`].length / 23;
        out[offset + 4] = selfScore / 25;
        out[offset + 5] = oppScore / 25;
        out[offset + 6] = Math.min(state.turnCount, 60) / 60;
        out[offset + 7] = state.gamePhase === 'setup' ? 1 : 0;
        out[offset + 8] = state.setupWidePlacement ? 1 : 0;
        out[offset + 9] = state.openingMoveComplete ? 1 : 0;
        out[offset + 10] = 1;
        out[offset + 11] = (selfScore - oppScore) / 25;
        offset += 12;
        // Opponent belief
        const oppCounts = countKnown(state, opp);
        for (let i = 0; i < RANKS.length; i++) {
            out[offset + i] = Math.max(0, 2 - (oppCounts[RANKS[i]] || 0)) / 2;
        }
        offset += 13;
        // Own belief
        const ownCounts = countKnown(state, perspective);
        for (let i = 0; i < RANKS.length; i++) {
            out[offset + i] = Math.max(0, 2 - (ownCounts[RANKS[i]] || 0)) / 2;
        }
        return out;
    };

    const countKnown = (state, player) => {
        const counts = {};
        const walk = (cell) => {
            if (!cell) return;
            if (cell.owner === player) counts[cell.card.rank] = (counts[cell.card.rank] || 0) + 1;
            walk(cell.coveredCell);
        };
        for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) walk(state.board[r][c]);
        for (const card of state[`${player}Discard`]) if (card) counts[card.rank] = (counts[card.rank] || 0) + 1;
        return counts;
    };

    const encodeActionMask = (state, player) => {
        const mask = new Float32Array(ACTION_SIZE);
        const moves = getLegalMoves(state, player);
        for (const move of moves) {
            let target;
            if (move.type === 'place') target = move.row * BOARD_SIZE + move.col;
            else target = DISCARD_TARGET;
            mask[move.slotIndex * 27 + target] = 1;
        }
        return mask;
    };

    // ====== MLP forward pass ======
    const forward = (input) => {
        const h1 = new Float32Array(H1);
        const h2 = new Float32Array(H2);
        const logits = new Float32Array(ACTION_SIZE);
        for (let i = 0; i < H1; i++) {
            let sum = params[OFF_B1 + i];
            const rowOff = OFF_W1 + i * INPUT_SIZE;
            for (let j = 0; j < INPUT_SIZE; j++) sum += params[rowOff + j] * input[j];
            h1[i] = sum > 0 ? sum : 0;
        }
        for (let i = 0; i < H2; i++) {
            let sum = params[OFF_B2 + i];
            const rowOff = OFF_W2 + i * H1;
            for (let j = 0; j < H1; j++) sum += params[rowOff + j] * h1[j];
            h2[i] = sum > 0 ? sum : 0;
        }
        for (let i = 0; i < ACTION_SIZE; i++) {
            let sum = params[OFF_BP + i];
            const rowOff = OFF_WP + i * H2;
            for (let j = 0; j < H2; j++) sum += params[rowOff + j] * h2[j];
            logits[i] = sum;
        }
        let vSum = params[OFF_BV];
        for (let j = 0; j < H2; j++) vSum += params[OFF_WV + j] * h2[j];
        return { logits, value: Math.tanh(vSum) };
    };

    const maskedSoftmax = (logits, mask) => {
        const out = new Float32Array(ACTION_SIZE);
        let maxLogit = -Infinity;
        for (let i = 0; i < ACTION_SIZE; i++) if (mask[i] > 0 && logits[i] > maxLogit) maxLogit = logits[i];
        if (maxLogit === -Infinity) return out;
        let sum = 0;
        for (let i = 0; i < ACTION_SIZE; i++) {
            if (mask[i] > 0) { out[i] = Math.exp(logits[i] - maxLogit); sum += out[i]; }
        }
        if (sum > 0) for (let i = 0; i < ACTION_SIZE; i++) out[i] /= sum;
        return out;
    };

    // ====== MCTS ======
    class Node { constructor(p) { this.prior = p; this.visits = 0; this.valueSum = 0; this.children = new Map(); } }
    const nodeValue = (n) => n.visits === 0 ? 0 : n.valueSum / n.visits;

    const selectChild = (node, cPuct, maximize) => {
        let bestScore = -Infinity, bestIdx = -1, bestChild = null;
        const sqrtParent = Math.sqrt(Math.max(1, node.visits));
        for (const [idx, child] of node.children) {
            const q = nodeValue(child);
            const effQ = maximize ? q : -q;
            const u = cPuct * child.prior * sqrtParent / (1 + child.visits);
            const jitter = (Math.random() - 0.5) * 1e-6;
            const score = effQ + u + jitter;
            if (score > bestScore) { bestScore = score; bestIdx = idx; bestChild = child; }
        }
        return [bestIdx, bestChild];
    };

    const runMcts = (rootState, rootPlayer, numSims, cPuct) => {
        const rootMask = encodeActionMask(rootState, rootPlayer);
        const { logits, value: rootValue } = forward(encodeState(rootState, rootPlayer));
        const rootPriors = maskedSoftmax(logits, rootMask);
        const root = new Node(1);
        for (let i = 0; i < ACTION_SIZE; i++) {
            if (rootMask[i] > 0) root.children.set(i, new Node(rootPriors[i]));
        }
        if (root.children.size === 0) return { visits: new Float32Array(ACTION_SIZE), value: rootValue };

        for (let sim = 0; sim < numSims; sim++) {
            const state = cloneState(rootState);
            const pathNodes = [root];
            let node = root;
            let curPlayer = rootPlayer;
            while (node.children.size > 0 && node.visits > 0) {
                const maximize = curPlayer === rootPlayer;
                const [idx, child] = selectChild(node, cPuct, maximize);
                if (child === null) break;
                const move = decodeAction(idx);
                if (!move) break;
                state.currentPlayer = curPlayer;
                applyMove(state, move);
                curPlayer = state.currentPlayer;
                node = child;
                pathNodes.push(node);
                if (isTerminal(state)) break;
            }
            let leafValueFromRoot;
            if (isTerminal(state)) {
                const s = getScores(state);
                const diff = s[rootPlayer] - s[otherPlayer(rootPlayer)];
                leafValueFromRoot = Math.sign(diff);
            } else {
                const leafMask = encodeActionMask(state, curPlayer);
                const { logits: lL, value: lV } = forward(encodeState(state, curPlayer));
                const leafPriors = maskedSoftmax(lL, leafMask);
                for (let i = 0; i < ACTION_SIZE; i++) {
                    if (leafMask[i] > 0 && !node.children.has(i)) node.children.set(i, new Node(leafPriors[i]));
                }
                leafValueFromRoot = curPlayer === rootPlayer ? lV : -lV;
            }
            for (const n of pathNodes) { n.visits += 1; n.valueSum += leafValueFromRoot; }
        }
        const visits = new Float32Array(ACTION_SIZE);
        for (const [idx, child] of root.children) visits[idx] = child.visits;
        return { visits, value: nodeValue(root) };
    };

    // ====== Public API ======
    window.FloodRL = {
        isReady() { return params !== null; },
        async loadModel(url = '/flood-model.json') {
            try {
                const response = await fetch(url, { cache: 'no-store' });
                if (!response.ok) {
                    console.log('[FloodRL] No model file — fallback to heuristic bot');
                    return false;
                }
                const obj = await response.json();
                if (obj.inputSize !== INPUT_SIZE || obj.actionSize !== ACTION_SIZE) {
                    console.warn('[FloodRL] Incompatible model file, sizes:', obj.inputSize, obj.actionSize);
                    return false;
                }
                params = new Float32Array(obj.params);
                console.log(`[FloodRL] Loaded model, ${obj.paramCount} params`);
                return true;
            } catch (err) {
                console.log('[FloodRL] Failed to load model, using heuristic bot:', err.message);
                return false;
            }
        },
        /** Given a live FloodGame instance + the bot's player color, run
         *  MCTS with the loaded weights and return an action object
         *  compatible with FloodGame.getBestStrategicAction().bestAction.
         *  Returns null if no legal moves or model not loaded. */
        getBestMove(game, player, { numSims = 96, cPuct = 1.5 } = {}) {
            if (!params) return null;
            const state = snapshotGame(game);
            state.currentPlayer = player; // force to our turn
            const { visits } = runMcts(state, player, numSims, cPuct);
            // Argmax with random tie break
            let maxVisits = 0;
            for (let i = 0; i < ACTION_SIZE; i++) if (visits[i] > maxVisits) maxVisits = visits[i];
            if (maxVisits === 0) return null;
            const winners = [];
            for (let i = 0; i < ACTION_SIZE; i++) if (visits[i] === maxVisits) winners.push(i);
            const idx = winners[Math.floor(Math.random() * winners.length)];
            const move = decodeAction(idx);
            if (!move) return null;
            // Convert to the shape aiTurn() expects
            if (move.type === 'place') {
                const card = game[`${player}Hand`][move.slotIndex];
                return { type: 'move', slotIndex: move.slotIndex, row: move.row, col: move.col, card };
            } else {
                const card = game[`${player}Hand`][move.slotIndex];
                return { type: 'discard', slotIndex: move.slotIndex, index: move.slotIndex, card };
            }
        }
    };

    // Auto-load on script load
    window.FloodRL.loadModel();
})();
