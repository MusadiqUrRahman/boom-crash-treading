# Implementation Plan 03: Backtesting Engine

**Spec:** `specifications/03-backtesting-engine.md`
**Research:** `05-statistical-edge-analysis.md`, `06-risk-analysis.md`, `07-entry-exit-strategies.md`, `13-backtesting-methodology.md`, `15-risk-management-framework.md`
**Data source:** `backend/data/boom_crash_ticks.db` from Phase 1
**Context:** Phase 2 analysis confirmed ~98% directional drift. The backtesting engine will test whether the multi-filter scoring system can avoid spike losses and produce consistent profitability.

---

## 1. File Structure

```
backend/
  config/
    backtest-defaults.js        # Default config object
  lib/
    indicator-engine.js         # RSI, BB, EMA, ROC with ring buffer
    scoring-engine.js           # Multi-filter CALL/PUT scoring
    trade-simulator.js          # Binary options simulation
    backtesting-engine.js       # State machine orchestrator
    metrics-calculator.js       # Performance metrics
  scripts/
    run-backtest.js             # CLI entry point
  data/
    backtest-results/           # Output directory (created on first run)
      backtest-YYYY-MM-DD.json
```

---

## 2. Library: `lib/indicator-engine.js`

Class `IndicatorEngine` — maintains a rolling ring buffer of prices and computes indicators on demand. Designed for both full-recalculation backtesting and incremental live use.

### Ring buffer design
```
class IndicatorEngine {
  constructor(maxSize)      // maxSize = 200 (config.tickBufferSize)
  addPrice(price)           // Push new price, evict oldest if at capacity
  get priceCount()          // Current number of prices in buffer
}
```

### Methods

| Method | Warmup needed | Returns |
|---|---|---|
| `rsi(period=14)` | period + 1 | `{ value, isOversold, isOverbought }` |
| `bollingerBands(period=20, stdDev=2)` | period | `{ upper, middle, lower, belowLower, aboveUpper }` |
| `ema(period)` | period | `number` |
| `roc(period=5)` | period + 1 | `number` |
| `price()` | 1 | Latest price |
| `deltas(n)` | n | Array of last n price deltas |

### Formulas

**RSI:**
```
avgGain = mean of positive deltas over last N ticks
avgLoss = mean of absolute negative deltas over last N ticks
RS = avgGain / avgLoss    (if avgLoss === 0 → RSI = 100)
RSI = 100 - 100 / (1 + RS)
```

**Bollinger Bands:**
```
middle = SMA(last N prices)
std = population std of last N prices
upper = middle + stdDev * std
lower = middle - stdDev * std
```

**EMA:**
```
multiplier = 2 / (period + 1)
EMA = (price - prevEMA) * multiplier + prevEMA
First EMA = SMA of first `period` prices
```

**ROC:**
```
ROC = (price - price[N ticks ago]) / price[N ticks ago] * 100
```

### Edge cases
- Buffer not warm (fewer prices than period): return `null`
- All prices identical: RSI returns 50 (neutral), BB returns bands at same level
- Buffer exactly at warmup threshold: compute with available data

---

## 3. Library: `lib/scoring-engine.js`

Function `computeScore(indicators, direction, config)` — evaluates the multi-filter conditions.

### For Crash 1000 (CALL direction)

| Condition | Points | Implementation |
|---|---|---|
| RSI < rsiOversold | +3 | `indicators.rsi.value < config.rsiOversold` |
| RSI < 50 (but not oversold) | +1 | `config.rsiOversold ≤ rsi < 50` |
| Price below lower BB | +2 | `indicators.bb.belowLower` |
| Short EMA > Long EMA | +1 | `indicators.emaShort > indicators.emaLong` |
| ROC > 0 | +1 | `indicators.roc > 0` |
| Last 3 ticks all up | +2 | Check last 3 deltas from buffer |
| Spike in last 50 ticks | -1 | Per Berko finding: post-spike windows NOT beneficial |

### For Boom 1000 (PUT direction)
Symmetric: RSI > overbought, above upper BB, short EMA < long EMA, ROC < 0, last 3 ticks all down.

### Return value
```javascript
{
  call: { total: 7, components: { rsi: 3, bb: 2, ema: 1, roc: 1, momentum: 2, postSpike: -1 } },
  put: { total: 1, components: { rsi: 0, bb: 0, ema: 0, roc: 0, momentum: 0, postSpike: -1 } },
  spread: 6,
  decision: {
    direction: 'CALL',
    enter: true,       // call.total >= scoreThreshold && call.total > put.total && spread >= minScoreSpread
  }
}
```

### Score spread check
`Math.abs(callScore - putScore) < config.minScoreSpread` → skip (noisy condition). Default `minScoreSpread = 2`.

Spike detection: `Math.abs(delta) >= config.spikeThreshold` anywhere in last 50 ticks.

