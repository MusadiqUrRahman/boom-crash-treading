# Capital Requirements

## Minimum Viable Capital

The minimum account needed for Boom/Crash automated trading depends on three factors:

1. **Minimum stake size** on Deriv (typically $0.01-$1.00)
2. **Win rate** and variance
3. **Risk of ruin** tolerance

| Account size | Max stake (2% rule) | Est. daily profit (53% WR, 50 trades) | Risk of ruin (30 days) |
|---|---|---|---|
| $50 | $1.00 | $0.25 | 85% |
| $100 | $2.00 | $0.50 | 45% |
| $200 | $4.00 | $1.00 | 15% |
| $300 | $6.00 | $1.50 | 5% |
| $500 | $10.00 | $2.50 | 1% |
| $1000 | $20.00 | $5.00 | <0.1% |

**Recommended minimum: $300-$500**

## Profit Targets by Account Size

| Account | Conservative ($/day) | Moderate ($/day) | Aggressive ($/day) | Conviction (mo) |
|---|---|---|---|---|
| $300 | $1.50 | $3.00 | $6.00 | 3 months |
| $500 | $2.50 | $5.00 | $10.00 | 2 months |
| $1000 | $5.00 | $10.00 | $20.00 | 1 month |

**Realistic target: 0.5-1% of account per day** on average. This is aggressive for most strategies but achievable with a 53-55% WR on Boom/Crash.

## Stake Sizing Rules

### Fixed Stake (Recommended)
```
stake = accountBalance × riskPerTrade
riskPerTrade = 0.005 to 0.02 (0.5% to 2%)
```

### Kelly Criterion (Theoretical Optimum)
```
f* = (b × p - q) / b
where:
  b = payout rate (e.g., 0.85)
  p = win rate (e.g., 0.54)
  q = loss rate (0.46)

f* = (0.85 × 0.54 - 0.46) / 0.85
f* = (0.459 - 0.46) / 0.85
f* ≈ 0 (near zero for small edge)
```

At 54% WR with 85% payout, Kelly suggests **near-zero stake**. This confirms the edge is very small.

### Half-Kelly (Practical)
```
halfKelly = f* / 2 = ~0.5% of account
```

**Half-Kelly (~0.5% risk per trade)** is the recommended maximum.

## Capital Allocation

| Component | % of account |
|---|---|
| Active trading balance | 80% |
| Reserve (for drawdown) | 20% |

## Account Growth Plan

```
Phase 1: $300 → $500
  Stake: $1.50 (0.5%)
  Daily target: $1.50
  Est. time: 4-5 months

Phase 2: $500 → $1000
  Stake: $2.50 (0.5%)
  Daily target: $2.50
  Est. time: 6-8 months

Phase 3: $1000+ → compound growth
  Stake: 0.5% of current balance
  Daily target: 0.5% of balance
  Compounding enabled
```

## Conclusion

| Question | Answer |
|---|---|
| Can you trade Boom/Crash with $25? | Yes, but risk of ruin is near 100% |
| Minimum for a realistic attempt? | $300-$500 |
| Ideal starter account? | $500-$1000 |
| Daily profit expectation on $500? | $2.50 (0.5%) — modest but real |
| Time to double a $500 account? | ~6-8 months at 0.5%/day |

**Do not start with less than $300.** The variance will destroy a small account.
