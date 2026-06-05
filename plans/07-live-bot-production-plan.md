# Phase 7 Implementation Plan: Live Bot Production

## Design Decisions

### 1. Separation of Concerns
- **Phase 6 core bot remains untouched** — no modifications to `bot.js`, `decision-engine.js`, `tick-stream.js`, `connection-manager.js`, `indicator-engine.js`, `trade-executor.js`, `contract-monitor.js`, `stake-manager.js`, `session-tracker.js`
- Production features are **additive layers** via `index.js` wiring and new standalone modules
- Only additions to Phase 6: `getHealth()` method on `Bot` class and a `restoreFromDb()` method on `RiskManager`

### 2. Logging — Winston Wrapper
- Create `logging-config.js` that exports a winston logger with the **same interface** as Phase 6's inline logger (`error()`, `warn()`, `info()`, `debug()`)
- JSON format for machine parsing, human-readable format for console
- Log rotation: 10MB max per file, 10 files, gzip compression
- Three log files: `combined.log` (all), `error.log` (ERROR only), `debug.log` (DEBUG only, created on demand)
- The console output stays human-readable; files get JSON

### 3. Health Monitor
- Small HTTP server on `127.0.0.1:3456` serving `/health`
- Returns JSON from `bot.getHealth()` — bot state, connection state, daily stats, risk limits, memory, uptime, last tick info
- Started in `index.js` as a sidecar, not as part of bot core

### 4. Alert Manager — Telegram
- `src/alert-manager.js` dispatches alerts via Telegram Bot API
- Trigger events: bot stopped, consecutive losses hit, daily loss hit, connection lost, max restarts, tick gap, balance change
- `index.js` wires alert-manager to bot events
- Config via `.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- Graceful degradation: if not configured, alerts are silently skipped (only logs)

### 5. Session Reporter
- `src/session-reporter.js` generates daily reports at midnight
- Query `live_trades.db` for today's trades
- Output JSON + human-readable text to `reports/` directory
- Includes time analysis (trades by hour)
- Sends summary via alert channel
- Triggered by a timer in `index.js` (checks every minute if day changed)

### 6. Graceful Shutdown
- Enhanced `stop()` flow in `bot.js`:
  1. Set state to STOPPING
  2. If active contract, wait for resolution (max 2x duration = 80 ticks at 200ms = ~16s timeout)
  3. Save session state to DB: daily stats in a new `sessions` table
  4. Unsubscribe ticks, disconnect WebSocket
  5. Exit process (code 0)
- `stop.txt` check: already implemented in Phase 6 bot.js (checked every tick)
- Keep existing SIGINT handler, enhance with contract-aware wait

### 7. Startup Recovery
- On startup, `index.js` calls `bot.restoreSession()` before entering main loop
- `bot.restoreSession()`:
  1. Query `live_trades.db` for today's trades
  2. Restore `riskManager.dailyTrades`, `dailyLoss`, `dailyPnL`, `consecutiveLosses`
  3. Log "Session recovered: X trades today, $Y PnL"
- No replay — just continue from current state

### 8. Process Manager — pm2
- `ecosystem.config.js` with: fork mode, max 10 restarts/60s, 200MB memory limit, graceful timeout 10s, log files in `logs/`
- Deployment checklist from spec

### 9. Production Increments
- 4-week graduated plan: demo no-buy -> demo buys -> real $0.35 -> real scaled
- Documented in `PRODUCTION.md`

## Files to Create

| File | Purpose |
|------|---------|
| `backend/logging-config.js` | Winston logger with rotation, JSON format, 3 log files |
| `backend/src/health-monitor.js` | HTTP `/health` endpoint on localhost:3456 |
| `backend/src/alert-manager.js` | Telegram Bot API dispatcher |
| `backend/src/session-reporter.js` | Daily report generation (JSON + text) |
| `backend/ecosystem.config.js` | pm2 process configuration |
| `backend/PRODUCTION.md` | Deployment guide, graduation procedure |

## Files to Modify (Minimal)

| File | Change |
|------|--------|
| `backend/index.js` | Import winston logger; wire health-monitor, alert-manager, session-reporter, graceful-shutdown, startup recovery |
| `backend/src/bot.js` | Add `getHealth()` method; enhance `stop()` with contract-aware wait; add `restoreSession()` |
| `backend/src/risk-manager.js` | Add `restoreFromDb(trades)` method to restore daily limits from today's trades |
| `backend/src/trade-logger.js` | Add `getTodayStats()` method returning aggregate trade data for startup recovery |
| `backend/package.json` | Add `winston` and `winston-daily-rotate-file` deps; add `npm run production` script |
| `backend/.env.example` | Add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `HEALTH_PORT`, `LOG_DIR`, `REPORT_DIR` |

## Acceptance Criteria Coverage

| AC | How achieved |
|----|-------------|
| 1. Bot under pm2 | `ecosystem.config.js` with `pm2 start` |
| 2. Auto-restart on crash | pm2 `autorestart: true`, `max_restarts: 10` |
| 3. Log rotation | winston-daily-rotate-file, 10MB/10 files/gzip |
| 4. Health check HTTP | `health-monitor.js` on `localhost:3456/health` |
| 5. Graceful shutdown | Enhanced `bot.stop()` waits for contract, saves state |
| 6. Session recovery | `riskManager.restoreFromDb()` on startup |
| 7. Daily report | `session-reporter.js` triggered by daily timer |
| 8. stop.txt works | Already in Phase 6 bot.js (checked every tick) |
| 9. Alert fires | `alert-manager.js` sends Telegram on trigger events |
