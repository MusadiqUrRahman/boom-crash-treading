# Specification 02: Statistical Analysis

- **Version:** 1.0
- **Research basis:** `research-boom-crash/01-tick-data-analysis.md`, `research-boom-crash/02-mathematical-structure.md`, `research-boom-crash/03-spike-analysis.md`, `research-boom-crash/04-between-spike-behavior.md`, `research-boom-crash/05-statistical-edge-analysis.md`, `research-boom-crash/08-post-spike-drift-capture.md`, `research-boom-crash/19-research-updates-2026.md`
- **Status:** Draft

## 1. Objective

Analyze the tick-level data acquired in Phase 1 to confirm the mathematical properties of Boom 1000 and Crash 1000 indices. Determine whether the hypothesized drift edge exists, measure its magnitude, test the Poisson spike process, and validate (or refute) the Berko (2026) findings on this specific dataset.

**Primary question:** Is there a statistically detectable directional drift in tick-to-tick price changes?

**Secondary question:** Are post-spike windows different from random windows?

**Tertiary question:** What is the maximum achievable win rate for a drift-based binary options strategy?

## 2. Input Requirements

### Data

- `data/boom_crash_ticks.db` from Phase 1 — SQLite database with 100K+ ticks per symbol
- Each tick contains: `symbol`, `epoch` (Unix timestamp), `quote` (price)

### Dependencies

- **Phase 1 (Data Acquisition)** — must be completed. This phase reads the database produced by Phase 1.

## 3. Technical Specification

### 3.1 Analysis Environment

- **Runtime:** Node.js 18+
- **Plotting:** Optional — output numerical results to console/JSON. If plotting is desired, use a lightweight solution.
- **Stats library:** Use plain JavaScript with built-in `Math` for calculations, or a small stats utility module. No heavy external dependencies like Python/pandas — keep the stack consistent.

### 3.2 Analysis Script Structure

Create a single script `analyze-ticks.js` that loads data from SQLite and runs all tests. Output results as structured JSON to stdout and optionally write a summary report.

```
scripts/
  analyze-ticks.js        # Main analysis script
lib/
  stats.js                # Statistical utility functions
```

### 3.3 Analysis Tests

#### Test 1: Tick-to-Tick Price Changes (Returns)

For each symbol, calculate the sequence of tick-to-tick price differences:

```
delta[i] = price[i] - price[i-1]
```

Compute:

| Metric | Description |
|---|---|
| Mean delta | Average tick change. Positive for uptrend, negative for downtrend |
| Median delta | Robust central tendency |
| Standard deviation | Volatility of tick changes |
| Skewness | Asymmetry of distribution |
| Kurtosis | Tail heaviness (Boom/Crash are known to be leptokurtic) |
| % positive deltas | Win rate for a CALL at 1-tick duration |
| % negative deltas | Win rate for a PUT at 1-tick duration |
| % zero deltas | Ticks with no price change |

**Expected:** % positive deltas should be ~51% for Crash 1000 (downtrend → more PUT-friendly). % negative deltas should be ~51% for Boom 1000 (uptrend → more CALL-friendly). This is the "drift" that provides the potential edge.

#### Test 2: Spike Detection and Characterization

Define a spike as a tick change exceeding a threshold:

```
isSpike = abs(delta) >= SPIKE_THRESHOLD
```

Where `SPIKE_THRESHOLD` should be calculated as:

- **Fixed threshold:** e.g., 50 points (based on research)
- **Dynamic threshold:** e.g., `mean(delta) + 5 * std(delta)` (adaptive)

Compute:

| Metric | Description |
|---|---|
| Spike frequency | Average ticks between spikes |
| Spike distribution | Poisson test — do spike intervals follow an exponential distribution? |
| Spike magnitude | Mean/median/max of spike absolute values |
| Spike direction | Are spikes equally up and down? Or biased? |
| Spike clustering | Are spikes more likely to occur near other spikes? |

**Expected:** Spike intervals should follow an exponential distribution (Poisson process), confirming that spikes are random events with no memory.

#### Test 3: Post-Spike Analysis (Berko Replication)

For each spike, examine the N ticks following it:

```
for each spike at index s:
  postSpikeDeltas = delta[s+1 .. s+N]  // N = 20 ticks
```

Compute:

