# Risk Analysis & Drawdown Scenarios

## The Primary Risk: The Wrong-Direction Spike

The single biggest risk in Boom/Crash trading is being in a trade when a spike occurs in the opposite direction.

### Example: Trading CALL on Crash 1000
```
Enter CALL at tick 0 (price = 10000)
Drift up for next 200 ticks (price reaches 10020)
→ Then a CRASH spike occurs (price drops to 9900)
→ CALL expires worthless
→ Loss = full stake
```

### The opposite-direction spike scenario
| Scenario | Frequency | P&L impact (per $0.50 stake) |
|---|---|---|
| No spike, drift wins | ~53% | +$0.43 |
| No spike, drift loses | ~47% | -$0.50 |
| Wrong-direction spike, you lose | ~0.1% per tick | -$0.50 |
| Right-direction spike, you win | ~0.1% per tick | +$0.43 |

## Drawdown Scenarios

### Scenario 1: Normal Variance (no abnormal spikes)
- Win rate: 54%
- Stake: $0.50
- Trades: 100/day
- Expected daily P&L: +$2.00
- 95% worst drawdown: -$5.00 to -$8.00
- Max consecutive losses: 8-12

### Scenario 2: Spike Cluster
- 3-4 spikes within 500 ticks
- Multiple drift-direction trades hit by spikes
- Expected loss: $3-6 in rapid succession
- Recovery time: 1-2 days

### Scenario 3: Extended Spike Period
- Spike frequency increases (e.g., 1500 ticks with 4-5 spikes)
- Normal strategy becomes unprofitable
- Need to pause trading until drift returns

### Scenario 4: Structural Change
- Deriv adjusts the Boom/Crash algorithm (known to happen)
- Drift weakens or disappears
- Old strategy stop working entirely

## Maximum Drawdown Estimates

| Account size | Conservative (aggressive risk mgmt) | Moderate | Aggressive |
|---|---|---|---|
| $100 | $10-15 (10-15%) | $20-30 (20-30%) | $40-50 (40-50%) |
| $500 | $50-75 (10-15%) | $100-150 (20-30%) | $200-250 (40-50%) |
| $1000 | $100-150 (10-15%) | $200-300 (20-30%) | $400-500 (40-50%) |

## Risk of Ruin

Risk of ruin (probability of losing 100% of account before reaching profit target):

| Account size | Stake | WR | Trades/day | Risk of ruin (30 days) |
|---|---|---|---|---|
| $100 | $0.50 | 54% | 100 | ~15% |
| $500 | $0.50 | 54% | 100 | ~1% |
| $1000 | $0.50 | 54% | 100 | ~0.1% |
| $500 | $1.00 | 54% | 100 | ~5% |
| $500 | $2.00 | 54% | 100 | ~25% |

**Minimum viable account: $300-500** with $0.50 stake.

## The Breakeven Risk

The most fundamental risk for this project: **the strategy may not achieve the required 54%+ win rate for positive expectancy.**

| Payout | Breakeven WR | Our target | Margin |
|---|---|---|---|
| 80% | 55.56% | 54% | ❌ Below breakeven |
| 85% | 54.05% | 54% | ❌ Very tight |
| 90% | 52.63% | 54% | ✅ Above breakeven |

**Mitigation:** Target contracts with 90%+ payout. If only 85% is available, verify WR >= 54.05% in backtesting before going live.

## Key Risk Metrics

| Metric | Target | Warning | Critical |
|---|---|---|---|
| Daily loss | <5% of account | 5-10% | >10% |
| Consecutive losses | <5 | 5-8 | >8 |
| Drawdown | <15% | 15-25% | >25% |
| Spike loss cluster | <3 | 3-5 | >5 |
| Weekly loss | <10% | 10-20% | >20% |

## Risk Mitigation: The "Spike Protection" Rule

The most important risk rule for Boom/Crash trading:

**Never hold a trade through a potential spike in the opposite direction.**

Implementation:
1. Use **short durations** (5-20 ticks)
2. **Exit immediately** if a spike occurs in the opposite direction
3. **Pause trading** for 50-100 ticks after a spike to let the index stabilize
4. **Reduce stake** if 3+ consecutive losses occur
5. **Stop trading** for the day if drawdown exceeds 10%

## The 1% Rule

**Never risk more than 1% of account on a single trade.**

| Account | Max stake per trade |
|---|---|
| $100 | $1.00 |
| $300 | $3.00 |
| $500 | $5.00 |
| $1000 | $10.00 |

This is non-negotiable.
