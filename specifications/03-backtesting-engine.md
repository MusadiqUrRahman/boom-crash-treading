# Specification 03: Backtesting Engine

- **Version:** 1.0
- **Research basis:** `research-boom-crash/05-statistical-edge-analysis.md`, `research-boom-crash/06-risk-analysis.md`, `research-boom-crash/07-entry-exit-strategies.md`, `research-boom-crash/08-post-spike-drift-capture.md`, `research-boom-crash/13-backtesting-methodology.md`, `research-boom-crash/15-risk-management-framework.md`
- **Status:** Draft

## 1. Objective

Build a binary-options-aware backtesting engine that simulates trading on historical tick data using the multi-filter scoring system. The engine must accurately model Rise/Fall binary options (not CFD), support configurable entry strategies, and produce detailed trade logs for performance analysis.

**Key requirement:** The engine simulates binary options, NOT CFD. No spread costs. Win/loss determined by price direction at expiry. Profit determined by payout ratio.

## 2. Input Requirements

### Data

- `data/boom_crash_ticks.db` from Phase 1 — tick data
- `data/analysis-results.json` from Phase 2 — provides context but not required for engine operation

### Dependencies

- **Phase 1 (Data Acquisition)** — must be completed (tick data required)
- **Phase 2 (Statistical Analysis)** — should be completed (provides context for parameter ranges)

## 3. Technical Specification

### 3.1 Architecture

```
BacktestingEngine
  ├── TickDataSource       # Loads ticks from SQLite
  ├── IndicatorEngine      # Calculates RSI, Bollinger Bands, EMA, ROC
  ├── ScoringEngine        # Multi-filter scoring system
  ├── DecisionEngine       # Threshold comparison, risk checks
  ├── TradeSimulator       # Binary options simulation
  ├── TradeLogger          # Records trade history
  └── MetricsCalculator    # Performance metrics
```

### 3.2 Indicator Engine

Calculates technical indicators from the rolling tick buffer. All indicators must support incremental updates (new tick arrives → update without full recalculation) for future Phase 6 live use — BUT for Phase 3 backtesting, full recalculation each tick is acceptable.

**Required indicators:**

| Indicator | Default parameters | Purpose |
|---|---|---|
| RSI (Relative Strength Index) | period: 14 | Mean reversion detection |
| Bollinger Bands | period: 20, stdDev: 2 | Price extremes detection |
| EMA (Exponential Moving Average) | shortPeriod: 5, longPeriod: 20 | Trend direction |
| ROC (Rate of Change) | period: 5 | Short-term momentum |

**Formula references:**

**RSI(14):**
```
avgGain = average of positive deltas over last 14 ticks
avgLoss = average of negative deltas over last 14 ticks (absolute value)
RS = avgGain / avgLoss
RSI = 100 - (100 / (1 + RS))
```

**Bollinger Bands(20, 2):**
```
middle = SMA of last 20 tick prices
std = standard deviation of last 20 tick prices
upper = middle + 2 * std
lower = middle - 2 * std
```

**EMA(period):**
```
multiplier = 2 / (period + 1)
EMA = (price - previousEMA) * multiplier + previousEMA
```

**ROC(5):**
```
ROC = ((price - price[5 ticks ago]) / price[5 ticks ago]) * 100
```

### 3.3 Scoring Engine

The core of the entry strategy. For each tick where the engine considers entering, it calculates a score based on multiple conditions. The score represents the strength of the entry signal.

**For Crash 1000 (downtrend, CALL direction):**

| Condition | Points | Rationale |
|---|---|---|
| RSI < 35 (oversold) | +3 | Strong mean reversion signal in downtrend |
| RSI between 35 and 50 | +1 | Mild oversold — still favorable |
| Price below lower Bollinger Band | +2 | Extreme low — likely to bounce |
| Short EMA > Long EMA | +1 | Short-term uptrend confirmed |
| ROC > 0 | +1 | Positive short-term momentum |
| Last 3 ticks all up | +2 | Strong immediate momentum |
| Spike in last 50 ticks | +1 | Post-spike window (weak signal per research) |

**For Boom 1000 (uptrend, PUT direction):**

| Condition | Points | Rationale |
|---|---|---|
| RSI > 65 (overbought) | +3 | Strong mean reversion signal in uptrend |
| RSI between 50 and 65 | +1 | Mild overbought — still favorable |
| Price above upper Bollinger Band | +2 | Extreme high — likely to drop |
| Short EMA < Long EMA | +1 | Short-term downtrend confirmed |
| ROC < 0 | +1 | Negative short-term momentum |
| Last 3 ticks all down | +2 | Strong immediate momentum |
| Spike in last 50 ticks | +1 | Post-spike window (weak signal per research) |

**Decision rule:**
```
IF score >= scoreThreshold AND score > opposingScore
  → Enter trade in score direction
ELSE
  → Skip
```

