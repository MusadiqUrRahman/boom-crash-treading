# Specification 06: Live Bot Core

- **Version:** 1.0
- **Research basis:** `research-boom-crash/10-contract-selection.md`, `research-boom-crash/11-timing-considerations.md`, `research-boom-crash/12-deployment-architecture.md`, `research-boom-crash/15-risk-management-framework.md`, `research-boom-crash/16-automation-247.md`
- **Status:** Draft

## 1. Objective

Build the core live trading bot that connects to the Deriv API, subscribes to real-time tick data, executes the multi-filter scoring strategy with the optimized parameters from Phase 4/5, and manages risk in real time. This is the executable implementation of everything researched and optimized in Phases 1-5.

**Prerequisite:** Phase 5 validation returned GO (or MARGINAL with conditions met).

## 2. Input Requirements

### Data

- `data/optimization-results/best-params.json` from Phase 4 — optimal parameters
- Deriv API credentials (app_id, API token)
- Demo account credentials for testing

### Dependencies

- **Phase 5 (Validation Gate)** — must return GO. If Phase 5 returned NO-GO, this phase is not executed.
- **Phase 3 (Backtesting Engine)** — the indicator engine, scoring engine, and state machine are reused/adapted from Phase 3.

## 3. Technical Specification

### 3.1 Architecture

```
index.js (entry point)
  └── Bot
       ├── ConnectionManager     # Deriv API WebSocket lifecycle
       ├── TickStream            # Live tick subscription
       ├── IndicatorEngine       # Realtime indicator calculation
       ├── ScoringEngine         # Multi-filter scoring (reuse from Phase 3)
       ├── DecisionEngine        # Entry decisions with risk checks
       ├── TradeExecutor         # Deriv API proposal + buy flow
       ├── ContractMonitor       # Track active contracts
       ├── RiskManager           # Position sizing, limits, stop-loss
       ├── StakeManager          # Stake progression logic
       ├── TradeLogger           # Record trades to SQLite
       ├── SessionTracker        # Track daily/hourly stats
       └── Config                # Parameters + env vars
```

### 3.2 Component Specifications

#### 3.2.1 ConnectionManager

Manages the WebSocket connection to Deriv API.

**Responsibilities:**
- Connect to `wss://ws.derivws.com/websockets/v3?app_id={app_id}`
- Authenticate with API token via `authorize()`
- Auto-reconnect on disconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Heartbeat via `ping()` every 30 seconds
- Track connection state: DISCONNECTED, CONNECTING, CONNECTED, AUTHORIZED, ERROR

**Events emitted:**
- `connected` — WebSocket established
- `authorized` — API token accepted
- `disconnected` — connection lost (auto-reconnect starts)
- `error` — connection error (after max retries, emit fatal)

**Configuration:**
```javascript
{
  endpoint: 'ws.derivws.com',
  appId: 1089,
  apiToken: 'YOUR_API_TOKEN',
  maxReconnectAttempts: 10,
  reconnectBaseDelay: 1000,  // ms
  reconnectMaxDelay: 30000,  // ms
  pingInterval: 30000        // ms
}
```

#### 3.2.2 TickStream

Subscribes to live ticks and maintains the rolling buffer.

**Responsibilities:**
- Call `api.ticks(symbol)` to subscribe
- Buffer the last N ticks (configurable, default 200)
- Emit `tick` event for each new tick
- Store ticks persistently to SQLite (append to the same table from Phase 1)

**Events emitted:**
- `tick` — `{ symbol, epoch, quote }`
- `bufferReady` — buffer has enough ticks for indicator calculation
- `warning` — tick gap > 5 seconds (possible connection issue)

**Configuration:**
```javascript
{
  symbol: 'CRASH1000',
  bufferSize: 200,
  storeTicks: true,
  dbPath: './data/boom_crash_ticks.db'
}
```

#### 3.2.3 IndicatorEngine

Realtime indicator calculation (reused/adapted from Phase 3).

**Critical difference from Phase 3:** In live mode, indicators must be calculated **incrementally** (one new tick at a time), not from scratch. The engine maintains internal state and updates on each tick.

**Required methods:**
```javascript
class IndicatorEngine {
  constructor(config) { /* ... */ }
  
  // Called on every tick. Updates internal state incrementally.
  update(tickPrice) { /* ... */ }
  
  // Current indicator values (read after update())
  get rsi() { /* RSI(14) value */ }
  get bollingerBands() { /* { upper, middle, lower } */ }
  get emaShort() { /* EMA(5) value */ }
  get emaLong() { /* EMA(20) value */ }
  get roc() { /* ROC(5) value */ }
  
  // Full result for scoring engine
  getAll() { /* return { rsi, bb, emaShort, emaLong, roc } */ }
  
  isReady() { /* true after warmup period */ }
}
```

