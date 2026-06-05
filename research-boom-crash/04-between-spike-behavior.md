# Between-Spike Behavior Analysis

## The Critical Edge

The between-spike period is where any profitable strategy lives. Understanding the drift characteristics is essential.

## Boom 1000 — Between-Spike Behavior

```
Spike (up) → [Drift DOWN] → Spike (up) → [Drift DOWN] → Spike (up)
```

| Property | Observed behavior |
|---|---|
| Drift direction | Downward (μ < 0) |
| Drift consistency | Present ~80-90% of between-spike periods |
| Drift magnitude | ~−0.05 to −0.2 points per tick |
| Drift pattern | Not uniform — sometimes flat for extended periods |
| Noise level | Random walk component dominates short-term movement |

## Crash 1000 — Between-Spike Behavior

```
Spike (down) → [Drift UP] → Spike (down) → [Drift UP] → Spike (down)
```

| Property | Observed behavior |
|---|---|
| Drift direction | Upward (μ > 0) |
| Drift consistency | Present ~80-90% of between-spike periods |
| Drift magnitude | ~+0.05 to +0.2 points per tick |
| Drift pattern | Not uniform — sometimes flat for extended periods |
| Noise level | Random walk component dominates short-term movement |

## Drift Quality Assessment

The drift is **not a guaranteed linear trend**. It's a **statistical tendency**:

```
P(next tick is in drift direction) ≈ 50.5-51.5%
```

This means:
- The drift direction wins ~51% of individual ticks
- ~49% of ticks go against the drift
- Over many ticks, the drift accumulates
- Short-term (1-5 ticks), the random component dominates

## Time Horizons and Drift Confidence

| Duration | Ticks | P(drift direction wins) | Signal quality |
|---|---|---|---|
| Very short | 1-5 | ~51% | Very noisy |
| Short | 5-20 | ~52-54% | Noisy |
| Medium | 20-100 | ~55-60% | Moderate |
| Long | 100-500 | ~65-75% | Good (but spike risk high) |
| Very long | 500+ | ~75-85% | Best signal, but spike risk extreme |

## The Core Trade-off

| Duration | Drift confidence | Spike risk | Binary option viability |
|---|---|---|---|
| Short (5-20 ticks) | Low (~52%) | Very low (~0.5-2%) | Breakeven requires 54% WR |
| Medium (20-100 ticks) | Moderate (~57%) | Low (~2-10%) | Better WR but spike risk grows |
| Long (100-500 ticks) | Good (~70%) | Moderate (~10-40%) | Spike risk too high |
| Very long (500+ ticks) | High (~80%) | High (~40-63%) | Spike risk extreme |

**Optimal zone:** 5-20 ticks for binary options — lowest spike risk, but drift signal is weakest here. The question is whether 52-54% WR can be consistently achieved.

## Drift Variation Factors

### 1. Time Since Last Spike
- **0-100 ticks**: Drift is strongest and most consistent
- **100-500 ticks**: Drift remains present but gradually weakens
- **500+ ticks**: Drift quality degrades (longer gaps may indicate parameter drift)

### 2. Spike Magnitude
- Larger spikes tend to be followed by stronger drift in the opposite direction
- Small spikes may indicate a "soft" period with weaker drift

### 3. Recent Spike Cluster
- After a cluster of spikes (2-3 in short succession), drift may be disrupted
- The index may need time to "recover" its drift behavior

## Independent Research Findings

### Berko (2026) — 15M Tick Study on CFD Data

The most rigorous public study found:

1. **Spike process is Poisson (memoryless)** — Confirmed via KS test (p=0.26 Boom, p=0.07 Crash), lag-1 ACF (~0), and dispersion index (~0.86-0.90). No anti-clustering exists.

2. **Post-spike drift indistinguishable from random** — All 16 comparisons (2 symbols × 2 thresholds × 4 window sizes) failed to reach p < 0.05. Post-spike windows are statistically identical to randomly chosen windows.

3. **Hourly drift regimes are white noise** — Lag-1 ACF of drift residuals was −0.041 (Crash) and −0.018 (Boom), well inside the ±0.042 white-noise band. 72-74% of hourly drift is explained by spike count alone; the remainder has no persistent structure.

**Implications for this project:**
- Do NOT rely on "post-spike timing" as a primary edge — the research doesn't support it
- Do NOT rely on "clean hour" filtering — residual drift is white noise
- The drift IS real at the tick level (51% directional), but is too weak to detect at single measurement points
- Success depends on statistical accumulation over hundreds of trades, not predictive timing

## Drift Exploitation Strategy

The drift should be exploited with **direction-biased contracts**:

| Index | Contract type | Direction | Rationale |
|---|---|---|---|
| Crash 1000 | Rise/Fall (CALL) | Up | Drift is upward between spikes |
| Boom 1000 | Rise/Fall (PUT) | Down | Drift is downward between spikes |

## What Does NOT Work

1. **Trend-following with wide stops** — the drift is too small; spikes hit wide stops
2. **Martingale on drift direction** — a single spike in the wrong direction wipes accumulated gains
3. **Holding through expected spike time** — the spike will eventually come and cause major loss
4. **Scalping individual ticks** — the drift signal is too weak at the tick level
5. **Post-spike timing strategies** — not supported by data (Berko, 2026)
6. **Hourly regime filtering** — residual drift is white noise (Berko, 2026)

## What Might Work

1. **Short-duration direction-biased binary options** (5-20 ticks, Rise/Fall)
2. **Statistical accumulation over hundreds of trades**
3. **Use drift direction, not counter-drift**
4. **Accept ~52-55% win rate and manage risk accordingly**
5. **Multiple entry filters combined** (drift + RSI + Bollinger + rate of change)
