# Phase 6 Implementation Plan: Live Bot Core

## Design Decisions

1. **Demo-first, dry-run mode** — `dryRun` defaults to `true`. Bot gets proposals and logs trades but never executes `buy`. The `.env` variable `DRY_RUN=false` enables real money.

2. **Manual kill switch** — `stop.txt` file check every tick. Also SIGINT/Ctrl+C and stdin "stop" command.

3. **Indicator reuse** — `src/indicator-engine.js` wraps the Phase 3 `lib/indicator-engine.js` with the spec's incremental `update()` + getters (`rsi`, `bollingerBands`, `emaShort`, `emaLong`, `roc`, `getAll()`). Warmup detection checks max period across all indicators.

4. **Scoring reuse** — `src/decision-engine.js` imports `computeScore` from Phase 3's `lib/scoring-engine.js` directly.

5. **ConnectionManager** — Uses `@deriv/deriv-api/dist/DerivAPIBasic` (same as Phase 1). 5-state machine: `DISCONNECTED→CONNECTING→CONNECTED→AUTHORIZED→ERROR`. Exponential backoff reconnect up to 10 attempts. Ping every 30s.

6. **Contract monitoring** — Tick-based approach from spec §3.2.7 Approach 1. Local ID counter ("BC-0001") for tracking; Deriv contract_id stored alongside.

7. **Trade logging** — Separate SQLite DB `data/live_trades.db` with full `trades` table per spec §3.2.10.

8. **Configuration** — `config.js` loads from `data/optimization-results/best-params.json` first, then `.env` overrides, then hardcoded defaults. Auto-detects direction from symbol prefix (CRASH→CALL, BOOM→PUT).

## File Structure

```
backend/
  index.js                        # Entry point — starts the bot, SIGINT handler, stdin commands
  config.js                       # Config loader (best-params.json + .env + defaults)
  .env.example                    # Template for environment variables
  src/
    bot.js                        # Main Bot orchestrator (state machine)
    connection-manager.js         # Deriv API WebSocket lifecycle
    tick-stream.js                # Live tick subscription + ring buffer + DB storage
    indicator-engine.js           # Incremental indicator wrapper (wraps Phase 3 lib)
    decision-engine.js            # Scoring + risk checks → entry decisions
    trade-executor.js             # Proposal + buy flow (dry-run safe)
    contract-monitor.js           # Active contract tracking, tick-based resolution
    risk-manager.js               # Hard/soft limits, daily reset
    stake-manager.js              # Fixed / proportional / martingale
    trade-logger.js               # SQLite trade recording
    session-tracker.js            # Daily/session statistics
```

## Bot State Machine

```
INIT → DISCONNECTED → CONNECTING → AUTHORIZED
                                         ↓
                                    COLLECTING (buffer warmup)
                                         ↓
                                    SCORING (continuous)
                                         ↓
                                    DECISION (each tick)
                                     /       \
                                 SKIP      ENTERING → IN_POSITION → RESOLVING → COOLDOWN → SCORING
```

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Connects to Deriv API | Logs show AUTHORIZED on start |
| 2 | Receives live ticks | `[TickStream]` events logged with real prices |
| 3 | Indicators calculate correctly | RSI 0-100, BB upper>middle>lower in logs |
| 4 | Scoring produces decisions | `SCORE CALL=X PUT=Y` logged each tick |
| 5 | Trade proposal works (dry-run) | `DRY-RUN CALL` logged, no buy executed |
| 6 | Risk limits enforced | `DRY_RUN=false` + maxDailyLoss=0 → "risk limit reached" |
| 7 | Trade logged to database | `trades` table in `live_trades.db` has records |
| 8 | Demo mode safe | Default `DRY_RUN=true`, no `buy()` call in dry-run |

## Startup Sequence

1. `index.js` loads config via `config.js`
2. `Bot.start()` → `ConnectionManager.connect()`
3. Connection emits `authorized` → `TickStream.start()`
4. `TickStream` emits `tick` on each tick
5. After buffer warmup (30+ ticks), `IndicatorEngine.isReady()` = true
6. Each tick: update indicators → get scores → evaluate → decide → execute
7. Contract lifecycle: entry → monitor → resolve → cooldown → loop
