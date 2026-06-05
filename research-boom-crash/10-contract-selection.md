# Contract Selection for Boom/Crash Trading

## Available Contract Types on Deriv

| Contract | Duration | Payout | Application to Boom/Crash |
|---|---|---|---|
| Rise/Fall | 1 tick - 1 hour | 80-95% | **Primary** — best for drift capture |
| Higher/Lower | 1 tick - 1 hour | 100-200% | Good if barrier calibrated correctly |
| Touch/No Touch | 1 hour - 1 day | 100-300% | Not suitable (too long) |
| End-in/Out | 1 day+ | 100-500% | Not suitable |
| Digits | 1 tick - 10 ticks | 70-96% | Avoid (zero edge) |
| Asian | 1 day+ | 100-500% | Not suitable |
| Vanilla Options | 1 day+ | Variable | Not suitable |
| Multipliers | 1 tick+ | Variable | Too risky for this strategy |

## Recommended Contract: Rise/Fall

| Property | Value |
|---|---|
| Type | Rise/Fall |
| Duration | 5-20 ticks |
| Stake | Fixed (0.5-1% of account) |
| Direction | Drift-aligned (PUT on Boom, CALL on Crash) |

**Why Rise/Fall:**
- Simplest contract type — binary outcome
- Short durations available (5+ ticks)
- Payout is reasonable (80-95%)
- No barrier calibration needed
- Easy to automate

## Higher/Lower (Advanced)

| Property | Value |
|---|---|
| Type | Higher (Crash) or Lower (Boom) |
| Duration | 10-20 ticks |
| Barrier | Current price + offset |
| Target payout | 120-160% |

**When to use:**
- After backtesting shows poor Rise/Fall results
- When you have enough capital to absorb higher variance
- When you can calibrate the barrier distance

**Risk:** Lower win rate (40-50%) but better payout. Higher variance.

## Duration Selection

| Duration | Ticks | Real time (2s tick) | Pros | Cons |
|---|---|---|---|---|
| Short | 5-10 | 10-20s | Lowest spike risk, high frequency | Lowest drift signal |
| Medium | 10-20 | 20-40s | Balanced drift vs. spike risk | Moderate everything |
| Long | 20-50 | 40-100s | Better drift signal | Higher spike risk |
| Extended | 50-100 | 100-200s | Best drift signal | Spike risk too high |

**Recommended:** Start with 10-20 ticks.

## Ineligible Contracts

| Contract | Why not |
|---|---|
| Touch/No Touch | Minimum 1 hour — guaranteed multiple spikes |
| End-in/Out | Minimum 1 day — guaranteed many spikes |
| Digits | Random digit distribution, no drift edge |
| Asian | Long duration, complex |
| Vanilla Options | Long duration, complex |
| Multipliers | Unlimited downside, high risk |

## Payout Comparison

| Contract | Min payout | Max payout | Est. WR needed for +EV |
|---|---|---|---|
| Rise/Fall | 80% | 95% | > 52.6% (at 90%) |
| Higher/Low (near) | 100% | 130% | > 50.0% (at 100%) |
| Higher/Low (far) | 130% | 200% | > 43.5% (at 130%) |

Rise/Fall is the **safest starting point** because it's simple and has no spread cost. However, the WR requirement at 85% payout is 54.05% — which is challenging. Target 90%+ payout contracts to lower the breakeven to 52.63%.

**The breakeven WR decreases as payout increases:**
- 80% payout → 55.56% WR needed
- 85% payout → 54.05% WR needed
- 90% payout → 52.63% WR needed
- 95% payout → 51.28% WR needed

**Strategy viability depends heavily on payout.** A 2% difference in payout can be the difference between profit and loss at marginal WR.
