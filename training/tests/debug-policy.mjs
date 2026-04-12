import { newGame, applyMove, isTerminal, getLegalMoves } from '../engine/core.mjs';
import { encodeState, encodeActionMask, ACTION_SIZE } from '../engine/encoding.mjs';
import { evaluateMove, evaluateDiscardValue } from '../engine/heuristic.mjs';
import { floodBotStaticMove } from '../bot/tiers.mjs';
import { createParams, forward, maskedSoftmax } from '../net/mlp.mjs';

const state = newGame({ seed: 'dbg' });
for (let i = 0; i < 30; i++) {
    if (state.gamePhase === 'playing' && state.openingMoveComplete) break;
    const mv = floodBotStaticMove(state, state.currentPlayer);
    if (!mv) break;
    applyMove(state, mv);
}
console.log('phase:', state.gamePhase, 'openingMoveComplete:', state.openingMoveComplete);
const player = state.currentPlayer;
const legal = getLegalMoves(state, player);
console.log('legal count:', legal.length);
const mask = encodeActionMask(state, player);
let maskCount = 0;
const legalMaskIndices = [];
for (let i = 0; i < ACTION_SIZE; i++) if (mask[i] > 0) { maskCount++; legalMaskIndices.push(i); }
console.log('mask count:', maskCount, 'indices:', legalMaskIndices);

const hand = state[`${player}Hand`];
console.log('hand:', hand.map(c => c ? `${c.rank}${c.suit}` : '-').join(' '));

// Build policy target
const policy = new Float32Array(ACTION_SIZE);
const legalIndices = [];
const scores = [];
for (let i = 0; i < ACTION_SIZE; i++) {
    if (mask[i] === 0) continue;
    const slotIndex = Math.floor(i / 27);
    const target = i % 27;
    if (target === 26) continue;
    const card = hand[slotIndex];
    if (!card) { console.log('null card for slot', slotIndex, 'i=', i); continue; }
    let score;
    if (target === 25) {
        score = -evaluateDiscardValue(state, card, player) - 5;
    } else {
        const row = Math.floor(target / 5);
        const col = target % 5;
        score = evaluateMove(state, row, col, card, player);
    }
    legalIndices.push(i);
    scores.push(score);
}
console.log('legalIndices length:', legalIndices.length);
console.log('scores:', scores);
const maxScore = Math.max(...scores);
const temperature = 15;
const exps = scores.map(s => Math.exp((s - maxScore) / temperature));
const sum = exps.reduce((a, b) => a + b, 0);
for (let i = 0; i < legalIndices.length; i++) {
    policy[legalIndices[i]] = exps[i] / sum;
}
console.log('policy nonzero sum:', [...policy].reduce((a, b) => a + b, 0));

// Argmax check
let tgtMaxIdx = -1, tgtMax = -Infinity;
for (let a = 0; a < ACTION_SIZE; a++) {
    if (mask[a] === 0) continue;
    if (policy[a] > tgtMax) { tgtMax = policy[a]; tgtMaxIdx = a; }
}
console.log('tgtMaxIdx:', tgtMaxIdx, 'tgtMax:', tgtMax);

// Now simulate what the metric is doing
const params = createParams(99);
const input = encodeState(state, player);
const { policyLogits } = forward(params, input);
const probs = maskedSoftmax(policyLogits, mask);
let predMaxIdx = -1, predMax = -Infinity;
for (let a = 0; a < ACTION_SIZE; a++) {
    if (mask[a] === 0) continue;
    if (probs[a] > predMax) { predMax = probs[a]; predMaxIdx = a; }
}
console.log('predMaxIdx:', predMaxIdx, 'predMax:', predMax);
console.log('cond:', predMaxIdx !== -1 && tgtMaxIdx !== -1);
