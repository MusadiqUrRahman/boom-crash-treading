# Spike Frequency Analysis

## Average Spike Intervals

| Index | Claimed avg | Measured range (community reports) |
|---|---|---|
| Boom 1000 | Every ~1000 ticks | 800-1200 ticks (wide variance) |
| Crash 1000 | Every ~1000 ticks | 800-1200 ticks (wide variance) |
| Boom 500 | Every ~500 ticks | 400-600 ticks |
| Crash 500 | Every ~500 ticks | 400-600 ticks |
| Boom 300 | Every ~300 ticks | 240-360 ticks |
| Crash 300 | Every ~300 ticks | 240-360 ticks |

## Observed Spike Patterns

### Distribution Shape
The time-between-spikes follows an **exponential distribution** with λ ≈ 1/1000:

```
Percentiles of time-between-spikes:
  5th percentile:   ~51 ticks
 25th percentile:   ~288 ticks
 50th percentile:   ~693 ticks  (median < mean due to skew)
 75th percentile:   ~1386 ticks
 95th percentile:   ~2996 ticks
 99th percentile:   ~4605 ticks
```

### Key Observations

1. **Short intervals are common** — 5% of spikes occur within 51 ticks of the previous one
2. **Long intervals exist** — 1% of inter-spike periods exceed 4600 ticks
3. **Median < Mean** — the median interval is ~693 ticks, but the average is ~1000 due to the long tail

## Spike Magnitude

Spike sizes follow a **heavy-tailed distribution**:

| Magnitude (points) | Frequency | Impact |
|---|---|---|
| 20-50 | Common (~40%) | Small spike, minor P&L impact |
| 50-100 | Frequent (~30%) | Moderate spike |
| 100-200 | Occasional (~20%) | Large spike |
| 200-500 | Rare (~9%) | Very large spike |
| 500+ | Very rare (~1%) | Extreme spike |

## Clustering Behavior

There is **no evidence of spike clustering** in the strict sense — spikes are independent events. However, because the inter-spike interval distribution has a long tail:

- Clusters of short intervals appear randomly (e.g., 3 spikes in 500 ticks)
- Followed by long gaps (e.g., 3000 ticks with no spike)
- This **looks** like clustering but is mathematically consistent with a Poisson process

## Practical Implications for Trading

### Entry Timing
- Trading immediately after a spike gives the longest "safe window" before the next expected spike
- The average safe window is ~1000 ticks (~33 minutes at 2s per tick)
- But 5% of the time, the next spike comes within ~51 ticks (~1.7 minutes)

### Exit Timing
- Exiting before 1000 ticks (~33 min) avoids ~63% of spikes
- Exiting before 500 ticks (~17 min) avoids ~39% of spikes
- Exiting before 2000 ticks (~67 min) still has ~13.5% spike risk

### The "Safe Window" Illusion
Many traders believe there's a "safe window" right after a spike. This is **true for cumulative probability** but **false for per-tick probability**. Each tick is independent.

**Correct framing:**
- After a spike, you have a **lower cumulative probability** that another spike has occurred
- But the **instantaneous probability** of a spike in the next tick is still ~0.1%

## Independent Validation: Poisson Process (Berko, 2026)

The largest public study (15M ticks) confirmed the spike process is Poisson:

| Test | Boom 1000 | Crash 1000 | Verdict |
|---|---|---|---|
| KS test vs exponential | p = 0.26 | p = 0.07 | Cannot reject Poisson |
| Lag-1 autocorrelation | −0.006 | +0.001 | Essentially zero |
| Dispersion index (V/M ratio) | 0.895 | 0.856 | Slightly under-dispersed |
| Hazard profile | Flat ~0.0009/s | Flat ~0.0009/s | Memoryless confirmed |

**Conclusion:** Spike arrivals are memoryless. There is no anti-clustering to exploit. This confirms the theoretical model in 02-mathematical-structure.md.

## Recommended Analysis

To properly analyze spike behavior for your bot:
1. Download tick-level data (via Deriv API `ticks_history`)
2. Identify spikes algorithmically (price change > 3σ from recent mean)
3. Measure inter-spike intervals
4. Fit distribution parameters (λ)
5. Validate against Poisson model
6. Check for drift before/after spikes (note: Berko found no edge)
7. Test entry/exit timing rules on historical data