Where `opposingScore` is the same calculation for the opposite direction. This prevents entering when both CALL and PUT have similar scores (noisy conditions).

### 3.4 Trade Simulator (Binary Options Model)

This is the most critical component. It must simulate **binary options**, not CFD.

**Simulation logic:**

```
function simulateTrade(entryTickIndex, direction, durationTicks, payoutRate):
  entryPrice = ticks[entryTickIndex].price
  exitTickIndex = entryTickIndex + durationTicks
  exitPrice = ticks[exitTickIndex].price

  if direction === CALL:
    win = exitPrice > entryPrice
  else: // PUT
    win = exitPrice < entryPrice

  if win:
    pnl = stake * payoutRate
  else:
    pnl = -stake

  return { entryTickIndex, exitTickIndex, entryPrice, exitPrice, win, pnl }
```

**Key rules:**
- **Strict inequality:** `exitPrice > entryPrice` for CALL win. Equal prices = loss (unless "Allow Equals" is enabled in account settings).
- **No spread cost:** Binary options have no spread. The only cost is the payout ratio.
- **Payout rate:** Configurable. Default 85%. Range 80-95%.
- **Duration:** Counted in ticks, not seconds or minutes. Contract lasts exactly D ticks.

**Allow Equals mode:**
If the account has "Allow Equals" enabled:
```
if direction === CALL:
  win = exitPrice >= entryPrice  // price equal = win (stake returned)
```

The planner should implement both modes and make them configurable.

### 3.5 State Machine

The backtesting engine uses the same state machine intended for the live bot:

```
COLLECTING → SCORING → SCORE_READY → DECISION → ENTERING → IN_POSITION → RESOLVING → COOLDOWN → COLLECTING
```

| State | Description |
|---|---|
| COLLECTING | Accumulate ticks into rolling buffer until minimum size reached |
| SCORING | Calculate indicators and score on every tick |
| SCORE_READY | Score >= threshold, waiting for DECISION |
| DECISION | Check risk limits, verify no overlapping trades |
| ENTERING | Record entry tick, price, score, direction |
| IN_POSITION | Wait for duration to elapse (D ticks) |
| RESOLVING | Compare exit price to entry price, record result |
| COOLDOWN | Wait for cooldown ticks before next trade |

### 3.6 Configuration Parameters

All parameters should be configurable via a single config object:

```javascript
const config = {
  // Instrument
  symbol: 'CRASH1000',               // Target symbol
  direction: 'CALL',                  // Default trade direction
  
  // Binary options
  payoutRate: 0.85,                   // 85% payout
  stake: 1.0,                          // Stake in USD
  allowEquals: false,                  // Allow Equals mode
  
  // Trade parameters
  durationTicks: 10,                   // Contract duration in ticks
  cooldownTicks: 5,                    // Ticks between trades
  
  // Scoring system
  scoreThreshold: 5,                   // Minimum score to enter
  rsiOversold: 35,                     // RSI oversold threshold
  rsiOverbought: 65,                   // RSI overbought threshold
  bbPeriod: 20,                        // Bollinger Band period
  bbStdDev: 2,                         // Bollinger Band standard deviations
  emaShortPeriod: 5,                   // Short EMA period
  emaLlongPeriod: 20,                  // Long EMA period
  rocPeriod: 5,                        // Rate of Change period
  
  // Technical
  tickBufferSize: 200,                 // Rolling tick buffer size
  minTicksBeforeTrade: 30,             // Minimum ticks before first trade
  
  // Risk
  maxConsecutiveLosses: 5,             // Stop trading after this many losses in a row
  maxDailyTrades: 100,                 // Maximum trades per day
  maxDailyLoss: 10,                     // Maximum loss in USD per day
};
```

### 3.7 Trade Log Schema

Each simulated trade produces a record:

```javascript
{
  tradeId: 'BC-0001',
  entryTick: 5000,                      // Index in tick array
  exitTick: 5010,                       // Index in tick array
  entryTime: 1678886400,                // Epoch timestamp
  exitTime: 1678886410,                 // Epoch timestamp
  entryPrice: 1234.56,
  exitPrice: 1235.78,
  direction: 'CALL',
  durationTicks: 10,
  score: 7,                             // Entry score
  scoreComponents: {                     // Breakdown for analysis
    rsi: 3,
    bb: 2,
    ema: 1,
    roc: 1,
    momentum: 2,
    postSpike: -1
  },
  win: true,
  pnl: 0.85,                            // Stake * payoutRate
  cumulativePnl: 15.20,                 // Running total
  accountBalance: 315.20,               // Running balance
  maxDrawdown: -5.50                    // Running max drawdown from peak
}
```

### 3.8 Performance Metrics

After backtesting, calculate:

