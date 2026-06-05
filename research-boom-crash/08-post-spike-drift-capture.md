# Post-Spike Drift Capture (PSDC) — Reality Check

## The Original PSDC Claim

Some traders claim that immediately after a Boom/Crash spike, there is a predictable drift in the opposite direction that can be captured for profit. This idea became popular in early Deriv trading communities.

## Independent Verification (Orphy123, 2025)

Orphy123 conducted an independent study of PSDC on Boom/Crash 1000 using tick-level data. The findings were published as "Deriv Synthetic Indices Research":

### Test Protocol
- Data: 1 month of Boom 1000 and Crash 1000 tick data
- Method: Check price at 1-minute and 5-minute intervals after each spike
- Hypothesis: Price should move in the opposite direction of the spike

### Results
- **PSDC + 1-minute check**: No statistically significant edge
- **PSDC + 5-minute check**: No statistically significant edge
- **Conclusion**: PSDC as a standalone strategy does not work

### Why PSDC Fails

1. **Sample size**: Individual spikes have high variance. Need hundreds of spike events to detect the signal through the noise.
2. **Spike magnitude varies**: Small spikes don't produce reliable drift
3. **Timing is inconsistent**: The drift doesn't start at a fixed time after the spike
4. **Random walk dominates**: The short-term noise overwhelms the small drift signal

## Definitive Study: Berko 15M Tick Analysis (April 2026)

Oheneba Berko published a pre-registered study analyzing **15,187,573 ticks** (7.6M Boom + 7.5M Crash) — the largest public study on Boom/Crash 1000. Key findings:

### Hypothesis 1: Post-Spike Drift Capture

**Test:** For every detected spike, measure drift over 50, 100, 300, 600 ticks post-spike vs 2,000 random windows. Use Welch's t-test.

**Result across ALL 16 comparisons:** Not a single one reached statistical significance at p < 0.05. Post-spike windows are **indistinguishable from randomly chosen windows**.

```
Boom 1000 at 100 ticks: post-spike mean = −667 pts, random mean = +640 pts (p = 0.36)
Crash 1000 at 100 ticks: post-spike mean vs random: no significant difference
```

**In many configurations, post-spike drift was actually WORSE than random**, suggesting a mild mean-reversion effect at noise levels.

### Hypothesis 2: Hourly Drift Regime Persistence

**Test:** Fit HMM, compute hourly drift residuals, check autocorrelation.

**Kill threshold:** |lag-1 ACF| >= 0.15
**Observed:** Crash = −0.041, Boom = −0.018
**Verdict:** Both inside white-noise confidence band (±0.042). Kill margin was 4× for Crash, 8× for Boom.

### Hypothesis 3: Spike Timing (Memorylessness)

**Test:** KS test against exponential distribution, lag-1 autocorrelation, dispersion index.

**Results:**
- KS test: p = 0.26 (Boom), p = 0.07 (Crash) — **cannot reject Poisson**
- Lag-1 ACF: −0.006 (Boom), +0.001 (Crash) — **essentially zero**
- Dispersion index: 0.895 (Boom), 0.856 (Crash) — slightly under-dispersed, negligible effect

**Verdict:** Spike process is **memoryless** (Poisson). No anti-clustering to exploit.

### The Cost Problem

Even if post-spike drift were real, the **median round-trip spread cost was ~1,430 points**. At 300–600 ticks of holding, drift capture is comparable to or smaller than this cost.

**IMPORTANT:** This cost analysis applies to **CFD trading** (MT5 data). Binary options (Rise/Fall) have **no spread cost**. The binary options equivalent would be the payout ratio (e.g., 85% payout = 15% house edge at 50/50).

### What Was Falsified

1. **Any strategy depending on spike anti-clustering** — spike arrivals are memoryless
2. **Any strategy filtering by hourly drift regime persistence** — residual drift is white noise
3. **Any strategy expecting post-spike windows to outperform random windows** — they don't

### What Was NOT Falsified

1. **Pure statistical drift betting** (many small directional trades) — not tested
2. **Short-duration binary options (5-20 ticks)** — binary options have no spread cost
3. **Combined filters** (drift + technical indicators + risk management) — not tested
4. **Multi-asset or multi-timeframe approaches** — not tested

## What the Research Actually Shows

The issue with PSDC is not that the drift doesn't exist — it's that **the drift is too small to detect at single-point measurements** and may be **indistinguishable from noise at practical trade durations**.

| Check interval | Expected drift | Random noise (σ) | Signal/Noise ratio |
|---|---|---|---|
| 1 min (~30 ticks) | 0.5-3 points | ~5-15 points | ~0.1-0.3 (poor) |
| 5 min (~150 ticks) | 2-15 points | ~10-30 points | ~0.2-0.5 (poor) |
| 30 min (~900 ticks) | 10-90 points | ~25-75 points | ~0.4-1.2 (marginal) |

At short intervals, the signal is buried in noise. At long intervals, spike risk obliterates the sample.

## Revised Understanding

PSDC is **not false**, it's just **too weak to trade with simple methods**.

A successful drift-based strategy needs:
1. **Multiple samples per drift period** (not just 1-2 checkpoints)
2. **Precise entry timing** (not "immediately after spike")
3. **Directional contract** (Rise/Fall, not digit or touch)
4. **Statistical approach** (hundreds of trades, not dozens)
5. **Binary options** (no spread cost, unlike CFD)

## Learning from PSDC Failure

| What went wrong | Corrected approach |
|---|---|
| Measuring at fixed intervals | Measure drift continuously over trade duration |
| Assuming immediate effect | Allow 1-3 ticks for spike to complete |
| Using single-point checks | Use tick-by-tick analysis |
| Expecting high WR | Accept 52-55% WR with good risk management |
| Testing on too little data | Test on months of tick data |
| Not accounting for spread costs | Use binary options (no spread) or account for CFD spread |

## The Real Edge (Revised)

The real approach to Boom/Crash trading is not "capture the post-spike snapback." It's:

**"Place many small directional bets aligned with the statistical drift, manage risk for the inevitable spike, and let the law of large numbers work."**

Berko's study does NOT prove Boom/Crash binary options are unprofitable. It proves that:
- The drift is too small for simple post-spike CFD strategies
- Spike timing cannot be predicted
- Hourly drift regimes don't filter effectively

For binary options, the absence of spread costs means these same findings may still allow a viable strategy — but the WR target of 54%+ is achievable only with effective entry filtering and excellent risk management.

## Practical Implementation

1. Treat each trade as a statistical bet, not a prediction
2. The edge is ~1-3% above 50/50 — NOT some 90% win rate strategy
3. Risk management is more important than entry timing
4. Trade frequency matters — more trades = faster convergence
5. Backtest on months of data, not days
6. Use binary options (Rise/Fall) to avoid spread costs
7. Do NOT rely on post-spike timing as primary edge source
