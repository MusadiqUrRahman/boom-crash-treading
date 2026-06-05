# Risk Management Framework

## Core Principles

1. **Survival first, profit second** — you cannot trade without capital
2. **Assume every trade could lose** — plan for it
3. **The edge is small** — don't try to force it with big stakes
4. **Spikes are inevitable** — design for them, not around them

## Tier 1: Per-Trade Risk

### Position Sizing
```
baseStake = accountBalance × riskPerTrade
riskPerTrade = 0.005 to 0.02 (0.5% to 2%)
minStake = $0.35 (Deriv minimum for Rise/Fall)
```

### Example on $500 account:
- At 0.5%: stake = $2.50
- At 1.0%: stake = $5.00
- At 2.0%: stake = $10.00 (aggressive)

### Stake Adjustments
```
normal conditions → use baseStake
after 3 consecutive losses → multiply by 0.5
after 5 consecutive losses → STOP, investigate
after 8 wins out of 10 → multiply by 1.25 (max)
```

### No Martingale
**Never double up after a loss.** The edge is too small for recovery systems.

## Tier 2: Session Risk

### Daily Limits
```
maxDailyLoss = accountBalance × 0.10 (10%)
maxDailyTrades = 200 (after which, cooldown)
minTimeBetweenTrades = 10 ticks (20 seconds)
```

### Implementation
```
if (todayPNL <= -maxDailyLoss) {
    EMERGENCY_STOP(session)  // stop trading for the day
}
if (consecutiveLosses >= CONSECUTIVE_LIMIT) {
    COOLDOWN(5 minutes)        // pause, let emotions (or system) reset
}
```

### Profit Taking
```
if (todayPNL >= dailyTarget × 1.5) {
    reduceStakeBy(50%)         // protect profits
}
if (todayPNL >= dailyTarget × 2.0) {
    STOP_TRADING               // take the win
}
```

## Tier 3: Account Risk

### Drawdown Limits
```
softDrawdownLimit = 0.10 (10%)   // reduce stake by 50%
hardDrawdownLimit = 0.15 (15%)   // EMERGENCY_STOP(hard)
```

### Recovery Protocol
```
After EMERGENCY_STOP(hard):
    1. Pause trading for 24 hours
    2. Review all trades since last profitable day
    3. Check for structural issues (drift degradation, etc.)
    4. Only resume after root cause identified
```

## Tier 4: Systemic Risk

### Spike Risk Management
```
if (spikesInLast500Ticks >= 3) {
    spikeClusterMode = true
    stakeMultiplier = 0.3     // reduce stake by 70%
    tradeCooldown = 20 ticks  // double the cooldown
}
if (spikeDirection == tradeDirection) {
    // You got lucky — don't increase risk
    // Continue normal stake
}
if (spikeDirection != tradeDirection) {
    // You got hit — reduce risk further
    postSpikeCooldown = 50 ticks
    nextStakeMultiplier = 0.5
}
```

### Drift Monitoring
```
rollingWR = last200Trades.winRate
if (rollingWR < expectedWR - 0.03) {
    // Drift may have degraded
    driftAlert = true
    stakeMultiplier = 0.5
}
if (rollingWR < 0.50) {
    // Edge lost entirely
    EMERGENCY_STOP(hard)
}
```

## Tier 5: Catastrophic Risk

### Emergency Stop Matrix

| Condition | Action | Recovery |
|---|---|---|
| Daily loss > 10% | Stop trading for 24h | Auto-reset next day |
| Drawdown > 15% | Stop all trading | Manual review required |
| 5+ consecutive losses | Cooldown 30 min | Auto-reset if WR recovers |
| Spike cluster (5 in 1000 ticks) | Reduce stake 80% | Auto-reset next session |
| Connection lost > 5 min | Emergency stop | Auto-reconnect + cooldown |
| Invalid token | Force stop | Manual fix required |
| Drift degradation | Reduce stake 50% | Auto-revert if WR recovers |

### Stop-Loss Hierarchy
```
console.log("LOSS")    → normal (expected)
         ↓
console.log("WARN")    → stake reduction
         ↓
console.log("ERROR")   → cooldown/pause
         ↓
console.log("EMERGENCY_STOP") → full stop, manual review
```

## Risk Budget Allocation

| Risk type | % of account at risk per day | Max per week |
|---|---|---|
| Normal trading | 2-5% | 10% |
| Spike cluster | 1-2% | 5% |
| Technical failure | < 1% | 2% |
| **Total** | **5-10%** | **15%** |

## Payout-Aware Risk Adjustments

Risk management must account for the payout rate, not just win rate:

```
Required WR for breakeven = 100 / (100 + payoutRate)

at 85% payout: 100 / 185 = 54.05%
at 90% payout: 100 / 190 = 52.63%
at 95% payout: 100 / 195 = 51.28%
```

**If actual WR is below breakeven for the current payout rate → STOP.**
The strategy cannot be saved by risk management if the WR is below breakeven.

## The 1-2-3 Rule (Summary)

1. **1%** — max risk per trade
2. **2%** — max risk per hour (4-5 trades)
3. **3%** — max consecutive losses before cooldown

Follow this rule and the account survives the worst Boom/Crash can throw at it.
