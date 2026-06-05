# Boom 1000 / Crash 1000 Trading Research

Research project for automated Boom 1000 (PUT) and Crash 1000 (CALL) trading on **Deriv Binary Options (Rise/Fall)**.

## Status

**Research complete — all 19 documents updated with latest findings (June 2026).** Ready for specification creation.

## Important Distinction

This project targets **Binary Options (Rise/Fall)** on Boom/Crash 1000, **NOT CFD trading**. The cost structures are fundamentally different:

- Binary options: No spread cost. Cost baked into payout ratio. Breakeven WR ~54% at 85% payout.
- CFD trading: ~1,430 point round-trip spread. Recent research (Berko, 15M ticks, 2026) shows CFD edge killed by costs.

**The same drift that fails for CFD may still succeed for binary options** — because binary options have no spread to overcome. However, the 54% WR threshold remains challenging.

## Documents

| # | Document | Description |
|---|---|---|
| 01 | [Index Mechanics](01-index-mechanics.md) | How Boom/Crash indices work |
| 02 | [Mathematical Structure](02-mathematical-structure.md) | Price model, drift, spike distribution, CFD vs binary costs |
| 03 | [Spike Frequency](03-spike-frequency-analysis.md) | Timing, magnitude, patterns, Poisson validation |
| 04 | [Between-Spike Behavior](04-between-spike-behavior.md) | Drift characteristics, time horizons, Berko findings |
| 05 | [Statistical Edge](05-statistical-edge-analysis.md) | Win rate, expectancy, breakeven analysis, viability threshold |
| 06 | [Risk Analysis](06-risk-analysis.md) | Drawdown, spike risk, risk of ruin |
| 07 | [Entry/Exit Strategies](07-entry-exit-strategies.md) | 6 strategies, recommendations |
| 08 | [PSDC Reality Check](08-post-spike-drift-capture.md) | Why simple post-spike strategies fail, Berko 15M tick study |
| 09 | [Why Strategies Fail](09-why-strategies-fail.md) | Root causes, CFD vs binary confusion |
| 10 | [Contract Selection](10-contract-selection.md) | Rise/Fall, Higher/Lower, durations |
| 11 | [Capital Requirements](11-capital-requirements.md) | Minimum capital, stake sizing |
| 12 | [Architecture](12-deployment-architecture.md) | Reusing existing bot, new components |
| 13 | [Backtesting](13-backtesting-methodology.md) | Simulation, cross-validation, metrics |
| 14 | [Live Validation](14-live-validation.md) | Phased go-live protocol |
| 15 | [Risk Framework](15-risk-management-framework.md) | Multi-tier risk management |
| 16 | [24/7 Automation](16-automation-247.md) | Unattended operation |
| 17 | [Failure Modes](17-failure-modes.md) | Complete failure catalog |
| 18 | [Research Roadmap](18-research-roadmap.md) | Phase plan and timeline |
| 19 | [Research Updates 2026](19-research-updates-2026.md) | New findings, corrections, references |

## Key Findings (Updated June 2026)

1. **DIGITEVEN has no edge** — confirmed 50/50 random on R_100
2. **Boom/Crash drift is real (~51% per tick)** but small — confirmed by multiple studies
3. **CFD trading edge killed by spread costs** (Berko, 2026) — but this study tested CFD, not binary options
4. **Binary options breakeven WR: 54.05% at 85% payout** — pure drift alone is insufficient
5. **Minimum viable capital: $300-$500** on $0.50 stake (0.5-1% risk per trade)
6. **Target win rate: 54-57%** — required for positive expectancy on Rise/Fall
7. **Primary contract: Rise/Fall** (drift-aligned CALL on Crash, PUT on Boom), 5-20 ticks
8. **Spike risk is the #1 threat** — short durations (5-20 ticks) are essential
9. **Post-spike timing has no detectable edge** (Berko, 2026) — statistical accumulation is the only path
10. **71% retail loss rate** — must operate with discipline and data

## Critical Research Sources

| Source | Findings |
|---|---|
| Berko (2026) — 15M ticks | Spike process is Poisson. Post-spike drift = random. CFD edge killed by costs. |
| Orphy123 (2025) | PSDC has no statistically significant edge at 1-min or 5-min checks. |
| Deriv BVI FSC | 71% retail loss rate on synthetic indices. |

## Flow

```
Research → Specifications → Implementation Plan (Plan Mode) → Code → Paper Trade → Micro-Live → Live
```

## References

- Deriv API documentation: https://developers.deriv.com
- Deriv BVI FSC disclosure: 71% retail loss rate
- Berko (2026): https://github.com/Orphy123/deriv-research
- Orphy123 (2025), "Deriv Synthetic Indices Research" — independent PSDC analysis
- Community discussions on Deriv Boom/Crash strategies
