# Boom / Crash Trading Bot — Specifications

## Overview

This folder contains phase-by-phase technical specifications for building a binary options trading bot targeting Deriv's Boom 1000 and Crash 1000 synthetic indices.

Each specification is designed to be consumed independently by **Plan Mode** — a planning agent that reads a specification and generates a detailed implementation plan. Once the plan is approved, it is converted into code.

## Workflow

```
Research (research-boom-crash/)
    ↓
Specification (this folder)
    ↓  (Plan Mode reads one spec, generates plan)
Implementation Plan
    ↓  (plan approved, converted to code)
Code
```

## Phases

| # | Spec | What it produces | Planner input |
|---|---|---|---|
| 1 | Data Acquisition | SQLite database with raw tick data | Deriv API + tick storage |
| 2 | Statistical Analysis | Statistical report + hypothesis tests | Tick data from Phase 1 |
| 3 | Backtesting Engine | Binary-options simulator with scoring | Parameters + data from Phase 1 |
| 4 | Strategy Optimization | Optimal parameter set | Backtesting engine from Phase 3 |
| 5 | Validation Gate | Go/no-go decision report | Optimized params from Phase 4 |
| 6 | Live Bot Core | Node.js bot: ticks → scoring → execution | Approved params from Phase 5 |
| 7 | Live Bot Production | 24/7 deployment: monitoring, recovery, reporting | Bot core from Phase 6 |

## How to Use

1. Read the spec document for the current phase
2. Feed it to Plan Mode: "Generate an implementation plan based on `specifications/N-name.md`"
3. Review and approve the implementation plan
4. Convert the plan to code
5. Verify against the Acceptance Criteria in the spec
6. Proceed to the next phase

## Key Constraints

- **Binary Options only** — no CFD trading. No spread costs. Only payout ratio costs.
- **Rise/Fall contracts** — simplest binary option type. CALL = price up, PUT = price down.
- **Target instruments** — Boom 1000 (uptrend, spikes down) and Crash 1000 (downtrend, spikes up).
- **Go/no-go gate** — Phase 5 requires WR >= 54% at 85% payout before any live trading.
- **Minimum capital** — $300-$500 recommended for $0.50 stake (0.5-1% risk per trade).

## Technology Stack

- **Language:** Node.js (JavaScript)
- **Exchange API:** Deriv API via `@deriv/deriv-api` npm package (WebSocket)
- **Database:** SQLite via `better-sqlite3` (tick storage) and `sql.js` (analysis)
- **Analysis:** Node.js with math/stats libraries
- **Automation:** `pm2` for process management

## Dependencies Between Phases

```
01 (Data) ──→ 02 (Analysis) ──→ 03 (Backtest Engine)
                                     ↓
                                 04 (Optimization)
                                     ↓
                                 05 (Validation Gate) ──→ GO/NO-GO
                                                             ↓
                                                         06 (Bot Core)
                                                             ↓
                                                         07 (Production)
```

Phase 6 and 7 depend on Phase 5 returning GO. If Phase 5 returns NO-GO, the project stops.