#### 3.2.4 ScoringEngine

Directly reused from Phase 3 with no changes. Implements the multi-filter scoring system.

```javascript
class ScoringEngine {
  constructor(config) { /* ... */ }
  
  score(indicators, tickBuffer) {
    // Returns { callScore, putScore, components: { rsi: 3, bb: 2, ... } }
  }
}
```

#### 3.2.5 DecisionEngine

Combines scoring with risk checks to decide whether to enter a trade.

**Logic:**
```
for each tick:
  1. If IN_TRADE or COOLDOWN → skip
  2. If risk manager says NO → skip
  3. Get scores from ScoringEngine
  4. Determine direction: highest score wins
  5. If bestScore >= scoreThreshold AND scoreSpread >= 2 → proceed
  6. Emit 'enter' signal with { direction, score, price }
```

**Configuration:**
```javascript
{
  scoreThreshold: 6,
  minScoreSpread: 2,  // Minimum difference between best and opposing scores
  requireBufferWarm: true  // Must have at least 30 ticks before any trade
}
```

#### 3.2.6 TradeExecutor

Handles the actual contract proposal and purchase via Deriv API.

**Flow:**
```
1. Receive 'enter' signal from DecisionEngine
2. Call api.proposal() with: { contract_type, currency, amount, duration, duration_unit: 't', symbol, basis: 'stake' }
3. Validate proposal response (check ask_price, payout)
4. Call api.buy() with: { buy: proposal.id, price: proposal.ask_price }
5. Record contract_id, buy_price, payout
6. Emit 'contractPurchased' event
7. If proposal fails (invalid params) or buy fails (insufficient balance) → emit error
```

**Proposal request format (Deriv API):**
```javascript
const { proposal } = await api.proposal({
  contract_type: 'CALL',      // CALL or PUT
  currency: 'USD',
  amount: 0.50,               // stake amount
  duration: 10,               // ticks
  duration_unit: 't',         // 't' = ticks
  symbol: 'CRASH1000',
  basis: 'stake'              // 'stake' = fixed stake amount
});
```

**Buy request format:**
```javascript
const { buy } = await api.buy({
  buy: proposal.id,
  price: proposal.ask_price
});
```

**Response fields to capture:**
- `buy.contract_id` — unique contract identifier
- `buy.buy_price` — actual cost
- `buy.payout` — potential payout amount
- `buy.transaction_id` — transaction ID for reconciliation

#### 3.2.7 ContractMonitor

Monitors active contracts until they resolve.

**Approach 1: Tick-based monitoring (recommended)**

Since the contract duration is in ticks, the monitor simply counts ticks from entry:

```javascript
class ContractMonitor {
  constructor() { this.activeContracts = new Map() }
  
  startContract(contractId, entryTickIndex, durationTicks) {
    this.activeContracts.set(contractId, {
      entryTickIndex,
      expiryTickIndex: entryTickIndex + durationTicks,
      currentTickIndex: 0
    });
  }
  
  onTick(tick) {
    for (const [id, contract] of this.activeContracts) {
      contract.currentTickIndex++;
      if (contract.currentTickIndex >= contract.expiryTickIndex) {
        // Contract expired → check result
        this.resolveContract(id, tick.price);
      }
    }
  }
}
```

**Approach 2: Deriv API `proposal` subscription (alternative)**

Subscribe to the proposal for the active contract and receive automatic updates when it resolves. This is more reliable but requires the `proposal_open_contract` API.

**Recommendation:** Use Approach 1 for simplicity, with Approach 2 as a fallback verification.

#### 3.2.8 RiskManager

Enforces all risk limits.

**Hard limits (cannot be overridden):**
```javascript
{
  maxConsecutiveLosses: 5,     // Stop after 5 losses in a row
  maxDailyLoss: 10,            // Max loss in USD per day
  maxDailyTrades: 100,         // Max trades per day
  maxPositionSize: 2.00,       // Max single trade stake in USD
  maxDailyDrawdown: 0.10       // 10% of starting daily balance
}
```

**Soft limits (configurable via session):**
```javascript
{
  cooldownAfterLoss: true,     // Extra cooldown after a loss
  cooldownTicks: 5,           // Base cooldown
  lossCooldownMultiplier: 2,  // Double cooldown after loss
  reduceStakeAfterLoss: true, // Reduce stake after consecutive losses
}
```

**Methods:**
```javascript
class RiskManager {
  canTrade() { /* check all limits, return { allowed: bool, reason: string } */ }
  recordTrade(result) { /* update internal counters */ }
  getStatus() { /* current limits state */ }
  resetDaily() { /* called at session start or midnight */ }
}
```

#### 3.2.9 StakeManager

Manages stake progression.

**Mode: Fixed (Default)**
```
stake = baseStake  // constant, e.g., $0.50
```

