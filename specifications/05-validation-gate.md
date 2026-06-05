# Specification 05: Validation Gate

- **Version:** 1.0
- **Research basis:** `research-boom-crash/05-statistical-edge-analysis.md`, `research-boom-crash/06-risk-analysis.md`, `research-boom-crash/15-risk-management-framework.md`, `research-boom-crash/18-research-roadmap.md`, `research-boom-crash/19-research-updates-2026.md`
- **Status:** Draft

## 1. Objective

Validate the optimized strategy on **unseen test data** (the 20% hold-out set from Phase 4). Generate a go/no-go decision based on whether the strategy achieves a statistically significant win rate above the breakeven threshold. If GO, the project proceeds to live bot implementation. If NO-GO, the project stops or returns to research.

**This is the single most important phase.** Everything before this is preparation. Everything after this depends on the outcome.

## 2. Input Requirements

### Data

- `data/boom_crash_ticks.db` from Phase 1 — full tick dataset
- Test data split from Phase 4 (last 20% of ticks, untouched by optimization)
- `data/optimization-results/best-params.json` from Phase 4 — optimal parameter set

### Dependencies

- **Phase 4 (Strategy Optimization)** — must be completed. This phase uses the best parameter set from optimization.

## 3. Technical Specification

### 3.1 Validation Architecture

```
Validator
  ├── TestDataLoader       # Loads the hold-out test set (last 20%)
  ├── BacktestRunner       # Phase 3 engine with best params on test data
  ├── StatisticalTest      # Binomial test: is WR > breakeven?
  ├── MonteCarloSim        # Simulate 10,000 account trajectories
  ├── SensitivityAnalyzer  # Test nearby parameter sets
  └── GateDecision         # Final go/no-go report
```

### 3.2 Test Data Integrity

The test set must be:
- **Previously unseen** — not used in any training or validation runs
- **Chronologically after training/validation** — simulates "future" data
- **At least 20,000 ticks** — provides ~1,000 trades at 50 ticks between trades
- **Same instrument** — Crash 1000 test data for Crash 1000 strategy

**Verification:** The test data file path must be recorded in Phase 4's `best-params.json` and the validator must verify the test data was never read before.

### 3.3 Primary Test: Win Rate on Test Data

Run the backtesting engine with `best-params` on the test data.

**Expected result:** WR >= 54.05% (breakeven at 85% payout)

**If WR < 50%:** Immediate NO-GO. The strategy is worse than random on unseen data (overfitting confirmed).

**If 50% <= WR < 54.05%:** MARGINAL. Proceed to statistical tests to determine if the edge is real but small, or just noise.

**If WR >= 54.05%:** PASS. Proceed to additional robustness tests.

### 3.4 Statistical Significance: Binomial Test

Even if WR > 54.05%, it could be due to luck. Use the binomial test:

```
H0: trueWR = 0.5405 (breakeven at 85% payout)
H1: trueWR > 0.5405

testStatistic = wins / totalTrades

p-value = P(X >= wins | X ~ Binomial(totalTrades, 0.5405))
```

| p-value | Interpretation |
|---|---|
| p < 0.01 | Highly significant — strong evidence of real edge |
| 0.01 <= p < 0.05 | Significant — moderate evidence of real edge |
| 0.05 <= p < 0.10 | Marginally significant — weak evidence, proceed with caution |
| p >= 0.10 | Not significant — could be luck, NO-GO |

**Minimum trade requirement:** Need at least 384 trades for 80% power to detect a 3% edge (from 54% to 57%) at p < 0.05.

```javascript
function binomialTest(wins, total, p0) {
  // p0 = breakeven rate (0.5405 at 85% payout)
  // Returns p-value (one-sided)
  let p = 0;
  for (let k = wins; k <= total; k++) {
    p += binomialCoefficient(total, k) * Math.pow(p0, k) * Math.pow(1 - p0, total - k);
  }
  return p;
}
```