---

## 4. Library: `lib/trade-simulator.js`

Pure function `simulateTrade(entryIndex, entryPrice, direction, durationTicks, payoutRate, stake, allowEquals, prices)`.

### Algorithm
```
exitPrice = prices[entryIndex + durationTicks]

if direction === CALL:
  win = allowEquals ? exitPrice >= entryPrice : exitPrice > entryPrice
else:
  win = allowEquals ? exitPrice <= entryPrice : exitPrice < entryPrice

pnl = win ? stake * payoutRate : -stake
```

### Return
```javascript
{ win: true, pnl: 0.85, exitPrice: 1235.78, exitIndex: entryIndex + durationTicks }
```

### Edge cases
- `entryIndex + durationTicks >= prices.length` → `null` (trade beyond data)
- `allowEquals === true` → `>=` / `<=` comparison
- `stake === 0` → pnl always 0

---

## 5. Library: `lib/backtesting-engine.js`

Class `BacktestingEngine` — orchestrates the full simulation using a state machine.

### Config object (merged with defaults)
See `config/backtest-defaults.js` for full default values.

### State machine

```
COLLECTING → SCORING → SCORE_READY → DECISION → ENTERING → IN_POSITION → RESOLVING → COOLDOWN → COLLECTING
                                           ↓ (skip)         ↓ (risk limit)
                                        SCORING          STOPPED
```

| State | Behavior |
|---|---|
| COLLECTING | Add ticks to buffer until `tickCount >= minTicksBeforeTrade`. Then → SCORING. |
| SCORING | On each tick, compute indicators + score. If score meets threshold → SCORE_READY. Else stay in SCORING. |
| SCORE_READY | One-tick state. Verify risk limits not hit. If OK → DECISION (entry). If risk limits hit → STOPPED. |
| DECISION | Record entry tick/price/score. Set exitTickIndex. → ENTERING. |
| ENTERING | Record entry in state. → IN_POSITION. |
| IN_POSITION | Wait until `currentTickIndex >= exitTickIndex`. → RESOLVING. |
| RESOLVING | Call `simulateTrade()`. Record result. Update running totals. → COOLDOWN. |
| COOLDOWN | Wait `cooldownTicks` ticks. → COLLECTING. |
| STOPPED | Terminal. No more trades. |

### Running state tracking
```javascript
{
  currentTickIndex: 0,
  tickCount: 0,
  accountBalance: startingBalance,
  cumulativePnl: 0,
  peakBalance: startingBalance,
  maxDrawdown: 0,
  consecutiveLosses: 0,
  dailyTrades: 0,
  dailyLoss: 0,
  currentDay: null,
  trades: [],
}
```

### Main run method
```javascript
run() {   // synchronous
  for each tick in loaded tick data:
    advance state machine by one tick
    if state === STOPPED: break
  return this.getResults()
}
```

---

## 6. Library: `lib/metrics-calculator.js`

Function `computeMetrics(trades)` — processes the trade array.

### Metrics

| Metric | Calculation |
|---|---|
| winRate | wins / totalTrades |
| profitFactor | grossProfit / Math.abs(grossLoss) |
| netProfit | sum(pnl) |
| sharpeRatio | mean(pnl) / std(pnl) * sqrt(tradesPerDay) |
| maxDrawdown | max(peak - trough) |
| maxConsecutiveLosses | longest loss streak |
| avgWin | sum(wins) / winCount |
| avgLoss | sum(losses) / lossCount |
| winLossRatio | avgWin / Math.abs(avgLoss) |
| totalTrades | trades.length |
| tradesPerDay | totalTrades / uniqueDays |

### Edge cases
- 0 trades → all zeros/null
- 0 losses → profitFactor = null
- 0 wins → avgWin = null
- std(pnl) === 0 → sharpeRatio = null

---

## 7. Script: `scripts/run-backtest.js`

### Flow
1. Load config (merge CLI overrides with defaults)
2. Print config summary
3. Load ticks from SQLite for config.symbol
4. Verify minimum tick count (>= 1000)
5. Create BacktestingEngine with config and ticks
6. engine.run()
7. Compute metrics via metrics-calculator
8. Build output object: `{ config, summary, trades, equityCurve }`
9. Write output to `data/backtest-results/backtest-{timestamp}.json`
10. Print summary to console

### CLI
```bash
node scripts/run-backtest.js
node scripts/run-backtest.js --durationTicks=20 --scoreThreshold=7 --stake=0.5
```

Simple `--key=value` parsing → `config[key] = parseFloat(value)`.

---

## 8. Config Defaults: `config/backtest-defaults.js`

