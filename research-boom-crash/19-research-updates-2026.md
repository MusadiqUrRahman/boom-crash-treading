# Research Updates & Critical Findings (2026)

## Overview

This document consolidates new research, corrections, and critical findings discovered during the pre-implementation research review (June 2026). These findings have been incorporated into the individual research documents (01-18).

## Major Findings

### 1. CFD vs Binary Options Cost Structure (CRITICAL)

**The current research did not properly distinguish between CFD and binary options cost structures.** This is the single most important correction.

| Aspect | CFD Trading (MT5) | Binary Options (Rise/Fall) |
|---|---|---|
| Entry cost | Spread (paid to open) | None |
| Exit cost | Spread (paid to close) | None |
| Round-trip cost | ~1,430 points (median, per Berko) | $0 (baked into payout) |
| Loss scenario | Variable (points × lot size) | Fixed (full stake only) |
| Win scenario | Variable (points × lot size) | Fixed (payout %) |
| Breakeven WR | Depends on spread captured | 54.05% at 85% payout |

**Implication:** The drift edge that fails for CFD trading (Berko, 2026) may still be viable for binary options, because binary options have no spread cost to overcome.

### 2. Berko 15M Tick Study (April 2026)

Oheneba Berko conducted the largest public pre-registered study on Boom/Crash 1000:

**Data:** 15,187,573 ticks (7.6M Boom + 7.5M Crash), 90 days of MT5 data
**Protocol:** Pre-registered with frozen kill thresholds before any analysis
**Source:** https://github.com/Orphy123/deriv-research

#### Key Results:

| Hypothesis | Test | Result |
|---|---|---|
| Spike process is memoryless | KS test vs exponential | Boom p=0.26, Crash p=0.07 — **confirmed Poisson** |
| Post-spike drift > random | 16 Welch's t-tests | **None significant at p<0.05** — indistinguishable from random |
| Hourly drift regimes persist | Lag-1 ACF of residuals | −0.041 (Crash), −0.018 (Boom) — **white noise** |

#### What Was Falsified:
1. Any strategy depending on spike anti-clustering (spike arrivals are Poisson)
2. Any strategy filtering by hourly drift regime persistence (residuals are white noise)
3. Any strategy expecting post-spike windows to outperform random windows (they don't)

#### This Means for Our Project:
- **Post-spike timing cannot be the primary edge** — the data doesn't support it
- **Hourly regime filtering is ineffective** — drift residuals have no persistent structure
- **Statistical accumulation over hundreds of trades** is the only viable path
- **Binary options still untested** — Berko used CFD data with 1,430-point spread costs

### 3. New Deriv Indices Added

Deriv has expanded the Boom/Crash family (since the original research was written):

| New Index | Spikes per (avg) | Notes |
|---|---|---|
| Boom/Crash 150 | Every 150 ticks | Fastest spike frequency |
| Boom/Crash 600 | Every 600 ticks | Mid-range option |
| Boom/Crash 900 | Every 900 ticks | Between 500 and 1000 |

These provide additional options for strategy tuning. The current research focuses on 1000-series.

### 4. Community Strategy Landscape

| Claim | Source | Credibility |
|---|---|---|
| 71% win rate on V10 volatility | Precious Lyna Anusiem (2026) | 24 trades — small sample, selling guide |
| PSDC debunked | Orphy123 (2025) | Independent, replicable |
| Crash/Boom CFD edge killed by costs | Oheneba Berko (2026) | Pre-registered, 15M ticks, highest credibility |
| Trend trading between spikes | PMotive (2026) | Manual strategy, no automation data |
| Various MT5 EAs (Synthia, VigoRL, etc.) | MQL5 market | Commercial products, no independent verification |

**Key takeaway:** The most credible research (Berko) shows no edge for CFD. The most credible positive claims involve manual trend trading or volatility indices (not Boom/Crash).

## Corrections Applied

### Document 02: Mathematical Structure
- Added: CFD vs Binary Options cost structure section
- Added: Revised economics table per instrument type

### Document 03: Spike Frequency Analysis
- Added: Berko (2026) Poisson validation results
- Updated: Recommended analysis to reference Berko findings

### Document 04: Between-Spike Behavior
- Added: Berko (2026) findings on post-spike drift and hourly regimes
- Updated: "What Does NOT Work" section
- Updated: Trade-off table with binary option viability column

### Document 05: Statistical Edge Analysis
- Rewritten: Edge calculations with binary options focus
- Added: Breakeven WR by payout table
- Added: Revised conclusion acknowledging the 54% threshold challenge
- Added: Statistical significance requirements

### Document 08: Post-Spike Drift Capture
- Added: Full Berko (2026) study details
- Added: What was falsified vs what was not falsified
- Updated: Practical implementation section

### Document 09: Why Strategies Fail
- Added: Failure mode #7 — Confusing CFD economics with binary options

## Remaining Gaps

1. **No binary options-specific backtest data available** — Berko used CFD/MT5 data
2. **Community strategy claims are unverifiable** — most are commercial pitches
3. **Deriv may change index parameters** — always a risk with proprietary algorithms
4. **Tick-level binary options execution data** — not publicly available in large quantities

## References

| Source | Type | Link |
|---|---|---|
| Berko (2026) — 15M tick study | Pre-registered research | https://github.com/Orphy123/deriv-research |
| Berko (2026) — Medium writeup | Publication | https://medium.com/@shiekwaku100/... |
| Orphy123 (2025) — PSDC analysis | Independent research | https://github.com/Orphy123/deriv-research |
| Deriv API Documentation | Official docs | https://developers.deriv.com |
| Deriv Synthetic Indices Guide | Official | https://trade.deriv.com/markets/derived-indices/synthetic-indices |
| Crash/Boom 150 Guide | Official | https://traders-academy.deriv.com/trading-guides/crash-boom-150-derived-indices |
| Deriv BVI FSC Disclosure | Regulatory | 71% retail loss rate |
| Boom/Crash Trading Guide (2025) | Community | https://synthetics.info/crash-boom-indices/ |
| Boom/Crash Strategy Guide (2026) | Community | https://pmotive.com/blogs/news/boom-and-crash-trading-strategy-2026 |
