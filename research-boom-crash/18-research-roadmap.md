# Research Roadmap

## Phase 0: Foundation (COMPLETE — Updated June 2026)

**Status:** ✅ Done (with post-review updates)

| Task | Status | Notes |
|---|---|---|
| Understand Boom/Crash index mechanics | ✅ | 01-index-mechanics.md |
| Analyze mathematical structure | ✅ | 02-mathematical-structure.md — Added CFD vs binary costs |
| Analyze spike frequency | ✅ | 03-spike-frequency-analysis.md — Added Berko Poisson validation |
| Understand between-spike behavior | ✅ | 04-between-spike-behavior.md — Added Berko findings |
| Quantify statistical edge | ✅ | 05-statistical-edge-analysis.md — Revised with binary option focus |
| Risk analysis | ✅ | 06-risk-analysis.md |
| Define entry/exit strategies | ✅ | 07-entry-exit-strategies.md |
| PSDC reality check | ✅ | 08-post-spike-drift-capture.md — Added Berko 15M tick study |
| Why strategies fail | ✅ | 09-why-strategies-fail.md — Added CFD vs binary confusion |
| Contract selection | ✅ | 10-contract-selection.md |
| Capital requirements | ✅ | 11-capital-requirements.md |
| Research updates consolidated | ✅ | 19-research-updates-2026.md |

## Phase 1: Data Acquisition

**Status:** 🔲 Not started

| Task | Est. effort | Priority |
|---|---|---|
| Research data sources (Deriv API, public archives) | 1 day | High |
| Download tick-level data for Boom/Crash 1000 | 2-3 days | High |
| **Crucial: Distinguish CFD tick data from binary options execution data** | 1 day | **Critical** |
| Verify data quality (gaps, outliers) | 1 day | High |
| Store in analyzable format (CSV, SQLite) | 1 day | High |
| Collect live tick data (optional: 2-4 weeks of collection) | 2-4 weeks | Medium |

## Phase 2: Statistical Analysis

**Status:** 🔲 Not started

| Task | Est. effort | Priority |
|---|---|---|
| Confirm spike distribution is Poisson | 1-2 days | High (confirm Berko) |
| Measure drift magnitude and consistency | 2-3 days | High |
| Check for drift periodicity (time-of-day, day-of-week) | 1-2 days | Medium |
| Analyze spike magnitude distribution | 1 day | Medium |
| Measure correlation of consecutive spike intervals | 1 day | Low |
| Check for regime changes (drift strength over time) | 2-3 days | Medium |
| **Backtest binary options specifically (not CFD)** | 3-5 days | **Critical** |

## Phase 3: Strategy Simulation

**Status:** 🔲 Not started

| Task | Est. effort | Priority |
|---|---|---|
| Implement tick-by-tick backtesting engine | 3-5 days | High |
| **Simulate binary options payout model (not CFD)** | 2 days | **Critical** |
| Test Strategy 1: Drift-only (baseline) | 1-2 days | High |
| Test Strategy 2: Post-spike entry | 2-3 days | High |
| Test Strategy 3: Drift confirmation | 2-3 days | Medium |
| Test Strategy 4: Time-gated exit | 1-2 days | Medium |
| Test Strategy 5: Higher/Lower barrier | 3-5 days | Low |
| Test Strategy 6: Multi-stage | 3-5 days | Low |
| **Test multi-filter scoring system (RSI + BB + drift + ROC)** | 3-5 days | **High** |

## Phase 4: Parameter Optimization

**Status:** 🔲 Not started

| Task | Est. effort | Priority |
|---|---|---|
| Optimize trade duration | 1-2 days | High |
| Optimize spike threshold | 1-2 days | High |
| Optimize post-spike wait | 1-2 days | High |
| Optimize cooldown period | 1 day | Medium |
| Optimize stake size (within risk limits) | 1 day | High |
| **Optimize entry filter scoring thresholds** | 2-3 days | **Critical** |

## Phase 5: Validation

**Status:** 🔲 Not started

| Task | Est. effort | Priority |
|---|---|---|
| Walk-forward analysis | 2-3 days | High |
| Out-of-sample testing | 1-2 days | High |
| Statistical significance testing | 1 day | High |
| Monte Carlo simulation (variance estimation) | 2-3 days | Medium |
| Robustness testing (parameter sensitivity) | 2-3 days | Medium |
| **Verify WR meets 54%+ breakeven threshold** | 1 day | **Critical go/no-go gate** |

## Phase 6: Implementation Planning

**Status:** 🔲 Not started

| Task | Est. effort | Priority |
|---|---|---|
| Design BoomCrashStrategy module | 2-3 days | High |
| Plan integration with existing TradeExecutor | 1 day | High |
| Define config schema | 1 day | High |
| Plan testing strategy | 1-2 days | Medium |
| Write implementation plan (phased specs) | 2-3 days | High |

## Phase 7: Build & Deploy

**Status:** 🔲 Not started

| Task | Est. effort | Priority |
|---|---|---|
| Implement BoomCrashStrategy | 3-5 days | High |
| Write unit tests | 2-3 days | High |
| Integration test with TradeExecutor | 1-2 days | High |
| Deploy to demo for paper trading | 1 day | High |
| Paper trading (2-4 weeks) | 2-4 weeks | High |
| Micro-live phase (2-4 weeks) | 2-4 weeks | Medium |
| Reduced-scale live (4-8 weeks) | 4-8 weeks | Medium |
| Full automation | Ongoing | Low |

## Go/No-Go Decision Point

**The single most important decision gate in this project is Phase 5 validation:**

- If backtesting shows **WR >= 54%** on Rise/Fall binary options at 85%+ payout → **GO** (edge exists)
- If backtesting shows **WR < 54%** on Rise/Fall binary options → **NO-GO** (strategy is negative EV)
- If WR is between 53-54% → **CONDITIONAL** (need higher payout or better filter)

**Do not skip this gate.** If the edge doesn't survive binary options backtesting, no amount of risk management will make it profitable.

## Timeline Estimate (Revised)

```
Phase 0: Foundation          Week 1   ✅ (DONE, updated June 2026)
Phase 1: Data Acquisition    Week 2-3
Phase 2: Statistical Analysis Week 3-4
Phase 3: Strategy Simulation Week 4-6
Phase 4: Parameter Optimiz'n Week 6-7
Phase 5: Validation          Week 7-8 ← Go/No-Go Gate
Phase 6: Implementation Plan Week 8-9
Phase 7: Build & Deploy      Week 9-13
                                |
Paper Trading                 Week 9-12
Micro-live                    Week 12-14
Reduced-scale live            Week 14-18
Full automation               Week 18+

Total to full automation: ~4-5 months (optimistic)
```

## Critical Path

```
Data Acquisition → Stats Analysis → Strategy Simulation
                    (binary options model)
                        ↓
                  Parameter Optimization
                        ↓
              ╔══════════════════════════╗
              ║  VALIDATION (Go/No-Go)   ║
              ║  WR >= 54%?              ║
              ╚══════════════════════════╝
                 ↓ GO            ↓ NO-GO
          Implementation Plan   Return to Research
                 ↓
          Build → Demo → Live
```

## Decision Points

| Decision | When | Options |
|---|---|---|
| Which index? | After Phase 1-2 | Boom 1000, Crash 1000, or both |
| Which strategy? | After Phase 3 | Strategy 1-6 or multi-filter hybrid |
| Minimum capital? | After Phase 4 | $300, $500, or $1000 |
| **Go/no-go?** | **After Phase 5** | **Proceed if WR >= 54%, else stop** |
| Build or buy? | After Phase 6 | Build new bot or modify existing |
