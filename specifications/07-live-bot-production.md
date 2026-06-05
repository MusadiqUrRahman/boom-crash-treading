# Specification 07: Live Bot Production

- **Version:** 1.0
- **Research basis:** `research-boom-crash/12-deployment-architecture.md`, `research-boom-crash/15-risk-management-framework.md`, `research-boom-crash/16-automation-247.md`, `research-boom-crash/17-monitoring-and-alerts.md`
- **Status:** Draft

## 1. Objective

Productionize the Phase 6 live bot for 24/7 unattended operation. Add process management, structured logging, monitoring, alerting, session reporting, and graceful recovery from failures. Deploy on a VPS or local server for continuous operation.

**Prerequisite:** Phase 6 bot core works reliably on demo account for at least 7 days with 500+ trades without manual intervention.

## 2. Input Requirements

### Data

- Phase 6 bot code (`backend/`) — fully tested on demo
- Phase 4 best parameters (`best-params.json`)
- VPS or dedicated machine (Windows or Linux)

### Dependencies

- **Phase 6 (Live Bot Core)** — must be completed and tested on demo for 7+ days

## 3. Technical Specification

### 3.1 Production Architecture

```
pm2 (process manager)
  └── Bot process (Node.js)
       ├── Core bot (from Phase 6)
       ├── Enhanced logging (winston)
       ├── Health check endpoint
       └── Graceful shutdown handler

Separate processes (optional, recommended):
  ├── Session reporter (daily report generation)
  ├── Tick collector (continuous data accumulation)
  └── Dashboard server (web UI — optional)

File system:
  backend/
    logs/               # Rotating log files
    reports/            # Daily session reports
    data/               # Databases
    stop.txt            # Manual stop signal
```

### 3.2 Process Management with pm2

**Installation:**
```bash
npm install -g pm2
```

**Configuration (`ecosystem.config.js`):**
```javascript
module.exports = {
  apps: [{
    name: 'boom-crash-bot',
    script: 'backend/index.js',
    instances: 1,                    // Single instance (don't trade twice)
    exec_mode: 'fork',
    watch: false,                    // Don't restart on file changes
    autorestart: true,               // Auto-restart on crash
    max_restarts: 10,                // Max restarts in 60 seconds
    restart_delay: 5000,             // 5 second delay between restarts
    max_memory_restart: '200M',      // Restart if memory exceeds 200MB
    env: {
      NODE_ENV: 'production',
      PM2_GRACEFUL_TIMEOUT: 10000   // 10 seconds for graceful shutdown
    },
    log_file: './logs/pm2.log',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    time: true                       // Timestamp logs
  }]
};
```

**pm2 commands:**
```bash
pm2 start ecosystem.config.js    # Start bot
pm2 stop boom-crash-bot          # Stop gracefully
pm2 restart boom-crash-bot       # Restart
pm2 logs boom-crash-bot          # View logs
pm2 monit                        # Resource monitor
pm2 save                         # Save process list for startup
pm2 startup                      # Generate startup script
```

### 3.3 Logging System

Upgrade from simple `console.log` to structured logging with **winston**.

**Log levels:**
- `error` — Fatal errors, bot stopped
- `warn` — Non-fatal issues, recovery attempted
- `info` — Normal operations (trades, connections, limits)
- `debug` — Detailed state for troubleshooting (off by default)

**Log format (JSON for machine parsing):**
```json
{
  "timestamp": "2025-06-01T14:30:00.000Z",
  "level": "info",
  "component": "TradeExecutor",
  "message": "Contract purchased",
  "data": {
    "contract_id": "ctr_xyz",
    "symbol": "CRASH1000",
    "direction": "CALL",
    "stake": 0.50,
    "payout": 0.925,
    "entry_price": 1234.56
  }
}
```

**Log rotation:**
- Max file size: 10MB
- Max files: 10 (keep 100MB of logs)
- Compress old files (gzip)
- Daily rotation as fallback