**Mode: Proportional**
```
stake = max($0.35, accountBalance * riskPercent)
riskPercent = 0.005 (0.5% per trade) for first 100 trades
riskPercent = 0.01 (1% per trade) after 100 trades
```

**Mode: Martingale (NOT recommended — included for completeness, default OFF)**
```
After loss: stake *= 1.5
After win: stake = baseStake
```

**Configuration:**
```javascript
{
  mode: 'fixed',
  baseStake: 0.50,
  minStake: 0.35,
  maxStake: 2.00,
  riskPercent: 0.005,  // for proportional mode
  useMartingale: false
}
```

#### 3.2.10 TradeLogger

Records every trade to the live trading database.

**Table: `trades`**

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK AUTO | Unique trade ID |
| contract_id | TEXT | Deriv contract ID (nullable for simulation) |
| symbol | TEXT | Instrument symbol |
| direction | TEXT | CALL or PUT |
| stake | REAL | Stake amount in USD |
| payout_rate | REAL | Payout rate (e.g., 0.85) |
| entry_price | REAL | Price at contract start |
| exit_price | REAL | Price at contract end |
| entry_epoch | INTEGER | Entry timestamp |
| exit_epoch | INTEGER | Exit/expiry timestamp |
| duration_ticks | INTEGER | Contract duration in ticks |
| score | INTEGER | Entry score |
| score_rsi | INTEGER | RSI score component |
| score_bb | INTEGER | Bollinger Band score component |
| score_ema | INTEGER | EMA score component |
| score_roc | INTEGER | ROC score component |
| score_momentum | INTEGER | Momentum score component |
| win | INTEGER | 1 for win, 0 for loss |
| pnl | REAL | Profit/Loss in USD |
| balance_after | REAL | Account balance after this trade |
| created_at | TEXT | When record was created |

**Indexes:**
- `idx_trades_epoch` on `entry_epoch`
- `idx_trades_win` on `win`

#### 3.2.11 SessionTracker

Tracks daily and session-level statistics.

```javascript
class SessionTracker {
  constructor() { /* ... */ }
  
  recordTrade(trade) { /* update daily/hourly stats */ }
  getDailyStats() { /* { trades, wins, losses, pnl, drawdown } */ }
  getSessionStats() { /* { trades, winRate, profitFactor } */ }
  getStatus() { /* human-readable status string */ }
  
  isNewDay() { /* check if epoch crossed midnight */ }
  resetDay() { /* called automatically on new day */ }
}
```

### 3.3 State Machine

```
DISCONNECTED → CONNECTING → AUTHORIZING → AUTHORIZED
                                               ↓
                                          COLLECTING (buffer warmup)
                                               ↓
                                          SCORING (continuous)
                                               ↓
                                          DECISION (on each tick)
                                           /       \
                                      SKIP        ENTERING
                                                      ↓
                                                  IN_POSITION
                                                      ↓
                                                  RESOLVING
                                                      ↓
                                                  COOLDOWN
                                                      ↓
                                                  SCORING (loop)
```

### 3.4 Logging

Standardized log format for all components:

```
[2025-06-01 14:30:00] [INFO] [ConnectionManager] Connected to ws.derivws.com
[2025-06-01 14:30:01] [INFO] [ScoringEngine] Score: CALL=7 PUT=2 (threshold=6)
[2025-06-01 14:30:01] [INFO] [DecisionEngine] ENTER CALL at 1234.56 (score=7, id=BC-0001)
[2025-06-01 14:30:01] [INFO] [TradeExecutor] Proposal received: id=prop_abc, ask=0.50, payout=0.925
[2025-06-01 14:30:01] [INFO] [TradeExecutor] Contract purchased: id=ctr_xyz, price=0.50
[2025-06-01 14:30:11] [INFO] [ContractMonitor] Contract ctr_xyz RESOLVED: WIN (exit=1235.78 > entry=1234.56)
[2025-06-01 14:30:11] [INFO] [RiskManager] PnL: +$0.425, Daily: +$12.50
```

Log levels: `ERROR`, `WARN`, `INFO`, `DEBUG`

### 3.5 Error Handling

| Error | Handling |
|---|---|
| WebSocket disconnect | Auto-reconnect by ConnectionManager |
| API token invalid | Fatal error — bot stops |
| Proposal rejected | Log error, skip trade, continue |
| Buy rejected (balance) | Reduce stake, retry once |
| Contract not resolved (timeout) | Force resolve after 2x duration |
| Tick gap > 10 seconds | Log warning, check connection |
| Consecutive losses > limit | Stop bot, emit alert |

### 3.6 File Structure

