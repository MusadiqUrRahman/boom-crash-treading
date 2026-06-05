# Boom 1000 & Crash 1000 — Index Mechanics

## What They Are

Boom 1000 and Crash 1000 are Deriv-exclusive synthetic indices. Unlike volatility indices (R_25, R_75, R_100) which are pure random walks with no directional bias, Boom/Crash indices have a **signature move**: a sudden large price spike at a statistically predictable average frequency.

| Property | Boom 1000 | Crash 1000 |
|---|---|---|
| Symbol | BOOM1000 | CRASH1000 |
| Spike direction | Upward | Downward |
| Average spike frequency | Every ~1000 ticks | Every ~1000 ticks |
| Spike magnitude | Large upward candle | Large downward candle |
| Between-spike behavior | Slow drift downward | Slow drift upward |
| Annualized volatility | ~30-40% | ~30-40% |
| Tick frequency | Every 2 seconds (standard) | Every 2 seconds (standard) |
| Trading hours | 24/7/365 | 24/7/365 |

## How They Are Generated

Deriv uses a cryptographically secure pseudo-random number generator (CSPRNG) audited by third parties (Gaming Labs). The algorithm:

1. Generates a base price stream (similar to volatility indices)
2. Superimposes periodic spike events triggered by a random counter
3. The counter resets after each spike and counts ticks until the next spike

## The "Expected Spike" Concept

The "1000" in Boom/Crash 1000 refers to the **average** number of ticks between spikes. This is an **average**, not a guarantee:

```
Tick 0:   Last spike occurred
Tick 500: No spike yet (50% probability of having occurred)
Tick 1000: ~63% probability spike has occurred
Tick 2000: ~86% probability spike has occurred
Tick 3000: ~95% probability spike has occurred
```

The distribution is approximately **exponential** — the probability of a spike in any given tick is roughly constant (~0.1%). This means:
- Spike timing is **memoryless** (like a Poisson process)
- Waiting longer does NOT make a spike "more due" in the next tick
- BUT the cumulative probability increases over many ticks

## Critical Insight

Between spikes:
- **Boom 1000** drifts slowly **downward** → PUT contracts have a structural advantage
- **Crash 1000** drifts slowly **upward** → CALL contracts have a structural advantage

This drift is the **only exploitable non-random structure** across all Deriv synthetic indices. It is small but real.

## Important: Binary Options vs CFD

This research targets **Deriv Binary Options (Rise/Fall)**, not CFD trading. The difference is critical:

- **Binary Options**: Fixed risk (loss capped at stake), fixed payout (e.g., 85% profit), NO spread cost
- **CFD**: Variable risk (leverage amplifies), variable P&L, spread cost (~1,430 points round-trip)

Recent independent research (Berko, 15M ticks, 2026) found that **CFD trading on Boom/Crash 1000 is not viable** because the round-trip spread cost of ~1,430 points exceeds any drift capture. However, binary options have no spread cost — the only "cost" is the payout ratio.

**The same drift edge that fails for CFD may succeed for binary options** — but requires 54%+ win rate to break even at 85% payout.

## Comparison to Volatility Indices

| Feature | R_100 (Volatility) | Boom 1000 | Crash 1000 |
|---|---|---|---|
| Price process | Random walk | Random walk + downward drift + upward spikes | Random walk + upward drift + downward spikes |
| Exploitable structure | None | Between-spike PUT bias | Between-spike CALL bias |
| Suitable for trend-following | No | Yes (against spike direction) | Yes (against spike direction) |
| Suitable for mean reversion | No | Yes (post-spike snapback) | Yes (post-spike snapback) |
| 24/7 behavior | Uniform | Cyclical (spike → drift → spike) | Cyclical (spike → drift → spike) |

## Key Takeaway

Boom/Crash indices are the only Deriv instruments where **direction matters**. The between-spike drift creates a genuine (small) directional bias that can be exploited with proper risk management.