| Metric | Description |
|---|---|
| Mean post-spike delta vs baseline | Is it significantly different? |
| % of post-spike windows with net positive drift | |
| Cumulative drift over 1, 5, 10, 20 ticks post-spike | |
| t-test: post-spike mean delta vs overall mean delta | |

**Null hypothesis:** Post-spike deltas are drawn from the same distribution as all deltas.

**Expected (per Berko 2026):** No statistically significant difference. Post-spike windows are indistinguishable from random windows. This must be confirmed on Boom/Crash data specifically.

#### Test 4: Autocorrelation of Tick Changes

Compute autocorrelation of `delta` series at lags 1 through 50:

```
lag_k = correlation(delta[i], delta[i-k])  for k = 1..50
```

| Metric | Description |
|---|---|
| Lag-1 autocorrelation | Are consecutive ticks correlated? |
| Significant lags | Any lags where |autocorrelation| > 2/sqrt(N)? |

**Expected:** Low or zero autocorrelation. Tick-to-tick changes should be nearly independent. If autocorrelation exists at short lags, it could be exploitable.

#### Test 5: Distribution of Returns at Different Durations

Simulate holding a position for D ticks (D = 1, 5, 10, 20, 50):

```
for each entry tick i:
  return[D] = price[i+D] - price[i]
```

For each duration D, compute:

| Metric | Description |
|---|---|
| Win rate for CALL | % of windows where return[D] > 0 |
| Win rate for PUT | % of windows where return[D] < 0 |
| Best direction | CALL or PUT at this duration |
| Mean return | Expected profit per contract (before costs) |

**This is the critical test.** It shows the raw win rate achievable at different durations, before any filtering or entry strategy. This directly informs whether the breakeven threshold (54.05% at 85% payout) is reachable.

Output a table:

```
Duration | CALL WR | PUT WR | Best Direction | Best WR | Breakeven (85%) | Pass?
1        | 49.5%  | 50.5%  | PUT            | 50.5%   | 54.05%          | NO
5        | 50.1%  | 49.9%  | CALL           | 50.1%   | 54.05%          | NO
10       | 50.8%  | 49.2%  | CALL           | 50.8%   | 54.05%          | NO
20       | 51.5%  | 48.5%  | CALL           | 51.5%   | 54.05%          | NO
50       | 52.0%  | 48.0%  | CALL           | 52.0%   | 54.05%          | NO
```

#### Test 6: Hourly Drift Stationarity

Split the data into hourly segments. For each hour, compute the hourly return:

```
hourlyReturn[hour] = price[endOfHour] - price[startOfHour]
```

| Metric | Description |
|---|---|
| Mean hourly return | Average drift per hour |
| Std of hourly returns | Volatility of hourly drift |
| Are hourly returns white noise? | Ljung-Box test or visual inspection |
| Streaks of positive/negative hours | |

**Expected (per Berko 2026):** Hourly drift residuals should be white noise — no predictable pattern. This means long-term trend direction cannot be predicted.

#### Test 7: Edge Quantification (The Bottom Line)

Combine findings to estimate the maximum achievable win rate:

```
maxWR = maxOverDuration(bestDirectionWR) + expectedFilterImprovement
```

Where `expectedFilterImprovement` is an estimate of how much entry filtering (Phase 3+4) can improve over raw drift.

| Component | Expected value |
|---|---|
| Best raw drift WR | ~51-52% (from Test 5) |
| Potential filter improvement | 1-5% (estimated) |
| Maximum achievable WR | ~53-56% |
| Breakeven WR (85% payout) | 54.05% |
| Breakeven WR (90% payout) | 52.63% |
| Breakeven WR (95% payout) | 51.28% |

**If maximum achievable WR < breakeven WR:** The project may not be viable with this instrument. The analysis should flag this clearly.

### 3.4 Output Report Structure

Write results to `data/analysis-results.json` with this structure:

```json
{
  "symbol": "BOOM1000",
  "tickCount": 150000,
  "dateRange": { "from": "2025-01-01", "to": "2025-06-01" },
  "descriptiveStats": {
    "meanDelta": 0.012,
    "medianDelta": 0.001,
    "stdDelta": 2.34,
    "skewness": -0.15,
    "kurtosis": 45.2,
    "pctPositive": 49.5,
    "pctNegative": 50.1,
    "pctZero": 0.4
  },
  "spikeAnalysis": {
    "threshold": 50,
    "frequencyPerTick": 0.002,
    "meanInterval": 500,
    "poissonConfirmed": true,
    "spikeClustering": false
  },
  "postSpikeTest": {
    "significant": false,
    "pValue": 0.23,
    "meanPostSpikeDelta": 0.008,
    "meanOverallDelta": 0.012,
    "conclusion": "No detectable post-spike edge"
  },
  "autocorrelation": {
    "lag1": 0.02,
    "significantLags": [5, 12],
    "overallWhite": true
  },
  "durationAnalysis": [
    { "duration": 1, "callWR": 49.5, "putWR": 50.5, "best": "PUT", "bestWR": 50.5 },
    { "duration": 5, "callWR": 50.1, "putWR": 49.9, "best": "CALL", "bestWR": 50.1 },
    { "duration": 10, "callWR": 50.8, "putWR": 49.2, "best": "CALL", "bestWR": 50.8 },
    { "duration": 20, "callWR": 51.5, "putWR": 48.5, "best": "CALL", "bestWR": 51.5 }
  ],
  "edgeEstimate": {
    "bestRawWR": 51.5,
    "estimatedFilterImprovement": 3.0,
    "estimatedMaxWR": 54.5,
    "breakevenWR85": 54.05,
    "breakevenWR90": 52.63,
    "projection85": "MARGINAL",
    "projection90": "FEASIBLE"
  }
}
```

Also write a human-readable summary `analysis-summary.txt` with formatted results and the key conclusions.

## 4. Deliverables

| Deliverable | Description |
|---|---|
| `scripts/analyze-ticks.js` | Main analysis script that runs all tests |
| `lib/stats.js` | Statistical utility functions (mean, std, skewness, kurtosis, correlation, t-test) |
| `data/analysis-results.json` | Structured machine-readable analysis results |
| `analysis-summary.txt` | Human-readable summary with conclusions |

## 5. Acceptance Criteria

| # | Criterion | How to verify |
|---|---|---|
| 1 | All 7 tests produce numerical results | Output JSON has all expected fields, no NaN or null values |
| 2 | Duration analysis table computed | Table shows WR for CALL and PUT at each duration |
| 3 | Post-spike edge quantified | t-test result reported with p-value and conclusion |
| 4 | Poisson spike process tested | Spike interval distribution tested, result reported |
| 5 | Edge estimate calculated | Max achievable WR estimated with filter improvement assumption |
| 6 | Breakeven comparison made | WR estimate compared to breakeven at 85%, 90%, 95% payouts |
| 7 | Results stored to JSON | `analysis-results.json` written and parsable |
| 8 | Script re-runnable | Running `analyze-ticks.js` again produces identical results |

## 6. Planner Notes

**For the planning agent:**

1. **Stats implementation** — All statistical functions should be implemented in pure JavaScript. No Python dependency. Use `lib/stats.js` for reusable functions: mean, median, std, skewness, kurtosis, pearson correlation, autocorrelation, t-test.

2. **Large dataset handling** — 100K+ ticks is manageable in Node.js memory (100K numbers ≈ 800KB). The entire dataset can be loaded into arrays for analysis. Do NOT process tick-by-tick from the database — load all at once.

3. **Spike threshold** — The planner should use both a fixed threshold (50 points) and a dynamic threshold (mean + 5*std) and compare results. Report both.

4. **Duration analysis efficiency** — The naive approach for Test 5 (loop over every tick, look D ticks ahead) is O(N*D) and fine for N=100K, D=50. For N=500K, D=50, it's 25M iterations — still fine in Node.js (< 1 second).

5. **Edge estimation conservative** — The "estimatedFilterImprovement" should default to 3% as a conservative estimate. The planner should note that improving WR from 51% to 54% requires a ~60% reduction in error rate (going from 49% errors to 46% errors — a 3 percentage point improvement on the error side), which is ambitious.

6. **Go/no-go implications** — The planner should make the analysis script output a clear recommendation:
   - If bestRawWR >= 54%: "GO — strategy may work without filtering"
   - If bestRawWR + filterImprovement >= 54%: "GO — strategy may work with filtering (proceed to optimization)"
   - If bestRawWR + filterImprovement < 54%: "NO-GO — edge insufficient for breakeven at 85% payout"