```
backend/
  index.js                        # Entry point — starts the bot
  config.js                       # All configuration (params + env vars)
  src/
    bot.js                        # Main Bot orchestrator
    connection-manager.js         # Deriv API WebSocket
    tick-stream.js                # Live tick subscription + buffer
    indicator-engine.js           # Reuse/adapt from Phase 3
    scoring-engine.js             # Reuse from Phase 3
    decision-engine.js            # Entry decisions
    trade-executor.js             # Deriv API proposal + buy
    contract-monitor.js           # Active contract tracking
    risk-manager.js               # Risk limits
    stake-manager.js              # Stake progression
    trade-logger.js               # SQLite trade storage
    session-tracker.js            # Daily/session stats
    lib/
      deriv-api.js                # Deriv API wrapper utilities
      stats.js                    # Math/stat utilities
  data/
    boom_crash_ticks.db           # Tick storage (shared with Phase 1)
    live_trades.db                # Live trade database
```

### 3.7 Startup Sequence

```
1. Load config.js
2. Connect to Deriv API WebSocket
3. Authorize with API token
4. Subscribe to ticks for target symbol
5. Start collecting ticks into buffer
6. Wait for buffer to warm up (30+ ticks)
7. Enter main loop: for each tick → update indicators → score → decide → execute
8. Handle contract lifecycle: entry → monitoring → resolution → cooldown
```

## 4. Deliverables

| Deliverable | Description |
|---|---|
| `backend/src/bot.js` | Main bot orchestrator |
| `backend/src/connection-manager.js` | WebSocket connection management |
| `backend/src/tick-stream.js` | Live tick subscription and buffer |
| `backend/src/indicator-engine.js` | Realtime indicator calculation |
| `backend/src/scoring-engine.js` | Multi-filter scoring (reused) |
| `backend/src/decision-engine.js` | Entry decision logic |
| `backend/src/trade-executor.js` | Deriv API proposal + buy |
| `backend/src/contract-monitor.js` | Active contract tracking |
| `backend/src/risk-manager.js` | Risk limit enforcement |
| `backend/src/stake-manager.js` | Stake progression |
| `backend/src/trade-logger.js` | Trade recording to SQLite |
| `backend/src/session-tracker.js` | Session statistics |
| `backend/config.js` | Configuration |
| `backend/index.js` | Entry point |
| `backend/data/live_trades.db` | Live trade database |

## 5. Acceptance Criteria

| # | Criterion | How to verify |
|---|---|---|
| 1 | Connects to Deriv API | Bot starts, connects, authorizes successfully (logs show AUTHORIZED) |
| 2 | Receives live ticks | `onTick` events logged with real prices from the subscribed symbol |
| 3 | Indicators calculate correctly | Indicator values printed each tick, are reasonable (RSI 0-100, BB upper > middle > lower) |
| 4 | Scoring produces decisions | "SCORE CALL=X PUT=Y" logged each tick with valid scores |
| 5 | Trade proposal works | "Proposal received" logged with real proposal_id (no buy yet for safety) |
| 6 | Risk limits enforced | Test: set maxDailyLoss=0 → bot does not trade (logs "risk limit reached") |
| 7 | Trade logged to database | After a trade resolves, query `trades` table returns the record |
| 8 | Demo mode safe | Bot runs on demo account, does not touch real money |

## 6. Planner Notes

**For the planning agent:**

1. **Demo-first approach** — The planner MUST ensure the bot runs exclusively on demo account during Phase 6. Real money is NEVER used until Phase 7 explicitly enables it.

2. **Manual kill switch** — The bot MUST have a manual stop mechanism. Simplest: create a `stop.txt` file in the backend directory. The bot checks for this file every 10 ticks. If found, it finishes the current trade and stops. Alternative: listen for SIGINT (Ctrl+C).

3. **Proposal without buy** — The planner should implement a "dry-run" mode where the bot gets proposals but does NOT execute the buy. This verifies the entire flow except actual money movement. Run dry-run for at least 100 ticks before enabling buys.

4. **Indicator reuse** — The indicator engine should be adapted from Phase 3, not rewritten. The main change is adding incremental update support. The planner should verify the Phase 3 engine has clean separation of calculation logic.

5. **Connection resilience** — The bot should handle:
   - Deriv API maintenance window (connection closes, reconnect after 5 minutes)
   - Symbol temporarily unavailable (check every 60 seconds)
   - API changes (version mismatch — stop and alert)

6. **Monorepo structure** — The planner should decide whether to put the bot code in the same repository as the research/specifications or create a separate `backend/` directory. Recommendation: put it in `backend/` within the same repo for simplicity.

7. **Performance** — The scoring engine runs on every tick (~200ms between ticks). The entire pipeline (indicator update → scoring → decision → optional API call) must complete in < 50ms to avoid falling behind. Node.js can handle this easily.

8. **Session persistence** — If the bot restarts, it should:
   - Resume the daily session stats from the database
   - Know how many trades were done today
   - Recalculate daily loss from today's trades
   - NOT reset daily limits on restart