```javascript
module.exports = {
  symbol: 'CRASH1000',
  direction: 'CALL',
  payoutRate: 0.85,
  stake: 0.50,
  allowEquals: false,
  durationTicks: 10,
  cooldownTicks: 5,
  scoreThreshold: 5,
  minScoreSpread: 2,
  rsiOversold: 35,
  rsiOverbought: 65,
  bbPeriod: 20,
  bbStdDev: 2,
  emaShortPeriod: 5,
  emaLongPeriod: 20,
  rocPeriod: 5,
  tickBufferSize: 200,
  minTicksBeforeTrade: 30,
  maxConsecutiveLosses: 5,
  maxDailyTrades: 100,
  maxDailyLoss: 10,
  spikeThreshold: 2.3,
  dbPath: './data/boom_crash_ticks.db',
  startingBalance: 100,
};
```

---

## 9. Output Format

**`data/backtest-results/backtest-{timestamp}.json`:**
```javascript
{
  config: { /* snapshot of config used */ },
  summary: { /* all metrics */ },
  trades: [ /* ordered array of trade objects */ ],
  equityCurve: [ /* cumulative PnL after each trade */ ],
}
```

**Console output:**
```
Running backtest: CRASH1000 CALL @ 10 ticks
  Config: scoreThreshold=5, payoutRate=85%, stake=$0.50
  Ticks loaded: 45,014
  Simulating... 2,500 trades in 43,014 ticks
  ─────────────────────
  Win Rate:        54.0% (1,350 / 2,500)
  Net Profit:      +$42.50
  Profit Factor:   1.15
  Sharpe Ratio:    0.80
  Max Drawdown:    -$12.50
  Max Consec Loss: 4
  Trades/Day:      45
  Result saved:    data/backtest-results/backtest-2026-06-04.json
```

---

## 10. Implementation Order

1. `config/backtest-defaults.js` — Default config object (5 min)
2. `lib/indicator-engine.js` — Ring buffer + RSI, BB, EMA, ROC (30 min)
3. `lib/scoring-engine.js` — CALL/PUT scoring with spread check (15 min)
4. `lib/trade-simulator.js` — Binary options model (10 min)
5. `lib/metrics-calculator.js` — All 11 metrics (15 min)
6. `lib/backtesting-engine.js` — State machine orchestrator (45 min)
7. `scripts/run-backtest.js` — CLI entry point (15 min)
8. `package.json` — Add `"backtest"` script (2 min)

---

## 11. Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Ring buffer | Fixed-size array, push shift | O(1) add, easy incremental for live Phase 6 |
| Full recalc vs incremental | Full recalc each tick | Simpler for backtesting; ring buffer enables upgrade |
| State machine | Class with `transition()` per tick | Clean separation, maps directly to live bot |
| Score spread | `callScore - putScore` checked | Prevents noise entries per spec §6 |
| Spike scoring | Negative points (-1) for post-spike | Per Berko finding: post-spike windows NOT beneficial |
| Trade log in RAM | Array of trade objects | 100K ticks = ~2500 trades × 1KB ≈ 2.5MB trivial |
| Equal prices as loss | `>` / `<` (strict) by default | Spec default; `allowEquals` to relax |
| Cooldown | Tick-based, not time-based | Consistent with tick-based duration model |

---

## 12. Edge Cases

| Case | Handling |
|---|---|
| Buffer not warm for RSI (period+1) | `rsi()` returns `null`; scoring engine treats null as 0 points |
| Trade duration extends beyond data | `simulateTrade()` returns null; engine skips |
| All prices identical (division by zero in RSI) | RSI returns 50 (neutral) when `avgLoss === 0` |
| 0 trades executed | Metrics return zeros/null; no NaN in output |
| Single day of data (< 24h) | `tradesPerDay` = `totalTrades / max(1, uniqueDays)` |
| maxConsecutiveLosses hit | Engine enters STOPPED state; no more trades |
| maxDailyLoss hit | Engine enters STOPPED immediately |
| Score threshold too high (never enters) | 0 trades, metrics report no activity |
| 0 wins or 0 losses | `avgWin` or `avgLoss` return null; `winLossRatio` returns null |

---

## 13. Acceptance Criteria

| # | Criterion | How to verify |
|---|---|---|
| AC1 | Binary options model | Trade PnL = +stake×payout or -stake. No spread. |
| AC2 | Win correctly determined | CALL win when exitPrice > entryPrice. |
| AC3 | Scoring responds to threshold | Compare scoreThreshold=0 vs scoreThreshold=10. |
| AC4 | Indicators functional | RSI, BB, EMA, ROC are finite after warmup. |
| AC5 | Trade log produced | Output JSON has trades[] with all required fields. |
| AC6 | Metrics computed | All 11 metrics non-null and reasonable. |
| AC7 | Replayable | Same config + same DB → identical output. |
| AC8 | Config overrides work | --durationTicks=20 produces different results from --durationTicks=5. |
