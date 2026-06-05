# Backtesting Methodology

## Why Backtesting Matters

Boom/Crash strategies need robust backtesting because:
- The drift edge is **small** (1-3%) — easily confused with noise
- Spike events are **rare** relative to normal ticks — need large samples
- Strategy parameter choices **dramatically** affect results

## Data Requirements

### Minimum Data
- **Duration:** 3+ months of tick-level data
- **Instruments:** BOOM1000 and/or CRASH1000
- **Granularity:** Tick-by-tick (every 2 seconds)
- **Fields:** timestamp, price, (optional: volume)

### Ideal Data
- **Duration:** 12+ months
- **Instruments:** Both Boom 1000 and Crash 1000
- **Granularity:** Tick-by-tick
- **Quality:** Verified against live API

### Data Sources
1. **Deriv API:** `ticks_history` endpoint (limited history)
2. **Historical data archives:** Third-party providers
3. **Self-collected data:** Run a tick collector for 1-2 months before trading

## Simulation Approach

### Method: Tick-by-Tick Contract Simulation

1. For each tick in historical data:
   - Check current state (waiting, in-trade, cooldown)
   - If entry condition met → open simulated contract
   - Track price forward for `duration` ticks
   - Compare entry price to exit price → win/loss
   - Record result

### Key Simulation Decisions

| Decision | Options | Recommendation |
|---|---|---|
| Tick advancement | Step through every tick | Required for accurate simulation |
| Duration counting | Calendar ticks or trading ticks | Calendar ticks (simpler) |
| Entry price | Open of next tick or current | Current tick price |
| Exit price | Close of final tick | Final tick price |
| Slippage | None, 0.5 point, 1 point | 0.5 point (conservative) |
| Commission | Included in payout | Assume 85% net payout |
| **Instrument model** | CFD vs Binary Options | **Binary Options** (no spread cost) |
| **Win condition** | Price > entry (CALL) or < entry (PUT) | Strict inequality |
| **Loss amount** | Full stake | Fixed loss |
| **Win amount** | Stake × payout % | Fixed profit |

### Critical: Binary Options Simulation Model

The backtesting engine must simulate **binary options**, not CFD:

```
For each trade entry at tick T with duration D ticks:
  entryPrice = price[T]
  exitPrice = price[T + D]
  
  if direction === CALL:
    win = exitPrice > entryPrice
  else: // PUT
    win = exitPrice < entryPrice
  
  if win:
    PnL = stake * payoutRate  // e.g., $0.50 * 0.85 = +$0.425
  else:
    PnL = -stake              // e.g., -$0.50
  
  // If "Allow Equals" is used:
  // if exitPrice === entryPrice → stake is returned (no loss)
```

**DO NOT use CFD spread costs in the simulation** — binary options have no spread. The only cost is the payout ratio.

## Metrics to Track

### Primary
| Metric | Target | Calculation |
|---|---|---|
| Win rate | 53-57% | Wins / Total trades |
| Profit factor | > 1.2 | Gross profit / Gross loss |
| Sharpe ratio | > 1.0 | (Avg return - risk-free) / Std dev |
| Max drawdown | < 20% | Peak-to-trough decline |
| Total return | Positive | Net P&L |

### Secondary
| Metric | Purpose |
|---|---|
| Average win/loss | Understand trade quality |
| Win/loss streak analysis | Detect dependence |
| Time-of-day effects | Check for drift variation |
| Post-spike performance | Validate entry timing |
| Drift consistency over time | Check stationarity |

## Cross-Validation Protocol

### Walk-Forward Analysis
1. Divide data into 12 monthly segments
2. Train on months 1-6, test on months 7-8
3. Train on months 1-8, test on months 9-10
4. Train on months 1-10, test on months 11-12
5. Check consistency across all test periods

### Out-of-Sample Testing
- Reserve 30% of data for final validation
- Do NOT touch until all parameter tuning is done
- Only test the final strategy once

## Statistical Significance Testing