| Metric | Formula | Importance |
|---|---|---|
| Win Rate | wins / total_trades | **Primary** — must exceed breakeven |
| Profit Factor | gross_profit / gross_loss | > 1.0 is profitable |
| Net Profit | sum(pnl) | Total return |
| Sharpe Ratio | mean(pnl) / std(pnl) * sqrt(trades_per_day) | Risk-adjusted return |
| Max Drawdown | max(peak - trough) / peak | Worst case loss |
| Max Consecutive Losses | longest loss streak | Psychological risk |
| Average Win | sum(wins) / win_count | Per-trade win |
| Average Loss | sum(losses) / loss_count | Per-trade loss |
| Win/Loss Ratio | avg_win / avg_loss | Quality of wins |
| Total Trades | count | Statistical significance |
| Trades Per Day | total_trades / days | Trading frequency |

### 3.9 Output

```javascript
{
  config: { /* snapshot of config used */ },
  summary: {
    totalTrades: 2500,
    wins: 1350,
    losses: 1150,
    winRate: 0.540,
    profitFactor: 1.15,
    netProfit: 42.50,
    sharpeRatio: 0.8,
    maxDrawdown: -12.50,
    maxConsecutiveLosses: 4,
    avgWin: 0.85,
    avgLoss: -1.00,
    winLossRatio: 0.85,
    tradesPerDay: 45
  },
  trades: [ /* array of trade objects */ ],
  equityCurve: [ /* cumulative PnL after each trade */ ],
  monthlyStats: [ /* aggregated by month */ ]
}
```

### 3.10 File Structure

```
lib/
  indicator-engine.js       # RSI, BB, EMA, ROC calculations
  scoring-engine.js         # Multi-filter scoring
  trade-simulator.js        # Binary options simulation
  backtesting-engine.js     # Main engine orchestrator
  metrics-calculator.js     # Performance metrics
scripts/
  run-backtest.js           # CLI to run a backtest with given config
data/
  backtest-results/         # JSON output directory
    backtest-2025-06-01.json
```

## 4. Deliverables

| Deliverable | Description |
|---|---|
| `lib/indicator-engine.js` | Technical indicator calculations |
| `lib/scoring-engine.js` | Multi-filter scoring system |
| `lib/trade-simulator.js` | Binary options simulation |
| `lib/backtesting-engine.js` | Main engine orchestrating the simulation |
| `lib/metrics-calculator.js` | Performance metrics computation |
| `scripts/run-backtest.js` | CLI to run and save backtest results |
| Validation: engine produces reasonable output with known config | Run with default config, verify output |

## 5. Acceptance Criteria

| # | Criterion | How to verify |
|---|---|---|
| 1 | Engine simulates binary options, not CFD | Trade PnL = +stake * payout or -stake. No spread cost applied. |
| 2 | Win determined correctly | CALL win when exitPrice > entryPrice. PUT win when exitPrice < entryPrice. |
| 3 | Scoring system functional | Running with scoreThreshold=0 enters many trades. Running with scoreThreshold=10 enters few trades. |
| 4 | All indicators calculated | Indicator engine returns valid RSI, BB, EMA, ROC values for all ticks after warmup period. |
| 5 | Trade log produced | Backtest output contains ordered array of trade objects with all required fields. |
| 6 | Metrics computed | All metrics in section 3.8 are non-null and reasonable. |
| 7 | Replayable | Running same config on same data produces identical results. |
| 8 | Config overrides work | Changing durationTicks or scoreThreshold produces different results. |

## 6. Planner Notes

**For the planning agent:**

1. **Binary options model clarity** — The single biggest mistake would be to simulate CFD costs. The planner MUST ensure the trade simulator uses the binary options payout model. No leverage, no margin, no spread, no swaps.

2. **Incremental indicators** — While full recalculation is fine for backtesting, the planner should design the indicator engine to support incremental updates (add tick, remove oldest). This will be needed for the live bot in Phase 6. Consider using a ring buffer for the tick window.

3. **Performance** — With 100K ticks and ~50 trades/day, a run takes ~2000 ticks of simulated time. Even with full recalculation of indicators on every tick, this should complete in < 5 seconds in Node.js.

4. **Edge cases** — Handle:
   - Insufficient ticks before first trade (buffer not warm)
   - Tick buffer smaller than indicator period (RSI needs 14+1 ticks minimum)
   - Trade at end of data (duration extends beyond available ticks → skip)
   - All ticks are the same price (unlikely but handle gracefully — RSI division by zero)

5. **State machine** — The planner should implement the state machine as a proper state machine with explicit transitions, not just if/else chains. This makes the code easier to verify and maps directly to the live bot's state machine in Phase 6.

6. **Scoring vs direction** — The scoring engine evaluates both CALL and PUT scores simultaneously. If both scores are close (within 2 points of each other), the engine should skip — this is a "noisy" condition where the direction is uncertain. The planner should implement this as a `scoreSpread` parameter (minimum difference between best and opposing scores).