**Log file structure:**
```
logs/
  combined.log       # All levels (INFO, WARN, ERROR)
  error.log          # Only ERROR level
  debug.log          # Only DEBUG level (optional, created on demand)
  pm2.log            # pm2 process logs
  archive/           # Compressed old logs
    combined-2025-06-01.log.gz
    error-2025-06-01.log.gz
```

### 3.4 Health Monitoring

**In-process health check:**
```javascript
{
  status: 'running' | 'stopped' | 'error',
  uptime: 1234567,            // seconds since start
  lastTickEpoch: 1678886400,  // epoch of most recent tick
  tickGap: 0.5,               // seconds since last tick
  connectionState: 'AUTHORIZED',
  currentState: 'SCORING',
  activeContract: null,       // or { id, remaining_ticks }
  dailyStats: {
    trades: 45,
    wins: 25,
    losses: 20,
    pnl: 4.25,
    maxDrawdown: -3.50
  },
  riskLimits: {
    consecutiveLosses: 2,
    dailyLoss: 3.50,
    dailyTrades: 45,
    dailyLossLimit: 10.00,
    dailyTradeLimit: 100
  },
  memoryUsage: 45.2,          // MB
  version: '1.0.0'
}
```

**Health check endpoint (HTTP):**
Since the bot is a WebSocket client (not a server), serve health on a small HTTP server on a local port:

```javascript
const http = require('http');
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(bot.getHealth()));
  }
}).listen(3456, '127.0.0.1');
```

Accessible at `http://localhost:3456/health`.

### 3.5 Alerts

**Local alerts (on-machine notifications):**

| Trigger | Method | Message |
|---|---|---|
| Bot stopped unexpectedly | pm2 auto-restart handles this | Log as ERROR |
| Consecutive losses > 5 | Bot stops, log ERROR | "MAX_CONSECUTIVE_LOSSES: Bot stopped after 6 losses" |
| Daily loss limit hit | Bot stops, log ERROR | "DAILY_LOSS_LIMIT: Bot stopped for the day" |
| Connection lost > 30s | Log WARN, auto-reconnect | "CONNECTION_LOST: Reconnecting..." |
| Max restarts exceeded | Log ERROR | "MAX_RESTARTS: pm2 gave up after 10 restarts" |
| Tick gap > 10 seconds | Log WARN | "TICK_GAP: No tick for 10 seconds" |
| Balance change > 5% | Log INFO with balance details | "BALANCE_CHANGE: Account balance now $345.00 (-2.8%)" |

**Remote alerts (optional — for unattended VPS):**
- **Email** — via Nodemailer or external service
- **Telegram/Discord** — webhook integration for real-time notifications
- **SMS** — for critical alerts only (bot stopped, max losses)

The planner should implement at least one remote notification channel. Telegram bot is recommended (simplest: send HTTP POST to `https://api.telegram.org/bot{TOKEN}/sendMessage`).

### 3.6 Session Reporting

Generate daily session reports automatically at midnight.

**Report format (JSON + human-readable text):**

```javascript
{
  "date": "2025-06-01",
  "symbol": "CRASH1000",
  "direction": "CALL",
  "parameters": { /* best-params */ },
  "account": {
    "startBalance": 300.00,
    "endBalance": 312.50,
    "dailyReturn": 0.0417,
    "peakBalance": 315.00,
    "maxDrawdown": -3.50
  },
  "trades": {
    "total": 45,
    "wins": 25,
    "losses": 20,
    "winRate": 0.5556,
    "avgWin": 0.85,
    "avgLoss": -1.00,
    "profitFactor": 1.06,
    "maxConsecutiveWins": 5,
    "maxConsecutiveLosses": 3,
    "averageStake": 0.50
  },
  "timeAnalysis": {
    "bestHour": 14,     // 2 PM UTC had highest WR
    "worstHour": 3,     // 3 AM UTC had lowest WR
    "tradesByHour": { "0": 2, "1": 1, ... }
  }
}
```

**Report delivery:**
- Saved to `reports/YYYY-MM-DD-summary.json`
- Saved to `reports/YYYY-MM-DD-summary.txt` (human-readable)
- Sent via alert channel (Telegram/Discord message)