### Binomial Test
For a strategy with N trades and W wins:
```
H0: True WR = 0.5 (no edge)
Test statistic: P(W >= wins | WR=0.5)
Significant if: p < 0.01
```

**Minimum trade counts for significance:**

| Observed WR | N needed (p < 0.01) |
|---|---|
| 52% | 2,700 |
| 53% | 1,200 |
| 54% | 675 |
| 55% | 430 |
| 56% | 300 |
| 57% | 220 |

Even at 55% WR, you need **430 trades** for statistical significance.

## Common Backtesting Pitfalls

### 1. Look-Ahead Bias
Don't use future information to make entry decisions at time T.
- ✅ Use only price data up to tick T
- ❌ Don't use the spike that happens 5 ticks later

### 2. Survivorship Bias
- ✅ Test on multiple time periods
- ❌ Only test on "good" periods

### 3. Overfitting
- ✅ Test < 3 strategy parameters
- ❌ Don't optimize 10 parameters on 1000 trades

### 4. Data Snooping
- ✅ Pre-register hypothesis
- ❌ Don't test 100 strategies and report the best one

## Backtesting Implementation Sketch

```
function simulateStrategy(ticks, params) {
  let state = 'COLLECTING'
  let buffer = []
  let trades = []
  let lastTradeTick = -params.cooldownTicks
  
  for (let i = 0; i < ticks.length; i++) {
    const tick = ticks[i]
    buffer.push(tick.price)
    if (buffer.length > params.bufferSize) buffer.shift()
    
    if (state === 'IN_TRADE') {
      // Check if trade expired
      if (i >= tradeExitTick) {
        const win = (direction === 'CALL') 
          ? tick.price > tradeEntry.price
          : tick.price < tradeEntry.price
        trades.push({ ...tradeEntry, exitPrice: tick.price, win })
        state = 'COOLDOWN'
        cooldownEndTick = i + params.cooldownTicks
      }
      continue
    }
    
    if (state === 'COOLDOWN') {
      if (i >= cooldownEndTick) {
        state = 'COLLECTING'
      }
      continue
    }
    
    // COLLECTING state — calculate scoring
    if (buffer.length < params.minBuffer) continue
    if (i - lastTradeTick < params.cooldownTicks) continue
    
    // Calculate indicators
    const rsi = calculateRSI(buffer, 14)
    const bb = calculateBollingerBands(buffer, 20, 2)
    const emaShort = calculateEMA(buffer, 5)
    const emaLong = calculateEMA(buffer, 20)
    const roc = calculateROC(buffer, 5)
    
    // Multi-filter scoring
    let score = 0
    const direction = params.direction // 'CALL' for Crash, 'PUT' for Boom
    
    if (direction === 'CALL') {
      if (rsi < params.rsiOversold) score += 3
      else if (rsi < 50) score += 1
      if (tick.price < bb.lower) score += 2
      if (emaShort > emaLong) score += 1
      if (roc > 0) score += 1
      if (buffer[buffer.length-1] > buffer[buffer.length-3]) score += 2
    } else {
      if (rsi > params.rsiOverbought) score += 3
      else if (rsi > 50) score += 1
      if (tick.price > bb.upper) score += 2
      if (emaShort < emaLong) score += 1
      if (roc < 0) score += 1
      if (buffer[buffer.length-1] < buffer[buffer.length-3]) score += 2
    }
    
    if (score >= params.scoreThreshold) {
      state = 'IN_TRADE'
      tradeEntry = { tick: i, price: tick.price, score }
      tradeExitTick = i + params.durationTicks
      lastTradeTick = i
    }
  }
  
  return trades
}
```

## Expected Backtest Output

A valid backtest should produce:
1. **Trade log:** Every simulated trade with entry/exit/meta
2. **Equity curve:** Account balance over time
3. **Win rate:** Overall and rolling
4. **Drawdown chart:** Peak-to-trough
5. **Monthly breakdown:** Performance by month
6. **Statistical tests:** p-value, confidence intervals
