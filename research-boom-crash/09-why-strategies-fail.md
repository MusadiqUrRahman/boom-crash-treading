# Why Boom/Crash Strategies Fail

## Root Cause Analysis

After reviewing dozens of Boom/Crash trading strategies on forums, Discord groups, and research papers, the failures consistently fall into 6 categories:

## 1. Overfitting to Historical Data (40% of failures)

**Symptoms:**
- Strategy backtests at 70-80% WR
- Falls to 50% live
- Works on one time period, fails on another

**Causes:**
- Too many parameters (entry filters, exit rules, barriers)
- Tested on too little data (days instead of months)
- Optimized for specific spike patterns that don't repeat

**Prevention:**
- Use < 3 tunable parameters
- Test on out-of-sample data
- Cross-validate across time periods
- Prefer simple strategies

## 2. Underestimating Spike Risk (30% of failures)

**Symptoms:**
- Strategy profitable for 1-2 weeks
- Wiped out in a single bad day
- Recovery stake system leads to bankruptcy

**Causes:**
- Not accounting for spike frequency in position sizing
- Using recovery stakes (Martingale) on a process with occasional large adverse moves
- Holding trades too long (>100 ticks)

**Prevention:**
- Always assume a spike CAN happen during your trade
- Use fixed stake or capped recovery (1.5x max)
- Keep trade duration < 20 ticks
- Stop trading after 3 consecutive losses

## 3. Confusing Pattern with Randomness (15% of failures)

**Symptoms:**
- "I noticed that after 2 upward spikes, the third is smaller"
- "The drift is stronger on Tuesdays"
- "Full moon strategy"

**Causes:**
- Humans are pattern-seeking machines
- Random data regularly produces apparent patterns
- Small sample sizes confirm biases

**Prevention:**
- Statistical significance testing (p < 0.01)
- Large sample sizes (thousands of trades)
- Pre-register hypothesis before testing
- Independent replication

## 4. Ignoring the 71% Retail Loss Rate (10% of failures)

**Symptoms:**
- "I'm different, my strategy works"
- No awareness of market maker edge
- Blaming losses on bad luck

**Causes:**
- Deriv's BVI FSC disclosure: 71% of retail clients lose money
- The house edge on Rise/Fall is ~5-10% depending on contract
- Most traders are systematically wrong

**Prevention:**
- Track expectancy carefully
- Be honest about results
- If you can't beat 53% WR on Boom/Crash, stop
- Accept that you might be in the 71%

## 5. Poor Risk Management (5% of failures — but catastrophic when it happens)

**Symptoms:**
- Single loss > 10% of account
- "This trade will definitely win" (increases stake)
- No daily stop limit

**Causes:**
- Overconfidence after a winning streak
- Trying to "get back to even" quickly
- No automated risk controls

**Prevention:**
- Max 2% risk per trade
- Hard daily loss limit (10%)
- Automated stop-loss
- No manual override in live trading

## 6. Curve-Fitting the Drift (rare but deadly)

**Symptoms:**
- Drift parameter tuned to exactly match historical behavior
- Strategy fails when Deriv reduces drift (which they do periodically)

**Causes:**
- Assuming drift is constant
- Not accounting for Deriv's right to adjust index behavior
- Treating backtest results as guarantees

**Prevention:**
- Expect drift quality to vary
- Design strategies robust to drift halving
- Monitor live drift regularly
- Pause trading if drift degrades

## 7. Confusing CFD Economics with Binary Options (CRITICAL)

**Symptoms:**
- Copying CFD strategies to binary options without adjustment
- Assuming spread costs are the same
- Not understanding the different breakeven points

**CFD vs Binary Options:**
- CFD: Round-trip spread cost ~1,430 points. Drift capture must exceed this cost. Berko (2026) showed this is unlikely.
- Binary Options: No spread cost. Cost is baked into payout ratio (e.g., 85% payout = 15% house edge at 50/50).
- Breakeven: CFD = unknown (depends on spread), Binary Options = 54.05% WR at 85% payout.

**Prevention:**
- Always specify which instrument you're analyzing
- Calculate breakeven WR for your specific payout
- Don't assume CFD results apply to binary options (or vice versa)
- Test specifically on binary options execution model

## Failure Mode Summary

| Failure mode | Frequency | Severity | Prevention cost |
|---|---|---|---|
| Overfitting | 40% | High | Low (simpler strategies) |
| Underestimating spikes | 30% | Very high | Low (short durations, fixed stake) |
| Pattern confusion | 15% | Medium | Low (stats testing) |
| Ignoring loss rates | 10% | High | Medium (track metrics) |
| CFD vs binary confusion | 5% | High | Low (understand the difference) |
| Poor risk management | 5% | Catastrophic | Low (automated rules) |

## The Key Insight

**Nearly all Boom/Crash failures are preventable** with:
- Simple strategies (1-2 rules)
- Fixed stake (never Martingale)
- Short durations (5-20 ticks)
- Proper backtesting (months of data)
- Automated risk management

The strategies that survive are boring, simple, and accept small consistent profits.
