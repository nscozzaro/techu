// training/hyper/autoadjust.mjs
// Hyperparameter auto-adjustment triggered by training metrics.
// Returns a list of changes to apply to the mutable config this generation.

/** Compute which autoadjust triggers should fire this generation.
 *  `live.history` is the list of all past generations.
 *  Returns { changes: Array<{key, from, to}>, events: Array<{type, message}> } */
export const evaluateTriggers = (live, mutableConfig) => {
    const history = live.history;
    const events = [];
    const changes = [];

    if (history.length === 0) return { changes, events };

    const last = history[history.length - 1];
    const prev = history[history.length - 2];

    // ---- Trigger 1: Win rate vs random dropped >10% from peak → ROLLBACK ----
    const peakVsRandom = Math.max(...history.map(h => h.vsRandom?.winRate ?? 0));
    const currentVsRandom = last.vsRandom?.winRate ?? 0;
    if (history.length >= 3 && peakVsRandom - currentVsRandom > 0.10) {
        events.push({
            type: 'rollback',
            message: `vs-random dropped from peak ${(100 * peakVsRandom).toFixed(1)}% to ${(100 * currentVsRandom).toFixed(1)}% — rollback + halve LR`
        });
        changes.push({ key: 'rollbackToChampion', value: true });
        if (mutableConfig.learningRate > 1e-4) {
            changes.push({ key: 'learningRate', from: mutableConfig.learningRate, to: mutableConfig.learningRate * 0.5 });
        }
    }

    // ---- Trigger 2: Challenger rejected 3 gens in a row → boost exploration ----
    // Cooldown: don't re-fire this trigger until at least 3 generations after the
    // previous stagnation event. Without the cooldown, once 3 consecutive rejections
    // land, every subsequent rejected generation would also fire the trigger (since
    // the last-3 window is always "3 consecutive accept_h0"), causing MCTS sims to
    // 1.5× on every gen and quickly pushing wall time out of budget.
    const lastStagnationGen = findLastEventGen(live.events, 'stagnation');
    const currentGen = history.length - 1; // 0-indexed
    const stagnationCooldownOK = lastStagnationGen < 0 || (currentGen - lastStagnationGen) >= 3;
    const recent = history.slice(-3);
    const rejectedRun = recent.length === 3 && recent.every(h => h.vsChampion?.decision === 'accept_h0');
    if (rejectedRun && stagnationCooldownOK) {
        events.push({
            type: 'stagnation',
            message: `3 consecutive rejected challengers — boosting MCTS sims and Dirichlet α`
        });
        if (mutableConfig.mctsSims < 256) {
            changes.push({ key: 'mctsSims', from: mutableConfig.mctsSims, to: Math.ceil(mutableConfig.mctsSims * 1.5) });
        }
        if (mutableConfig.dirichletAlpha < 1) {
            changes.push({ key: 'dirichletAlpha', from: mutableConfig.dirichletAlpha, to: Math.min(1, mutableConfig.dirichletAlpha * 1.3) });
        }
        if (mutableConfig.learningRate > 1e-4) {
            changes.push({ key: 'learningRate', from: mutableConfig.learningRate, to: mutableConfig.learningRate * 0.5 });
        }
    }

    // ---- Trigger 3: Value loss divergent (3-gen moving avg rising) → halve LR ----
    if (history.length >= 4) {
        const recent3 = history.slice(-3).map(h => h.valueLoss ?? 0);
        const prev3 = history.slice(-4, -1).map(h => h.valueLoss ?? 0);
        const recentAvg = recent3.reduce((a, b) => a + b, 0) / 3;
        const prevAvg = prev3.reduce((a, b) => a + b, 0) / 3;
        if (recentAvg > prevAvg * 1.2 && mutableConfig.learningRate > 1e-4) {
            events.push({
                type: 'lr_decay',
                message: `value loss rising (${prevAvg.toFixed(3)} → ${recentAvg.toFixed(3)}) — halving LR`
            });
            changes.push({ key: 'learningRate', from: mutableConfig.learningRate, to: mutableConfig.learningRate * 0.5 });
        }
    }

    // ---- Trigger 4: Gradient norm exploding → tighter clip + halve LR ----
    if ((last.gradNorm ?? 0) > 5 && mutableConfig.gradClip > 0.25) {
        events.push({
            type: 'grad_clip',
            message: `gradient norm ${last.gradNorm.toFixed(2)} — tightening clip and halving LR`
        });
        changes.push({ key: 'gradClip', from: mutableConfig.gradClip, to: Math.max(0.25, mutableConfig.gradClip * 0.5) });
        if (mutableConfig.learningRate > 1e-4) {
            changes.push({ key: 'learningRate', from: mutableConfig.learningRate, to: mutableConfig.learningRate * 0.5 });
        }
    }

    return { changes, events };
};

/** Apply a list of changes to a mutable config object in place. */
export const applyChanges = (config, changes) => {
    for (const c of changes) {
        if (c.key === 'rollbackToChampion') continue; // handled by orchestrator
        config[c.key] = c.to ?? c.value;
    }
};

/** Find the generation number of the most recent event with a given type, or -1. */
const findLastEventGen = (events, type) => {
    if (!events || events.length === 0) return -1;
    for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type === type) return events[i].gen;
    }
    return -1;
};
