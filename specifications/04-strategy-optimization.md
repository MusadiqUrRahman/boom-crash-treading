# Specification 04: Strategy Optimization

- **Version:** 1.0
- **Research basis:** `research-boom-crash/07-entry-exit-strategies.md`, `research-boom-crash/10-contract-selection.md`, `research-boom-crash/14-parameter-optimization.md`
- **Status:** Draft

## 1. Objective

Run systematic grid search optimization over the multi-filter scoring system parameters to find the configuration that maximizes win rate, profit factor, and risk-adjusted returns. The optimization uses the backtesting engine from Phase 3 to evaluate each parameter combination.

**Goal:** Find a parameter set that achieves WR >= 54% for Crash 1000 CALL trades at 10-tick duration and 85% payout.

## 2. Input Requirements

### Data

- `data/boom_crash_ticks.db` from Phase 1 — tick data
- Backtesting engine from Phase 3

### Dependencies

- **Phase 1 (Data Acquisition)** — tick data required
- **Phase 3 (Backtesting Engine)** — the optimizer calls the backtesting engine for each parameter combination

## 3. Technical Specification

### 3.1 Optimization Architecture

```
Optimizer
  ├── ParameterGrid        # Defines parameter ranges and generates combinations
  ├── BacktestRunner       # Calls Phase 3 engine for each combination
  ├── ResultsCollector     # Aggregates results across combinations
  ├── MetricsRanker        # Ranks combinations by primary/secondary metrics
  └── BestParamsSelector   # Selects optimal parameter set
```

### 3.2 Parameter Search Space

| Parameter | Type | Min | Max | Step | Combinations |
|---|---|---|---|---|---|
| `durationTicks` | integer | 5 | 50 | 5 | 10 |
| `scoreThreshold` | integer | 3 | 9 | 1 | 7 |
| `rsiOversold` | integer | 25 | 45 | 5 | 5 |
| `rsiOverbought` | integer | 55 | 75 | 5 | 5 |
| `bbPeriod` | integer | 10 | 50 | 10 | 5 |
| `bbStdDev` | float | 1.5 | 3.0 | 0.5 | 4 |
| `emaShortPeriod` | integer | 3 | 10 | 2 | 4 |
| `emaLongPeriod` | integer | 15 | 30 | 5 | 4 |
| `rocPeriod` | integer | 3 | 15 | 3 | 5 |
| `cooldownTicks` | integer | 3 | 15 | 3 | 5 |

**Full grid:** 10 × 7 × 5 × 5 × 5 × 4 × 4 × 4 × 5 × 5 = **3,500,000 combinations** (too many)

**Reduction strategy:** Use staged optimization to reduce the search space:

### 3.3 Staged Optimization Strategy

#### Stage 1: Duration Optimization (Fix scoreThreshold=5, default indicators)

Search only `durationTicks` from [5, 10, 15, 20, 25, 30, 40, 50].

**Purpose:** Find the contract duration that maximizes raw win rate before fine-tuning indicators.

**Expected:** Best WR in 10-20 tick range.

**Output:** Optimal `durationTicks`.

#### Stage 2: Scoring Threshold Optimization (Fix best duration from Stage 1)

Search `scoreThreshold` from [3, 4, 5, 6, 7, 8, 9].

**Purpose:** Find the entry strictness that maximizes WR without reducing trade count too much.

**Expected:** WR increases with threshold but trade count decreases. Find the Pareto-optimal balance.

**Output:** Optimal `scoreThreshold`.

#### Stage 3: Indicator Parameter Optimization (Fix best duration + threshold)

Grid search over indicator parameters:

- `rsiOversold`: [25, 30, 35, 40, 45]
- `rsiOverbought`: [55, 60, 65, 70, 75]
- `bbPeriod`: [10, 20, 30, 40, 50]
- `bbStdDev`: [1.5, 2.0, 2.5, 3.0]
- `emaShortPeriod`: [3, 5, 7, 10]
- `emaLongPeriod`: [15, 20, 25, 30]
- `rocPeriod`: [3, 5, 10, 15]

**Combinations:** 5 × 5 × 5 × 4 × 4 × 4 × 4 = **32,000 combinations** (feasible within a few hours).

**Output:** Best indicator parameter set.

#### Stage 4: Cooldown Optimization (Fix all above)

Search `cooldownTicks` from [3, 5, 7, 10, 15].

**Purpose:** Balance trade frequency vs. avoiding consecutive losses.

**Output:** Optimal `cooldownTicks`.

#### Stage 5: Fine-Tuning (Optional)

Narrow the ranges around the best parameters found in Stages 1-4 and run a finer-grained search.

### 3.4 Data Splitting

To avoid overfitting, split the tick data:

| Split | % of data | Purpose |
|---|---|---|
| Training | 60% | Parameter optimization (Stages 1-4) |
| Validation | 20% | Select best parameters, prevent overfitting |
| Test | 20% | Hold-out for Phase 5 validation (untouched until then) |

**Splitting method:** Chronological split (earliest 60% for training, middle 20% for validation, latest 20% for test). Do NOT random-shuffle — time series data must preserve order.

### 3.5 Scoring / Ranking

Each parameter combination is ranked by a composite score:

```
compositeScore = (winRate * 0.40)
               + (profitFactor * 0.25)
               + (sharpeRatio * 0.15)
               + (tradeCountNormalized * 0.10)
               + (-maxDrawdownNormalized * 0.10)
```

Where:
- `tradeCountNormalized` = tradeCount / maxTradeCount across all runs
- `maxDrawdownNormalized` = maxDrawdown / maxDrawdownMax across all runs