### 3.7 Graceful Shutdown

When the bot receives a stop signal (SIGINT, pm2 stop, stop.txt):

```
1. Receive stop signal
2. Set state to STOPPING
3. If contract is active:
   a. Wait for it to resolve (max 2x duration)
   b. If timeout, log WARN "contract unresolved on shutdown"
4. Save session state to database:
   a. Current daily stats
   b. Active contract info
   c. Buffer state
5. Unsubscribe from ticks
6. Disconnect WebSocket
7. Log "Bot stopped gracefully"
8. Exit process (code 0)
```

**stop.txt mechanism:**
```javascript
const fs = require('fs');
setInterval(() => {
  if (fs.existsSync('./stop.txt')) {
    logger.info('stop.txt found — initiating graceful shutdown');
    bot.gracefulShutdown();
    fs.unlinkSync('./stop.txt');
  }
}, 5000);  // Check every 5 seconds
```

### 3.8 Startup Recovery

When the bot starts after an unexpected shutdown:

```
1. Load last saved session state from database
2. Recalculate today's trade count and PnL
3. Restore daily limits based on today's actual trades
4. Start fresh (don't replay — just continue from current state)
5. Log "Session recovered: N trades today, $X PnL"
```

### 3.9 File Structure (Complete)

```
backend/
  index.js                    # Entry point
  config.js                   # Configuration
  ecosystem.config.js         # pm2 config
  src/
    bot.js                    # Main bot orchestrator
    connection-manager.js     # Deriv API WebSocket
    tick-stream.js            # Live tick subscription
    indicator-engine.js       # Indicator calculations
    scoring-engine.js         # Multi-filter scoring
    decision-engine.js        # Entry decisions
    trade-executor.js         # Contract proposal + buy
    contract-monitor.js       # Active contract tracking
    risk-manager.js           # Risk limits
    stake-manager.js          # Stake progression
    trade-logger.js           # SQLite trade storage
    session-tracker.js        # Daily/session stats
    health-monitor.js         # Health check endpoint
    alert-manager.js          # Alert dispatch (Telegram)
    session-reporter.js       # Daily report generation
    graceful-shutdown.js      # Shutdown handler
    lib/
      deriv-api.js            # Deriv API utilities
      stats.js                # Math utilities
  data/
    boom_crash_ticks.db       # Tick storage
    live_trades.db            # Trade database
  logs/
    combined.log              # All logs
    error.log                 # Error logs
    archive/                  # Compressed old logs
  reports/
    daily/                    # Daily reports
  stop.txt                    # Manual stop signal (created by user)
```

### 3.10 Deployment Checklist

| # | Item | Details |
|---|---|---|
| 1 | Node.js 18+ installed | `node --version` |
| 2 | npm dependencies installed | `npm install @deriv/deriv-api ws better-sqlite3 winston` |
| 3 | pm2 installed globally | `npm install -g pm2` |
| 4 | config.js configured | app_id, API token, account type, symbol, params |
| 5 | Demo account verified | Bot runs on demo, no real money |
| 6 | Data directory exists | `mkdir -p backend/data backend/logs backend/reports` |
| 7 | Firewall configured | Outbound: `wss://ws.derivws.com:443`. Inbound: none needed |
| 8 | Timezone set to UTC | `Set-TimeZone "UTC"` on Windows or `timedatectl set-timezone UTC` on Linux |
| 9 | System time synchronized | NTP enabled |
| 10 | Auto-start configured | `pm2 startup` + `pm2 save` |
| 11 | Log rotation configured | pm2 log-rotate or OS-level |
| 12 | Test run 24 hours | Bot runs unattended on demo for 24 hours before real money |

### 3.11 Running on Real Money

**Transition procedure from demo to real:**

