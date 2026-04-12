# Flood RL Training

Lightweight reinforcement-learning pipeline for training a bot that can beat the hand-tuned heuristic-plus-alpha-beta baseline in `index.html`.

## Layout

```
training/
  engine/
    core.mjs           Pure headless Flood engine (game rules + state)
    heuristic.mjs      Port of FloodGame.evaluateMove + helpers
    search.mjs         Iterative-deepening alpha-beta matching index.html
    encoding.mjs       State → Float32Array(256) + action masking
  bot/
    tiers.mjs          FloodBotStatic / FloodBotShallow / FloodBotFull
  net/
    mlp.mjs            2-layer MLP with Float32Array, policy + value heads
  mcts/
    mcts.mjs           PUCT with policy prior, Dirichlet root noise
  selfplay/
    selfplay.mjs       Self-play game loop + trajectory collection
  league/
    evaluate.mjs       SPRT + paired seeds + side-swap + Wilson CIs
  hyper/
    autoadjust.mjs     Rollback-on-regression + LR decay + exploration boost
  dashboard/
    server.mjs         HTTP server (no deps) serving public/index.html + SSE
    public/index.html  Live dashboard with reality-check metrics
  configs/
    fast.json          Fast-iteration hyperparameters
    fast8.json         8-gen training config used for initial runs
  cli/
    train.mjs          Main training loop
    smoke.mjs          Engine smoke test (random vs random)
    bot-vs-random.mjs  Verify FloodBotStatic beats random
    tier-matrix.mjs    Round-robin Static/Shallow/Full + Random
    mcts-sanity*.mjs   MCTS correctness checks
  checkpoints/         Generated each run: champion.json, latest.json, live.json
```

## Quick start

```bash
# 1. Verify the engine and bot port are correct
node training/cli/smoke.mjs             # 100 random games, should have 0 errors
node training/cli/bot-vs-random.mjs 100  # FloodBotStatic vs Random → expect 100% static
node training/cli/tier-matrix.mjs 10     # Full > Shallow > Static > Random

# 2. Start training (blocks until maxGenerations completes)
node training/cli/train.mjs training/configs/fast8.json

# 3. In another terminal, start the dashboard
node training/dashboard/server.mjs 3001
# Open http://127.0.0.1:3001

# 4. After training, deploy the trained model into the web app
cp training/checkpoints/champion.json flood-model.json
# Open index.html and run this in the dev console:
localStorage.setItem('flood-bot-mode', 'rl')  // then restart a game
# Use 'heuristic' or remove the key to revert to the built-in bot.
```

## How the plateau defenses work

The user's previous attempt plateaued at <50% in self-play and was gaslit by
sycophantic progress reports. This pipeline is organized around preventing
that:

1. **Headline metric is win-rate vs a FROZEN opponent**, not Elo or self-play.
   Elo in a training pool drifts without tracking real skill. The dashboard's
   top row shows win-rate vs Random and vs FloodBotStatic with 95% Wilson CIs.

2. **SPRT promotion gate with paired seeds + side-swap**. A new champion is
   only accepted when sequential tests confirm p > 0.58 against the current
   champion. Paired seeds cancel deck-order variance; side-swap cancels the
   first-move advantage.

3. **Autoadjust with rollback**. If win-rate vs random drops >10% from peak,
   the challenger is reset to the champion weights and LR is halved. Rejected
   challengers are also reset so divergent gradients don't accumulate.

4. **Zero-init output heads**. The cold-start policy is exactly uniform —
   without this, the random bias in a fresh MLP makes argmax-policy lose
   systematically vs random (diagnosed during development, see
   `training/cli/policy-only-sanity.mjs`).

5. **Dirichlet noise at the MCTS root always on**. Exploration is the primary
   way training escapes local minima.

## Bot tiers (for opponent mix)

| Tier | Search | ~Per-move cost | Role |
|---|---|---|---|
| `FloodBotStatic` | none | ~1 ms | Primary training opponent |
| `FloodBotShallow` | depth 2, budget 500 nodes | ~5 ms | Mid-strength |
| `FloodBotFull` | phased depth 3–4 | ~30–60 ms | Final headline metric |

All three share the extracted engine and heuristic in `training/engine/` —
a single source of truth for Flood rules. `FloodBotFull` plays identically
to the bot in `index.html` given the same state.

## Known limitations

- Single-process for now. `worker_threads` parallelism is planned but not yet
  wired. Expect ~2-5 gens per minute at fast config.
- Stylistic opponents (greedy/hoarder/rusher/etc.) are in the plan but not
  yet implemented. Random + FloodBotStatic + FloodBotShallow are the current
  anti-sycophancy panel.
- No Python / no external ML libraries. Hand-rolled MLP with Float32Array
  is intentional — keeps the in-browser inference module (`rl-inference.js`)
  100% vanilla JS with zero dependencies.
