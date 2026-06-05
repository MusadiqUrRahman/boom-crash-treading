# Implementation Plan: 02 — Statistical Analysis

- **Spec:** `specifications/02-statistical-analysis.md`
- **Research basis:** `research-boom-crash/02-mathematical-structure.md`, `04-between-spike-behavior.md`, `05-statistical-edge-analysis.md`, `08-post-spike-drift-capture.md`, `19-research-updates-2026.md`
- **Data source:** `backend/data/boom_crash_ticks.db` from Phase 1

## Overview

Analyze tick-level data for Boom 1000 and Crash 1000 to detect directional drift, characterize spike behavior, replicate Berko (2026) findings, and determine whether a viable edge exists for binary options trading at 85% payout.

## 1. File Structure

```
backend/
  lib/
    stats.js              # Pure-JS statistical utilities
  scripts/
    analyze-ticks.js      # Main analysis script — runs all 7 tests
package.json              # Add "analyze" script entry
data/
  analysis-results.json   # Machine-readable results
analysis-summary.txt      # Human-readable report with conclusions
```

## 2. Library: `lib/stats.js`

Pure JavaScript statistical functions — no dependencies. Input validation on every function; returns `NaN` where computation is impossible.

### Functions

| Function | Signature | Description |
|---|---|---|
| `mean(arr)` | `number[] => number` | Arithmetic mean |
| `median(arr)` | `number[] => number` | Sorts, picks middle element |
| `std(arr)` | `number[] => number` | Sample standard deviation (Bessel's correction) |
| `variance(arr)` | `number[] => number` | Sample variance |
| `skewness(arr)` | `number[] => number` | Fisher-Pearson standardized moment coefficient |
| `kurtosis(arr)` | `number[] => number` | Excess kurtosis (normal = 0) |
| `pearsonCorrelation(x, y)` | `(number[], number[]) => number` | Standard Pearson correlation |
| `autocorrelation(arr, lag)` | `(number[], number) => number` | Pearson between `arr[i]` and `arr[i-lag]` |
| `welchTTest(sample1, sample2)` | `(number[], number[]) => { t, df, p }` | Welch's t-test with approximate p-value |
| `chiSquaredGOF(observed, expected)` | `(number[], number[]) => { chi2, p }` | Chi-squared goodness-of-fit |
| `ljungBoxTest(residuals, lags)` | `(number[], number) => { statistic, pValue }` | Portmanteau test for white noise |
| `normalCDF(x)` | `number => number` | Standard normal CDF (Abramowitz & Stegun approximation) |
| `chiSquaredCDF(x, k)` | `(number, number) => number` | Chi-squared CDF (k degrees of freedom) |

### P-value approach

- Welch's t-test p-value: normal approximation (valid for df > 30)
- Ljung-Box p-value: chi-squared CDF approximation
- KS test p-value: Kolmogorov distribution approximation
- All are numerical approximations with < 1% error in the tails

## 3. Main Script: `scripts/analyze-ticks.js`

### 3.1 Data Loading

```javascript
const boomTicks = db.prepare('SELECT epoch, quote FROM ticks WHERE symbol = ? ORDER BY epoch ASC').all('BOOM1000');
```

Load all ticks for each symbol into arrays `prices[]` and compute `deltas[]` upfront. If < 2 ticks, skip with warning.

### 3.2 Per-Symbol Pipeline — All 7 Tests

#### Test 1: Tick-to-Tick Price Changes (Returns)

Compute `delta[i] = price[i] - price[i-1]`. Output: mean, median, std, skewness, kurtosis, %positive, %negative, %zero.

**Expected:** ~51% of deltas in drift direction (negative for Boom, positive for Crash).

#### Test 2: Spike Detection & Characterization

Two thresholds: fixed (50 points) and dynamic (`mean + 5*std`). For each:
- Spike frequency, mean interval
- Poisson test: KS against exponential distribution
- Direction bias: chi-squared test of up vs down spikes
- Clustering: lag-1 autocorrelation of binary spike series

**Expected (Berko):** Poisson confirmed (p > 0.05), no clustering.

#### Test 3: Post-Spike Analysis (Berko Replication)

For each spike, compute cumulative drift over 1, 5, 10, 20, 50 look-ahead ticks. Welch's t-test vs overall delta distribution.

**Null hypothesis:** Post-spike deltas indistinguishable from all deltas.

**Expected (Berko):** p > 0.05 for all horizons — no post-spike edge.

#### Test 4: Autocorrelation of Tick Changes

Autocorrelation of deltas at lags 1–50. Critical band: `±2/sqrt(N)`.

**Expected:** Near-zero lag-1. No more than 5% of lags exceeding significance band.

#### Test 5: Duration Analysis (CRITICAL — The Core Question)

For each duration D = 1, 5, 10, 20, 50: compute CALL WR, PUT WR, best direction, best WR, mean return.

**Table output:**

```
Duration | CALL WR | PUT WR | Best | Best WR | Breakeven (85%) | Pass?
```

#### Test 6: Hourly Drift Stationarity

Group ticks by hour, compute hourly returns. Ljung-Box test for white noise.

**Expected (Berko):** White noise — hourly drift residuals have no autocorrelation.

#### Test 7: Edge Quantification (Go/No-Go)

```
bestRawWR = max over durations of bestDirectionWR (Test 5)
estimatedFilterImprovement = 3.0%
estimatedMaxWR = bestRawWR + estimatedFilterImprovement
```

Decision:
- If bestRawWR >= 54.05%: **GO** — drift alone exceeds breakeven at 85%
- If estimatedMaxWR >= 54.05%: **GO** — drift + filtering may work
- Else: **NO-GO** — insufficient edge for 85% payout

Also report viability at 80%, 90%, 95% payouts.

## 4. Output Format

### `data/analysis-results.json`

```json
{
  "BOOM1000": { /* all test results per spec Section 3.4 */ },
  "CRASH1000": { /* same structure */ }
}
```

### `analysis-summary.txt`

Human-readable: per-symbol summary, duration table, go/no-go recommendation.

## 5. Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC1 | All 7 tests produce numerical results | No NaN/null in JSON; all fields present |
| AC2 | Duration table computed | `durationAnalysis[]` has 5 entries; formatted table in summary |
| AC3 | Post-spike edge quantified | `postSpikeTest.pValue` and `conclusion` in JSON |
| AC4 | Poisson process tested | `spikeAnalysis.poissonConfirmed` and `pValue` in JSON |
| AC5 | Edge estimate calculated | `edgeEstimate.estimatedMaxWR` in JSON |
| AC6 | Breakeven comparison made | `edgeEstimate.projection85/90/95` values in JSON |
| AC7 | Results stored to JSON | `analysis-results.json` parsable |
| AC8 | Script re-runnable | Identical results on second run |

## 6. Execution Order

1. Write `lib/stats.js` — all statistical functions
2. Write `scripts/analyze-ticks.js` — build test by test
3. Update `package.json` with `"analyze": "node scripts/analyze-ticks.js"`
4. Run `npm run analyze`
5. Verify JSON and summary output
6. Check all ACs

## 7. Risks & Edge Cases

| Risk | Mitigation |
|---|---|
| < 100K ticks available | Flag `tickCount < 100000` but run analysis on available data |
| Spike threshold catches too many/few | Use fixed (50pt) AND dynamic (mean+5*std); report both |
| P-value approximations | Document approximation method; normal approx valid for df > 30 |
| Performance | N=100K arrays ~ 800KB each; duration analysis O(N*D) < 1 sec |