```
1. Week 1: Demo account, no buys (proposal-only verification)
   → Verify: scoring, decision-making, logging all work correctly

2. Week 2-3: Demo account, live buys
   → Verify: trade execution, contract monitoring, risk limits all work

3. Week 4 onwards: Real account, minimum stake ($0.35)
   → Start with 50 trades at $0.35
   → If WR >= 54% after 50 trades → increase to $0.50
   → If WR < 50% after 50 trades → stop and review

4. Gradual scaling:
   → Every 100 trades at current stake, recalculate WR
   → If WR >= target → increase stake by 50% (max $2.00)
   → If WR < breakeven → reduce stake or stop
```

**Real account safeguards:**
- Daily loss limit: 10% of account (HARD STOP)
- Max drawdown from peak: 15% (HARD STOP)
- After 3 consecutive losses: reduce stake by 50%
- After 5 consecutive losses: STOP for the day
- Maximum 100 trades per day

## 4. Deliverables

| Deliverable | Description |
|---|---|
| `backend/ecosystem.config.js` | pm2 process configuration |
| `backend/src/health-monitor.js` | Health check HTTP server |
| `backend/src/alert-manager.js` | Alert dispatch (Telegram) |
| `backend/src/session-reporter.js` | Daily report generation |
| `backend/src/graceful-shutdown.js` | Shutdown handler |
| `backend/logging-config.js` | Winston logger configuration |
| Production deployment docs | README with deployment steps |

## 5. Acceptance Criteria

| # | Criterion | How to verify |
|---|---|---|
| 1 | Bot runs under pm2 | `pm2 list` shows bot with status `online` |
| 2 | Bot auto-restarts on crash | Kill bot process (`pm2 kill`), pm2 restarts it |
| 3 | Logs written with rotation | `logs/combined.log` exists with entries, old logs in `archive/` |
| 4 | Health check accessible | `curl http://localhost:3456/health` returns valid JSON |
| 5 | Graceful shutdown works | `pm2 stop boom-crash-bot` → bot waits for contract, exits cleanly |
| 6 | Session recovery works | Kill bot mid-session, restart → "Session recovered" logged with correct counts |
| 7 | Daily report generated | After midnight, `reports/YYYY-MM-DD-summary.json` exists |
| 8 | stop.txt works | Create `stop.txt` → bot stops gracefully within 10 seconds |
| 9 | Alert fires | Simulate consecutive loss limit → Telegram message received |

## 6. Planner Notes

**For the planning agent:**

1. **Demo-first production path** — The planner MUST structure the deployment so that the same bot code runs on both demo and real accounts, with the only difference being the API token and account type in config. This minimizes configuration errors when switching to real money.

2. **No trading on restart** — On restart (after crash), the bot must NOT immediately trade. It must:
   - Wait for buffer to warm up (30+ ticks)
   - Verify connection state is AUTHORIZED
   - Check no active contracts exist on the account (via `proposal_open_contract` API)
   - Then allow normal trading

3. **Time synchronization** — The Deriv API uses epoch timestamps. If the system clock drifts, tick recording timestamps may be wrong. The planner should optionally sync with the Deriv server time on connect.

4. **Windows vs Linux** — The bot runs on Windows during development and may be deployed on Linux VPS. The planner should:
   - Use `path.join()` for file paths (not hardcoded `/` or `\`)
   - Test pm2 config on both platforms
   - Note that `pm2 startup` behavior differs on Windows (use `pm2-installer` npm package or Windows Task Scheduler)

5. **SEPARATION OF CONCERNS** — The production code should be minimal additions to the Phase 6 bot core. Do NOT modify the core bot logic. Production features (logging, health, alerts) should be added as wrappers or extensions, not inline modifications. The core bot must remain testable independently.

6. **Rolling upgrades** — The planner should consider a simple upgrade process:
   - `git pull` to get new code
   - `npm install` for new dependencies
   - `pm2 restart boom-crash-bot` to reload
   - Verify with `pm2 logs` that it started correctly

7. **Minimalism** — A VPS with 1GB RAM and 1 CPU is sufficient for this bot. The bot uses < 100MB RAM and < 5% CPU. Do not over-engineer the deployment infrastructure.
