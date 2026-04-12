// training/mcts/mcts.mjs
// AlphaZero-lite MCTS with UCT and policy/value net prior.
// Designed for determinized play in imperfect-information Flood: the
// caller samples an opponent-hand determinization before each search
// root expansion, then runs K sims. Multiple determinizations can be
// averaged externally by the caller.
//
// Node stores:
//   visits, valueSum, prior
//   children: Map<actionIdx, Node>
//   state clone at the node (for expansion/simulation)

import {
    cloneState, applyMove, isTerminal, getLegalMoves, otherPlayer, getScores
} from '../engine/core.mjs';
import {
    INPUT_SIZE, ACTION_SIZE, encodeState, encodeActionMask, decodeAction, encodeAction
} from '../engine/encoding.mjs';
import { forward, maskedSoftmax } from '../net/mlp.mjs';

class Node {
    constructor(prior) {
        this.prior = prior;
        this.visits = 0;
        this.valueSum = 0;
        this.children = new Map(); // actionIdx → Node
    }
    value() { return this.visits === 0 ? 0 : this.valueSum / this.visits; }
}

/** Add Dirichlet(α) noise to the priors at the root (exploration). */
const addDirichletNoise = (priors, mask, alpha, weight, rng) => {
    // Sample from Dirichlet by sampling gammas and normalizing
    const gammas = new Float32Array(ACTION_SIZE);
    let gammaSum = 0;
    for (let i = 0; i < ACTION_SIZE; i++) {
        if (mask[i] > 0) {
            // Marsaglia-Tsang approximation for Gamma(alpha): good enough for alpha≈1
            // For alpha=0.25 we use the shape≈small fallback via u^(1/alpha) * gamma(1)
            let x;
            if (alpha >= 1) {
                // Stub: approximate with exponential (alpha=1) — close enough for α≈1
                x = -Math.log(1 - rng());
            } else {
                // Johnk's method: u^(1/alpha) / (u^(1/alpha) + v^(1/(1-alpha)))
                // and multiply by Exp(1)
                let u, v, sum;
                do {
                    u = Math.pow(rng(), 1 / alpha);
                    v = Math.pow(rng(), 1 / (1 - alpha));
                    sum = u + v;
                } while (sum > 1 || sum === 0);
                x = (u / sum) * -Math.log(1 - rng());
            }
            gammas[i] = x;
            gammaSum += x;
        }
    }
    if (gammaSum > 0) {
        for (let i = 0; i < ACTION_SIZE; i++) {
            if (mask[i] > 0) {
                const noise = gammas[i] / gammaSum;
                priors[i] = (1 - weight) * priors[i] + weight * noise;
            }
        }
    }
};

/** Run one MCTS tree search from `rootState` (from rootPlayer's perspective).
 *  Returns a Float32Array(ACTION_SIZE) of visit-count distribution over the
 *  legal actions, plus the value estimate at the root.
 *
 *  Options:
 *    params           — MLP parameter vector
 *    numSimulations   — UCT iterations
 *    cPuct            — exploration constant
 *    dirichletAlpha   — noise α at the root (0 to disable)
 *    dirichletWeight  — mix fraction for the noise (e.g. 0.25)
 *    rng              — () => float in [0,1) */