**Primary sort:** compositeScore descending.
**Filter:** Only include combinations where `winRate >= 0.50` (below 50% is noise).

### 3.6 Optimization Output

```
data/
  optimization-results/
    stage-1-duration.json
    stage-2-threshold.json
    stage-3-indicators.json
    stage-4-cooldown.json
    best-params.json
```

**`best-params.json` structure:**

```json
{
  "symbol": "CRASH1000",
  "direction": "CALL",
  "dataSplit": {
    "training": { "from": 0, "to": 90000, "count": 90000 },
    "validation": { "from": 90001, "to": 120000, "count": 30000 },
    "test": { "from": 120001, "to": 150000, "count": 30000 }
  },
  "parameters": {
    "durationTicks": 10,
    "scoreThreshold": 6,
    "rsiOversold": 35,
    "rsiOverbought": 65,
    "bbPeriod": 20,
    "bbStdDev": 2.0,
    "emaShortPeriod": 5,
    "emaLongPeriod": 20,
    "rocPeriod": 5,
    "cooldownTicks": 5
  },
  "trainingPerformance": {
    "winRate": 0.545,
    "profitFactor": 1.20,
    "sharpeRatio": 0.85,
    "maxDrawdown": -8.5,
    "totalTrades": 1200
  },
  "validationPerformance": {
    "winRate": 0.542,
    "profitFactor": 1.18,
    "sharpeRatio": 0.82,
    "maxDrawdown": -9.2,
    "totalTrades": 400,
    "overfitCheck": "low"  // difference between training and validation WR
  },
  "stageResults": [
    {
      "stage": 1,
      "parameter": "durationTicks",
      "bestValue": 10,
      "top5": [10, 15, 20, 5, 25]
    },
    // ... more stages
  ]
}
```

### 3.7 Overfitting Detection

The optimizer must flag potential overfitting:

| Check | How | Action |
|---|---|---|
| Training vs Validation WR | WR(train) - WR(valid) > 3% | Flag: potential overfit |
| Top 10 params variance | Standard deviation of WR across top 10 > 2% | Flag: unstable optimum |
| Parameter sensitivity | Small change in parameter causes large WR drop | Flag: sharp peak |
| Validation on Crash vs Boom | Best Crash params tested on Boom | Flag: instrument-specific vs general |

### 3.8 Performance Optimization

Since 32,000 backtests at ~2 seconds each = ~18 hours:

**Options to reduce time:**
1. **Parallel execution** — Run multiple backtests concurrently using Node.js worker threads or child processes (reduce to ~1 hour on 16-core machine)
2. **Early pruning** — Stop evaluating a parameter set if after 25% of data the WR < 48% (unlikely to recover)
3. **Reduce tick data** — Use 50K training ticks instead of 100K (may reduce accuracy but faster)

**Recommendation:** Implement parallel execution with 4-8 workers. This brings 32,000 runs to 2-4 hours.

## 4. Deliverables

| Deliverable | Description |
|---|---|
| `scripts/run-optimization.js` | Full optimization script (all stages) |
| `scripts/run-stage.js` | Single stage optimization runner |
| `lib/optimizer.js` | Optimization engine |
| `lib/parameter-grid.js` | Parameter space definition and combination generator |
| `data/optimization-results/` | Stage-by-stage results |
| `data/optimization-results/best-params.json` | Selected optimal parameter set |
| `optimization-summary.txt` | Human-readable optimization report |

## 5. Acceptance Criteria

| # | Criterion | How to verify |
|---|---|---|
| 1 | Staged optimization runs end-to-end | `run-optimization.js` completes without error |
| 2 | Best parameters identified | `best-params.json` has concrete values for all parameters |
| 3 | WR on validation set >= 50% | validationPerformance.winRate >= 0.50 |
| 4 | Overfitting checked | `overfitCheck` value present and reasonable |
| 5 | Results stored per stage | JSON files exist for each stage with rank-ordered results |
| 6 | Optimization re-runnable | Same config on same data produces same best params |

## 6. Planner Notes

**For the planning agent:**

1. **Parallel execution** — This is the most computationally intensive phase. The planner MUST implement parallel backtest execution. Use Node.js worker_threads or child_process. Each worker runs the backtesting engine with different parameters. The parent process distributes work and collects results.

2. **Progress reporting** — With 32,000 combinations and hours of runtime, the optimizer MUST show progress: "Stage 3: 4,500 / 32,000 combinations (14%), best WR so far: 54.2%". Save intermediate results every 100 combinations so partial results are not lost on crash.

3. **Checkpoint/resume** — The optimizer should save progress after each stage (or every N combinations) and support resuming from the last checkpoint. This prevents losing hours of computation if the process crashes.

4. **Two-phase optimization** — The planner should optimize separately for Crash 1000 CALL and Boom 1000 PUT, since they may have different optimal parameters (symmetric indices should have symmetric parameters, but it's worth verifying).

5. **Parameter interaction** — Some parameters interact strongly (e.g., RSI thresholds and Bollinger Band period). The staged approach may miss interaction effects. The planner should note this limitation and consider a final small random search (e.g., 500 random combinations across all parameters) after Stage 4 to catch interactions.

6. **Stake and payout** — The optimizer runs with a fixed stake of $1.00 and payout of 85%. Changing these does not change WR (which is the primary metric). PnL-based metrics will scale linearly with stake.

7. **Minimum trade count** — Parameter sets that produce fewer than 50 trades total should be discarded as statistically unreliable, regardless of WR.
