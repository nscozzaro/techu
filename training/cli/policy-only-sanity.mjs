#!/usr/bin/env node
// Bypass MCTS. Use MLP policy only (argmax of masked softmax over actions).
// If untrained policy-only bot is ~50% vs random, MCTS has a bug.

import { createParams, forward, maskedSoftmax } from '../net/mlp.mjs';
import { encodeState, encodeActionMask, decodeAction, ACTION_SIZE } from '../engine/encoding.mjs';
import { playMatch } from '../selfplay/selfplay.mjs';
import { getLegalMoves } from '../engine/core.mjs';

const randomBot = {
    name: 'Random',
    getMove: (state, player) => {
        const legal = getLegalMoves(state, player);
        return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
    }
};

const params = createParams(42);

const policyOnlyBot = {
    name: 'PolicyOnly',
    getMove: (state, player) => {
        const input = encodeState(state, player);
        const mask = encodeActionMask(state, player);
        const { policyLogits } = forward(params, input);
        const probs = maskedSoftmax(policyLogits, mask);
        // Argmax with random tie-break
        let bestVal = -Infinity;
        for (let i = 0; i < ACTION_SIZE; i++) if (probs[i] > bestVal) bestVal = probs[i];
        if (bestVal <= 0) {
            const legal = getLegalMoves(state, player);
            return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
        }
        const winners = [];
        for (let i = 0; i < ACTION_SIZE; i++) if (probs[i] === bestVal) winners.push(i);
        const idx = winners[Math.floor(Math.random() * winners.length)];
        return decodeAction(idx);
    }
};

// Also try: sampled (not argmax) — should be near-uniform legal = ~ random
const policySampleBot = {
    name: 'PolicySample',
    getMove: (state, player) => {
        const input = encodeState(state, player);
        const mask = encodeActionMask(state, player);
        const { policyLogits } = forward(params, input);
        const probs = maskedSoftmax(policyLogits, mask);
        let r = Math.random();
        for (let i = 0; i < ACTION_SIZE; i++) {
            r -= probs[i];
            if (r <= 0) return decodeAction(i);
        }
        // Fallback
        const legal = getLegalMoves(state, player);
        return legal[Math.floor(Math.random() * legal.length)];
    }
};

for (const bot of [policyOnlyBot, policySampleBot]) {
    const result = playMatch(bot, randomBot, 50, { seedPrefix: `policy-${bot.name}` });
    console.log(
        `${bot.name.padEnd(14)} vs Random: ${result.aWins}-${result.bWins}-${result.ties}  ` +
        `(${(100 * result.aWins / result.totalGames).toFixed(1)}%)`
    );
}