For large N (>1000), use normal approximation:
```javascript
z = (wins/total - p0) / Math.sqrt(p0 * (1-p0) / total)
p = 1 - normalCDF(z)
```

### 3.5 Monte Carlo Simulation

Run 10,000 simulated trading sessions on the same test data by randomizing entry points:

**Method 1: Random entry times**
- Take the actual trades from the backtest (same number of trades)
- Randomly shuffle their entry times
- Recalculate PnL with shuffled entries
- Repeat 10,000 times
- If the actual PnL is in the top 5% of simulated PnLs → strategy has real edge

**Method 2: Random direction**
- Keep the same entry times but randomize direction (50% CALL, 50% PUT)
- Repeat 10,000 times
- If the actual WR is in the top 5% of simulated WRs → strategy has real edge

**Output:** Histogram of simulated PnLs with the actual PnL marked.

### 3.6 Sensitivity Analysis

Test the strategy's robustness by varying each parameter by +/-1 step:

| Parameter | Nominal | -1 step | +1 step |
|---|---|---|---|
| durationTicks | 10 | 5 | 15 |
| scoreThreshold | 6 | 5 | 7 |
| rsiOversold | 35 | 30 | 40 |
| rsiOverbought | 65 | 60 | 70 |

**Robustness criterion:** WR stays above 54.05% for all variations.

**If WR drops below 54.05% for any variation:** Flag as "sharp peak" — the strategy is brittle and may fail in live trading.

### 3.7 Different Payout Scenarios

Since payout rates vary by account and market conditions:

| Payout | Breakeven WR | Strategy WR | Verdict |
|---|---|---|---|
| 80% | 55.56% | 54.2% | ❌ Below |
| 85% | 54.05% | 54.2% | ✅ Above (marginal) |
| 90% | 52.63% | 54.2% | ✅ Above (comfortable) |
| 95% | 51.28% | 54.2% | ✅ Above (strong) |

**Recommendation:** If strategy WR is between 52.63% and 54.05%, it's only viable at >= 90% payout. The validator should check what payout rates are actually available for the account.

### 3.8 Risk Metrics on Test Data

| Metric | Target | Pass/Fail |
|---|---|---|
| Win Rate | >= 54.05% | |
| Profit Factor | >= 1.10 | |
| Sharpe Ratio | >= 0.5 | |
| Max Drawdown | <= 15% | |
| Max Consecutive Losses | <= 5 | |
| Trade per Day | >= 20 | |
| 95% VaR (daily) | <= 5% of account | |

### 3.9 Go/No-Go Decision Logic

```
GO conditions (ALL must be met):
  1. WR >= 54.05% on unseen test data
  2. Binomial test p-value < 0.10 (at least marginally significant)
  3. Monte Carlo actual PnL in top 10%
  4. Sensitivity: WR remains >= 54.05% for all +/-1 variations
  5. Max drawdown <= 15%
  6. At least 100 trades in test set

NO-GO if ANY:
  1. WR < 50% on test data
  2. Binomial test p-value >= 0.10
  3. Monte Carlo actual PnL not in top 20%
  4. More than 2 parameter variations drop WR below 54.05%
  5. Max drawdown > 20%

MARGINAL (proceed with caution):
  - WR between 52.63% and 54.05% but p-value < 0.05
  → Only proceed if 90%+ payout is available
```

### 3.10 Validation Report

```
data/
  validation-results/
    validation-report.json
    validation-summary.txt
    sensitivity-results.json
    monte-carlo-histogram.json
```

**`validation-report.json` structure:**

