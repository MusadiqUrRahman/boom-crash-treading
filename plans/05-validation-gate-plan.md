# Implementation Plan 05: Validation Gate

**Spec:** `specifications/05-validation-gate.md`
**Data:** `data/boom_crash_ticks.db` + `data/optimization-results/best-params.json`
**This is the go/no-go gate** for the entire project.

---

## 1. File Structure

```
backend/
  lib/
    statistical-tests.js        # Binomial test (exact + normal approx)
    monte-carlo-simulator.js    # 10,000 randomization iterations
    sensitivity-analyzer.js     # +/-1 parameter perturbation
  scripts/
    run-validation.js           # Main validation script
  data/
    validation-results/         # Output directory
      validation-report.json
      validation-summary.txt
      sensitivity-results.json
      monte-carlo-histogram.json
```

---

## 2. Library: `lib/statistical-tests.js`

### binomialTest(wins, total, p0)

One-sided upper-tail binomial test:
```
H0: trueWR = p0  (breakeven at given payout)
H1: trueWR > p0

if total > 1000:
  z = (wins/total - p0) / sqrt(p0*(1-p0)/total)
  p = 1 - normalCDF(z)
else:
  for k = wins to total:
    p += C(total, k) * p0^k * (1-p0)^(total-k)
```

Uses log-gamma for large binomial coefficients to avoid overflow.

Returns `{ pValue, significant, zScore }` with significance levels:
- `p < 0.01` → HIGHLY_SIGNIFICANT
- `0.01 <= p < 0.05` → SIGNIFICANT
- `0.05 <= p < 0.10` → MARGINAL
- `p >= 0.10` → NOT_SIGNIFICANT

### calculateBreakevenWR(payoutRate)
```
breakevenWR = 1 / (1 + payoutRate)
// 85% payout → 1/1.85 = 54.05%
```

---

## 3. Library: `lib/monte-carlo-simulator.js`

### runMonteCarlo(trades, prices, iterations)

Method 2 (direction randomization):
- Keep entry times but randomize direction (50/50 CALL/PUT)
- Simulate each iteration with random directions
- Track WR for each iteration

Returns: `{ actualWR, percentile, top10percent, histogram }`

### generateHistogram(results, bins)

Groups results into bins for histogram output.

---

## 4. Library: `lib/sensitivity-analyzer.js`

### runSensitivityAnalysis(baseParams, ticks, engineConfig)

For each key parameter, test -1 and +1 step:
```javascript
const params = [
  { name: 'durationTicks', steps: [-10, -5, 5, 10] },
  { name: 'scoreThreshold', steps: [-1, 1] },
  { name: 'rsiOversold', steps: [-5, 5] },
  { name: 'rsiOverbought', steps: [-5, 5] },
  { name: 'bbPeriod', steps: [-10, 10] },
  { name: 'cooldownTicks', steps: [-2, 2] },
];
```

Returns: `{ allPass, failures, variations: [{ param, value, wr }] }`

---

## 5. Script: `scripts/run-validation.js`

### Flow
1. Load best-params.json from Phase 4
2. Load tick data from DB
3. Split chronologically: training 60%, validation 20%, test 20%
4. Verify test data was not used in training (epoch range check)
5. Run backtest on test data with best params
6. Compute risk metrics
7. Run binomial test
8. Run Monte Carlo simulation (1,000 iterations)
9. Run sensitivity analysis
10. Compute payout scenarios
11. Render go/no-go decision
12. Write output files

### Validation report structure
Per spec §3.10 — all fields present.

---

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | Test data verified unseen (epoch range check) |
| AC2 | All statistical tests produce results |
| AC3 | Go/no-go decision rendered |
| AC4 | Sensitivity analysis complete |
| AC5 | Payout scenario analysis complete |
| AC6 | Re-runnable — same data + params → same result |