export const runMcts = (rootState, rootPlayer, params, {
    numSimulations = 64,
    cPuct = 1.5,
    dirichletAlpha = 0,
    dirichletWeight = 0.25,
    rng = Math.random
} = {}) => {
    // Build root
    const rootMask = encodeActionMask(rootState, rootPlayer);
    const rootInput = encodeState(rootState, rootPlayer);
    const { policyLogits, value: rootValue } = forward(params, rootInput);
    const rootPriors = maskedSoftmax(policyLogits, rootMask);
    if (dirichletAlpha > 0) {
        addDirichletNoise(rootPriors, rootMask, dirichletAlpha, dirichletWeight, rng);
    }
    const root = new Node(1);
    for (let i = 0; i < ACTION_SIZE; i++) {
        if (rootMask[i] > 0) {
            root.children.set(i, new Node(rootPriors[i]));
        }
    }
    if (root.children.size === 0) {
        return { visitDistribution: new Float32Array(ACTION_SIZE), value: rootValue, totalVisits: 0 };
    }

    // Convention: every node stores Q from rootPlayer's perspective.
    // selectChild negates Q at opponent nodes (negamax).
    // Backup: every node on the path receives the same leafValueFromRoot.
    // No double-counting; no per-step sign flip.
    for (let sim = 0; sim < numSimulations; sim++) {
        const state = cloneState(rootState);
        // Path of nodes we visited, including the root.
        const pathNodes = [root];
        let node = root;
        let curPlayer = rootPlayer;

        // Descend while the current node has been visited and expanded.
        while (node.children.size > 0 && node.visits > 0) {
            const isRootPlayerTurn = curPlayer === rootPlayer;
            const [actionIdx, child] = selectChild(node, cPuct, isRootPlayerTurn, rng);
            if (child === null) break;
            const move = decodeAction(actionIdx);
            if (!move) break;
            state.currentPlayer = curPlayer;
            applyMove(state, move);
            curPlayer = state.currentPlayer;
            node = child;
            pathNodes.push(node);
            if (isTerminal(state)) break;
        }

        // Evaluate leaf — get value from rootPlayer's perspective
        let leafValueFromRoot;
        if (isTerminal(state)) {
            const scores = getScores(state);
            const diff = scores[rootPlayer] - scores[otherPlayer(rootPlayer)];
            leafValueFromRoot = Math.sign(diff);
        } else {
            const leafMask = encodeActionMask(state, curPlayer);
            const leafInput = encodeState(state, curPlayer);
            const { policyLogits: lLogits, value: lValue } = forward(params, leafInput);
            const leafPriors = maskedSoftmax(lLogits, leafMask);
            for (let i = 0; i < ACTION_SIZE; i++) {
                if (leafMask[i] > 0 && !node.children.has(i)) {
                    node.children.set(i, new Node(leafPriors[i]));
                }
            }
            // lValue is from curPlayer's perspective. Convert to rootPlayer's.
            leafValueFromRoot = curPlayer === rootPlayer ? lValue : -lValue;
        }

        // Backup — every node on the path records rootPlayer's perspective.
        for (const n of pathNodes) {
            n.visits += 1;
            n.valueSum += leafValueFromRoot;
        }
    }

    // Build visit distribution
    const visits = new Float32Array(ACTION_SIZE);
    let total = 0;
    for (const [idx, child] of root.children) {
        visits[idx] = child.visits;
        total += child.visits;
    }
    if (total > 0) {
        for (let i = 0; i < ACTION_SIZE; i++) visits[i] /= total;
    }
    return { visitDistribution: visits, value: root.value(), totalVisits: total };
};

/** PUCT child selection. `maximize` = true when it's rootPlayer's turn at
 *  this node (maximize rootPlayer's expected value); false at opponent nodes
 *  (minimize rootPlayer's expected value). Ties broken by small jitter so
 *  insertion order doesn't bias choice. */
const selectChild = (node, cPuct, maximize, rng = Math.random) => {
    let bestScore = -Infinity;
    let bestIdx = -1;
    let bestChild = null;
    const parentVisits = Math.max(1, node.visits);
    const sqrtParent = Math.sqrt(parentVisits);
    for (const [idx, child] of node.children) {
        const q = child.value(); // rootPlayer's perspective
        const effectiveQ = maximize ? q : -q;
        const u = cPuct * child.prior * sqrtParent / (1 + child.visits);
        // Tiny random jitter to break ties without materially affecting selection
        const jitter = (rng() - 0.5) * 1e-6;
        const score = effectiveQ + u + jitter;
        if (score > bestScore) {
            bestScore = score;
            bestIdx = idx;
            bestChild = child;
        }
    }
    return [bestIdx, bestChild];
};

/** Pick an action from a visit distribution using temperature τ.
 *  τ=0 means argmax with RANDOM tie-breaking (important for imperfect-
 *  information games where ties are common early in training).
 *  τ>0 samples from the distribution raised to 1/τ. */
export const sampleFromDistribution = (dist, temperature, rng = Math.random) => {
    if (temperature === 0) {
        let bestVal = -Infinity;
        // First pass: find the max value
        for (let i = 0; i < ACTION_SIZE; i++) {
            if (dist[i] > bestVal) bestVal = dist[i];
        }
        if (bestVal <= 0) return -1;
        // Second pass: collect all tied winners and pick uniformly
        const winners = [];
        for (let i = 0; i < ACTION_SIZE; i++) {
            if (dist[i] === bestVal) winners.push(i);
        }
        return winners[Math.floor(rng() * winners.length)];
    }
    // Soften and sample
    const tau = 1 / temperature;
    let sum = 0;
    const probs = new Float32Array(ACTION_SIZE);
    for (let i = 0; i < ACTION_SIZE; i++) {
        if (dist[i] > 0) {
            probs[i] = Math.pow(dist[i], tau);
            sum += probs[i];
        }
    }
    if (sum === 0) return -1;
    let r = rng() * sum;
    for (let i = 0; i < ACTION_SIZE; i++) {
        r -= probs[i];
        if (r <= 0) return i;
    }
    return ACTION_SIZE - 1;
};