```json
{
  "testData": {
    "symbol": "CRASH1000",
    "tickCount": 30000,
    "dateRange": { "from": "...", "to": "..." }
  },
  "parameters": { /* best-params from Phase 4 */ },
  "primaryResults": {
    "totalTrades": 800,
    "wins": 434,
    "losses": 366,
    "winRate": 0.5425,
    "profitFactor": 1.12,
    "netProfit": 23.50,
    "sharpeRatio": 0.65,
    "maxDrawdown": -12.0,
    "maxConsecutiveLosses": 4
  },
  "statisticalTests": {
    "binomial": {
      "nullHypothesisWR": 0.5405,
      "observedWR": 0.5425,
      "pValue": 0.08,
      "significant": "MARGINAL"
    },
    "monteCarlo": {
      "iterations": 10000,
      "actualPnLPercentile": 87,
      "top10Percent": true
    }
  },
  "sensitivity": {
    "allPass": true,
    "failures": [],
    "worstCaseWR": 0.535
  },
  "payoutScenarios": [
    { "payout": 80, "breakevenWR": 0.5556, "verdict": "FAIL" },
    { "payout": 85, "breakevenWR": 0.5405, "verdict": "PASS" },
    { "payout": 90, "breakevenWR": 0.5263, "verdict": "PASS" }
  ],
  "decision": {
    "verdict": "MARGINAL",
    "proceed": true,
    "conditions": "Proceed with 90%+ payout only. Set stake to $0.50. Monitor first 100 trades manually.",
    "reasons": [
      "WR (54.25%) above breakeven at 85% payout (54.05%)",
      "p-value (0.08) marginally significant",
      "Monte Carlo in 87th percentile",
      "Sensitivity: all variations pass"
    ]
  }
}
```

## 4. Deliverables

| Deliverable | Description |
|---|---|
| `scripts/run-validation.js` | Validation script |
| `lib/statistical-tests.js` | Binomial test, normal approximation, Monte Carlo |
| `lib/sensitivity-analyzer.js` | Parameter sensitivity analysis |
| `lib/monte-carlo-simulator.js` | Monte Carlo simulation |
| `data/validation-results/validation-report.json` | Full validation report |
| `data/validation-results/validation-summary.txt` | Human-readable decision |
| `GO` or `NO-GO` decision | Clear output that determines project continuation |

## 5. Acceptance Criteria

| # | Criterion | How to verify |
|---|---|---|
| 1 | Test data is truly unseen | Verify test data file/slice was not used in Phase 4 training |
| 2 | All statistical tests produce results | Binomial p-value, Monte Carlo percentile, sensitivity all present |
| 3 | Go/no-go decision rendered | Decision object has clear `proceed: true/false` |
| 4 | Sensitivity analysis complete | All parameter variations tested, results reported |
| 5 | Payout scenario analysis complete | WR compared to breakeven at 80%, 85%, 90%, 95% |
| 6 | Validation re-runnable | Same input data + params produces same result |

## 6. Planner Notes

**For the planning agent:**

1. **This is the go/no-go gate** — The planner must design the validation report to be clear and unambiguous. A non-technical user should be able to read `validation-summary.txt` and understand whether the strategy is viable.

2. **Binomial test implementation** — For large N (>1000), use the normal approximation. For smaller N, implement the exact binomial test. The planner should handle edge cases like N=0 (no trades — return "insufficient data").

3. **Monte Carlo iteration count** — 10,000 iterations is standard and should complete in < 1 minute for Method 2 (direction randomization). Method 1 (time shuffling) is more computationally intensive but more realistic.

4. **Overfitting is the enemy** — The planner should be conservative. If the test results look too good (e.g., WR > 60%), suspect data leakage or look-ahead bias. Verify that no test data was used during optimization.

5. **Multiple instruments** — The validator should test on both Boom 1000 and Crash 1000, even if the strategy was optimized for only one. If the strategy fails on one but passes on the other, the conclusion is "instrument-specific edge" which is acceptable — just trade the one that works.

6. **False discovery rate** — With multiple tests (binomial, Monte Carlo, sensitivity, 4 payout scenarios), the chance of at least one false positive is increased. The planner should note this and consider a Bonferroni correction if being very conservative.

7. **Stake size recommendation** — Based on the validation results, the planner should recommend an initial stake size for Phase 6: `stake = min(accountBalance * 0.005, $1.00)` for the first 100 trades, then `stake = accountBalance * 0.01` after confirmation.
