# Implementation Plan 04: Strategy Optimization

**Spec:** `specifications/04-strategy-optimization.md`
**Research:** `07-entry-exit-strategies.md`, `10-contract-selection.md`, `14-parameter-optimization.md`
**Data source:** `backend/data/boom_crash_ticks.db` from Phase 1
**Engine:** Backtesting engine from Phase 3

---

## 1. File Structure

```
backend/
  lib/
    parameter-grid.js           # Parameter space + combination generator
    optimizer.js                # Optimization engine (all stages)
  scripts/
    run-stage.js                # Single stage runner
    run-optimization.js         # Full pipeline runner
  data/
    optimization-results/       # Stage-by-stage JSON output
      stage-1-duration.json
      stage-2-threshold.json
      stage-3-indicators.json
      stage-4-cooldown.json
      best-params.json
```

---

## 2. Library: `lib/parameter-grid.js`

### Exports

```javascript
module.exports = {
  getStageDefinition,   // (stageNum) => { params, combinations }
  generateCombinations, // (stageDef) => array of param objects
  splitData,            // (ticks, splits) => { training, validation, test }
  DEFAULT_SPLITS,       // { training: 0.6, validation: 0.2, test: 0.2 }
};
```

### Stage Definitions

**Stage 1 — Duration Optimization** (8 combos)
- `durationTicks`: [5, 10, 15, 20, 25, 30, 40, 50]
- Fix: scoreThreshold=5, all indicators at defaults

**Stage 2 — Score Threshold Optimization** (7 combos)
- `scoreThreshold`: [3, 4, 5, 6, 7, 8, 9]
- Fix: best duration from Stage 1, indicators at defaults

**Stage 3 — Indicator Optimization** (32,000 combos)
- `rsiOversold`: [25, 30, 35, 40, 45]
- `rsiOverbought`: [55, 60, 65, 70, 75]
- `bbPeriod`: [10, 20, 30, 40, 50]
- `bbStdDev`: [1.5, 2.0, 2.5, 3.0]
- `emaShortPeriod`: [3, 5, 7, 10]
- `emaLongPeriod`: [15, 20, 25, 30]
- `rocPeriod`: [3, 5, 10, 15]
- Fix: best duration + threshold from Stages 1-2

**Stage 4 — Cooldown Optimization** (5 combos)
- `cooldownTicks`: [3, 5, 7, 10, 15]
- Fix: all best params from Stages 1-3

**Stage 5 — Random Fine-Tuning** (500 combos, optional)
- Random perturbation around best params from Stages 1-4

### Data Splitting

```javascript
function splitData(ticks, splits = { training: 0.6, validation: 0.2, test: 0.2 }) {
  const n = ticks.length;
  const trainEnd = Math.floor(n * splits.training);
  const validEnd = trainEnd + Math.floor(n * splits.validation);
  return {
    training: ticks.slice(0, trainEnd),
    validation: ticks.slice(trainEnd, validEnd),
    test: ticks.slice(validEnd),
  };
}
```

---

## 3. Library: `lib/optimizer.js`

Class `Optimizer` — orchestrates staged optimization.

### Constructor

```javascript
class Optimizer {
  constructor(config, ticks, options = {})
  // config: base config (symbol, direction, payoutRate, etc.)
  // ticks: full tick array
  // options: { parallel: false, workers: 4, checkpointPath: './data/optimization-results' }
}
```

### Methods

| Method | Description |
|---|---|
| `runStage(stageNum, stageDef, fixedParams)` | Run one stage |
| `evaluate(params)` | Run engine with params, return summary |
| `runAll()` | Run stages 1-4 (optionally 5) |
| `getBestParams()` | Return best params from all stages |
| `generateReport()` | Generate human-readable report |

### Composite Score

```
compositeScore = (winRate * 0.40)
               + (profitFactor * 0.25)
               + (sharpeRatio * 0.15)
               + (tradeCountNormalized * 0.10)
               + (-maxDrawdownNormalized * 0.10)
```

### Filters
- `winRate >= 0.50`
- `totalTrades >= 50`
- Sort by compositeScore descending

### Overfitting Detection

```javascript
function detectOverfitting(trainPerf, validPerf, topResults) {
  return {
    wrGap: trainPerf.winRate - validPerf.winRate,  // > 0.03 = overfit flag
    top10Variance: std(top10.map(r => r.winRate)),  // > 0.02 = unstable
    overfitLevel: wrGap > 0.03 ? 'high' : wrGap > 0.015 ? 'medium' : 'low',
  };
}
```

### Checkpoint/Resume

Save after each batch of 500 combinations:
```javascript
{
  stage: 3,
  completed: 15000,
  total: 32000,
  results: [ /* top N so far */ ],
  bestParams: { /* ... */ },
  timestamp: '...',
}
```

### Execution

Stage 3 (32K combos) — sequential with progress reporting every 500 combos.
Parallel execution via `child_process.fork()` optional via `--parallel` flag.

---

## 4. Script: `scripts/run-stage.js`

```bash
node scripts/run-stage.js --stage=1 --symbol=CRASH1000
```

Runs a single stage, saves results to `data/optimization-results/stage-{N}-{name}.json`

---

## 5. Script: `scripts/run-optimization.js`

```bash
node scripts/run-optimization.js --symbol=CRASH1000
```

Runs all stages 1-4 (optionally 5), saves:
- Individual stage results
- `best-params.json`
- Console summary

---

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | Staged optimization runs end-to-end without error |
| AC2 | best-params.json has concrete values for all parameters |
| AC3 | WR on validation set >= 50% |
| AC4 | overfitCheck value present and reasonable |
| AC5 | Results stored per stage as JSON |
| AC6 | Same config on same data → same best params |
