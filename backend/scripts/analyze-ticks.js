const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const stats = require('../lib/stats');

function formatPct(v) { return (v).toFixed(1) + '%'; }
function formatNum(v, d) { return typeof v === 'number' && isFinite(v) ? v.toFixed(d || 4) : 'N/A'; }
function formatEpoch(ep) { return ep ? new Date(ep * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' UTC' : 'N/A'; }

const DB_PATH = path.join(__dirname, '..', 'data', 'boom_crash_ticks.db');
const OUTPUT_JSON = path.join(__dirname, '..', 'data', 'analysis-results.json');
const OUTPUT_SUMMARY = path.join(__dirname, '..', 'analysis-summary.txt');

const SPIKE_FIXED_THRESHOLD = 50;
const DURATIONS = [1, 5, 10, 20, 50];
const POST_SPIKE_HORIZONS = [1, 5, 10, 20, 50];
const BREAKEVEN = { 80: 100 / 180 * 100, 85: 100 / 185 * 100, 90: 100 / 190 * 100, 95: 100 / 195 * 100 };

function toFixed(v, d) { return typeof v === 'number' && isFinite(v) ? Number(v.toFixed(d || 4)) : null; }

function classify(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }

function loadTicks(db, symbol) {
  const rows = db.prepare('SELECT epoch, quote FROM ticks WHERE symbol = ? ORDER BY epoch ASC').all(symbol);
  if (rows.length < 2) return null;
  const prices = rows.map(r => r.quote);
  const epochs = rows.map(r => r.epoch);
  const deltas = [];
  for (let i = 1; i < prices.length; i++) deltas.push(prices[i] - prices[i - 1]);
  return { prices, epochs, deltas, count: rows.length, dateFrom: epochs[0], dateTo: epochs[epochs.length - 1] };
}

function runTest1(deltas) {
  const n = deltas.length;
  let pos = 0, neg = 0, zer = 0;
  for (let i = 0; i < n; i++) {
    const c = classify(deltas[i]);
    if (c > 0) pos++; else if (c < 0) neg++; else zer++;
  }
  return {
    meanDelta: toFixed(stats.mean(deltas)),
    medianDelta: toFixed(stats.median(deltas)),
    stdDelta: toFixed(stats.std(deltas)),
    skewness: toFixed(stats.skewness(deltas)),
    kurtosis: toFixed(stats.kurtosis(deltas)),
    pctPositive: toFixed(pos / n * 100, 1),
    pctNegative: toFixed(neg / n * 100, 1),
    pctZero: toFixed(zer / n * 100, 1),
  };
}

function detectSpikes(deltas, threshold) {
  const spikeIndices = [];
  for (let i = 0; i < deltas.length; i++) {
    if (Math.abs(deltas[i]) >= threshold) spikeIndices.push(i);
  }
  return spikeIndices;
}

function runTest2(deltas) {
  const dynamicThreshold = stats.mean(deltas) + 5 * stats.std(deltas);
  const fixedThresh = Math.max(SPIKE_FIXED_THRESHOLD, dynamicThreshold);

  const fixedSpikes = detectSpikes(deltas, SPIKE_FIXED_THRESHOLD);
  const dynamicSpikes = detectSpikes(deltas, dynamicThreshold);

  function analyzeSpikes(spikes, label, threshold) {
    const n = deltas.length;
    const intervals = [];
    for (let i = 1; i < spikes.length; i++) intervals.push(spikes[i] - spikes[i - 1]);

    let up = 0, down = 0;
    for (const idx of spikes) {
      if (deltas[idx] > 0) up++; else down++;
    }

    const intervalMean = intervals.length > 0 ? stats.mean(intervals) : null;
    const poisson = intervals.length >= 5 ? stats.exponentialFit(intervals) : { lambda: null, ksStat: null, ksPValue: null };

    const binary = new Array(n).fill(0);
    for (const idx of spikes) binary[idx] = 1;
    const clusterAcf = stats.autocorrelation(binary, 1);

    return {
      threshold: toFixed(threshold, 1),
      spikeCount: spikes.length,
      frequencyPerTick: toFixed(spikes.length / n, 6),
      meanInterval: toFixed(intervalMean, 1),
      upSpikes: up,
      downSpikes: down,
      poissonLambda: toFixed(poisson.lambda, 6),
      poissonKS: toFixed(poisson.ksStat, 4),
      poissonPValue: toFixed(poisson.ksPValue, 4),
      poissonConfirmed: isFinite(poisson.ksPValue) && poisson.ksPValue > 0.05,
      clusteringACF: toFixed(clusterAcf, 4),
    };
  }

  return {
    fixedThreshold: analyzeSpikes(fixedSpikes, 'fixed', SPIKE_FIXED_THRESHOLD),
    dynamicThreshold: analyzeSpikes(dynamicSpikes, 'dynamic', dynamicThreshold),
    thresholdUsed: Math.max(SPIKE_FIXED_THRESHOLD, dynamicThreshold),
  };
}

function runTest3(deltas, spikes) {
  const n = deltas.length;
  const results = {};

  for (const horizon of POST_SPIKE_HORIZONS) {
    const postDeltas = [];
    for (const s of spikes) {
      if (s + horizon < n) {
        for (let j = 1; j <= horizon; j++) postDeltas.push(deltas[s + j]);
      }
    }
    if (postDeltas.length < 2) {
      results[`h${horizon}`] = { meanPostSpike: null, tTest: { t: null, df: null, p: null }, significant: null };
      continue;
    }
    const tResult = stats.welchTTest(postDeltas, deltas);
    results[`h${horizon}`] = {
      meanPostSpike: toFixed(stats.mean(postDeltas)),
      sampleSize: postDeltas.length,
      tTest: { t: toFixed(tResult.t), df: toFixed(tResult.df, 1), p: toFixed(tResult.p, 4) },
      significant: isFinite(tResult.p) ? tResult.p < 0.05 : null,
    };
  }

  const h20 = results.h20 || {};
  return {
    horizons: results,
    overallMeanDelta: toFixed(stats.mean(deltas)),
    conclusion: h20.significant === false ? 'No detectable post-spike edge' :
                h20.significant === true ? 'Potential post-spike edge detected' : 'Insufficient data',
  };
}

function runTest4(deltas) {
  const n = deltas.length;
  const maxLag = Math.min(50, n - 2);
  const critical = 2 / Math.sqrt(n);
  const lags = [];
  const sigLags = [];
  let maxAbs = 0, maxLagIdx = -1;

  for (let lag = 1; lag <= maxLag; lag++) {
    const acf = stats.autocorrelation(deltas, lag);
    const val = isFinite(acf) ? acf : 0;
    lags.push(val);
    if (Math.abs(val) > critical) sigLags.push(lag);
    if (Math.abs(val) > maxAbs) { maxAbs = Math.abs(val); maxLagIdx = lag; }
  }

  return {
    lag1: toFixed(lags[0], 4),
    significantLags: sigLags,
    significantCount: sigLags.length,
    totalLagsTested: maxLag,
    criticalValue: toFixed(critical, 4),
    overallWhite: sigLags.length <= Math.ceil(maxLag * 0.05),
    maxACF: toFixed(maxAbs, 4),
    maxACFLag: maxLagIdx,
  };
}

function runTest5(prices) {
  const n = prices.length;
  const results = [];

  for (const D of DURATIONS) {
    const count = n - D;
    if (count < 2) { results.push({ duration: D, callWR: null, putWR: null, best: null, bestWR: null, meanReturn: null }); continue; }

    let callWins = 0, putWins = 0;
    let sumRet = 0;
    for (let i = 0; i < count; i++) {
      const ret = prices[i + D] - prices[i];
      sumRet += ret;
      if (ret > 0) callWins++;
      else if (ret < 0) putWins++;
    }
    const callWR = callWins / count * 100;
    const putWR = putWins / count * 100;
    const best = callWR >= putWR ? 'CALL' : 'PUT';
    const bestWR = Math.max(callWR, putWR);

    results.push({
      duration: D,
      callWR: toFixed(callWR, 1),
      putWR: toFixed(putWR, 1),
      best,
      bestWR: toFixed(bestWR, 1),
      meanReturn: toFixed(sumRet / count, 4),
    });
  }

  return results;
}

function runTest6(epochs, prices) {
  const hourly = {};
  for (let i = 0; i < epochs.length; i++) {
    const hour = epochs[i] - (epochs[i] % 3600);
    if (!hourly[hour]) hourly[hour] = [];
    hourly[hour].push(prices[i]);
  }

  const hourlyReturns = [];
  const hours = Object.keys(hourly).sort((a, b) => a - b);
  for (const h of hours) {
    const px = hourly[h];
    if (px.length >= 2) hourlyReturns.push(px[px.length - 1] - px[0]);
  }

  const lbTest = hourlyReturns.length >= 10 ? stats.ljungBoxTest(hourlyReturns, Math.min(5, hourlyReturns.length - 2)) : { statistic: NaN, pValue: NaN };

  let posStreak = 0, negStreak = 0, curPos = 0, curNeg = 0;
  for (const r of hourlyReturns) {
    if (r > 0) { curPos++; curNeg = 0; posStreak = Math.max(posStreak, curPos); }
    else if (r < 0) { curNeg++; curPos = 0; negStreak = Math.max(negStreak, curNeg); }
    else { curPos = 0; curNeg = 0; }
  }

  return {
    hoursWithData: hourlyReturns.length,
    meanHourlyReturn: toFixed(stats.mean(hourlyReturns)),
    stdHourlyReturn: toFixed(stats.std(hourlyReturns)),
    ljungBoxStatistic: toFixed(lbTest.statistic, 4),
    ljungBoxPValue: toFixed(lbTest.pValue, 4),
    isWhiteNoise: isFinite(lbTest.pValue) ? lbTest.pValue > 0.05 : null,
    longestPositiveStreak: posStreak,
    longestNegativeStreak: negStreak,
  };
}

function runTest7(durationResults) {
  let bestRawWR = 0, bestDuration = null;
  for (const d of durationResults) {
    if (d.bestWR !== null && d.bestWR > bestRawWR) { bestRawWR = d.bestWR; bestDuration = d.duration; }
  }

  const filterImprovement = 3.0;
  const estimatedMaxWR = bestRawWR + filterImprovement;
  const maxRawOnly = bestRawWR;

  function project(wr, be) {
    if (wr >= be) return 'GO';
    if (wr + filterImprovement >= be) return 'MARGINAL';
    return 'NO-GO';
  }

  const proj = {};
  for (const [payout, be] of Object.entries(BREAKEVEN)) {
    proj[`projection${payout}`] = project(maxRawOnly, be);
  }

  const bestBe85 = maxRawOnly >= BREAKEVEN[85];
  const estimatedBe85 = estimatedMaxWR >= BREAKEVEN[85];

  let recommendation;
  if (bestBe85) recommendation = 'GO — drift alone exceeds breakeven at 85% payout';
  else if (estimatedBe85) recommendation = 'GO — drift + filtering may exceed breakeven at 85% payout';
  else recommendation = 'NO-GO — insufficient edge for 85% payout';

  return {
    bestRawWR: toFixed(bestRawWR, 1),
    bestDuration,
    estimatedFilterImprovement: filterImprovement,
    estimatedMaxWR: toFixed(estimatedMaxWR, 1),
    breakeven80: toFixed(BREAKEVEN[80], 2),
    breakeven85: toFixed(BREAKEVEN[85], 2),
    breakeven90: toFixed(BREAKEVEN[90], 2),
    breakeven95: toFixed(BREAKEVEN[95], 2),
    ...proj,
    recommendation,
  };
}

function analyzeSymbol(data) {
  const { prices, epochs, deltas } = data;

  const test1 = runTest1(deltas);
  const test2 = runTest2(deltas);
  const thresholdUsed = Math.max(SPIKE_FIXED_THRESHOLD, test2.dynamicThreshold.threshold);
  const dynamicSpikes = detectSpikes(deltas, test2.dynamicThreshold.threshold);
  const test3 = runTest3(deltas, dynamicSpikes);
  const test4 = runTest4(deltas);
  const test5 = runTest5(prices);
  const test6 = runTest6(epochs, prices);
  const test7 = runTest7(test5);

  return {
    tickCount: data.count,
    dateRange: { from: formatEpoch(data.dateFrom), to: formatEpoch(data.dateTo) },
    descriptiveStats: test1,
    spikeAnalysis: test2,
    postSpikeTest: test3,
    autocorrelation: test4,
    durationAnalysis: test5,
    hourlyStationarity: test6,
    edgeEstimate: test7,
  };
}

function buildSummary(results) {
  const lines = [];
  lines.push('Statistical Analysis Summary');
  lines.push('═══════════════════════════════════════════');
  lines.push('');

  for (const symbol of Object.keys(results)) {
    const r = results[symbol];
    lines.push(`───────────────────────────────────────────`);
    lines.push(`  ${symbol}`);
    lines.push(`───────────────────────────────────────────`);
    lines.push(`  Ticks analyzed: ${r.tickCount.toLocaleString()}`);
    lines.push(`  Date range:     ${r.dateRange.from} → ${r.dateRange.to}`);
    lines.push('');

    const d = r.descriptiveStats;
    lines.push('  Test 1: Tick-to-Tick Price Changes');
    lines.push(`    Mean:     ${formatNum(d.meanDelta, 4)}  |  Median:   ${formatNum(d.medianDelta, 4)}`);
    lines.push(`    Std Dev:  ${formatNum(d.stdDelta, 4)}  |  Skewness: ${formatNum(d.skewness, 4)}`);
    lines.push(`    Kurtosis: ${formatNum(d.kurtosis, 4)}`);
    lines.push(`    Positive: ${formatPct(d.pctPositive)}  |  Negative: ${formatPct(d.pctNegative)}  |  Zero: ${formatPct(d.pctZero)}`);
    lines.push('');

    lines.push('  Test 2: Spike Detection');
    const sd = r.spikeAnalysis.dynamicThreshold;
    lines.push(`    Threshold: ${formatNum(sd.threshold, 1)} pts (dynamic)`);
    lines.push(`    Spikes:    ${sd.spikeCount} (${formatPct(sd.frequencyPerTick * 100)} of ticks)`);
    lines.push(`    Mean interval: ${formatNum(sd.meanInterval, 1)} ticks`);
    lines.push(`    Poisson test:  ${sd.poissonConfirmed ? 'CONFIRMED' : 'REJECTED'} (p=${formatNum(sd.poissonPValue, 4)})`);
    lines.push(`    Clustering:    ${formatNum(sd.clusteringACF, 4)}`);
    lines.push('');

    lines.push('  Test 3: Post-Spike Analysis (Berko Replication)');
    const ps = r.postSpikeTest;
    lines.push(`    Overall mean delta: ${formatNum(ps.overallMeanDelta, 4)}`);
    for (const [h, hr] of Object.entries(ps.horizons)) {
      lines.push(`    ${h}: mean=${formatNum(hr.meanPostSpike, 4)}, p=${hr.tTest ? formatNum(hr.tTest.p, 4) : 'N/A'} ${hr.significant === true ? '(SIGNIFICANT)' : hr.significant === false ? '(ns)' : ''}`);
    }
    lines.push(`    Conclusion: ${ps.conclusion}`);
    lines.push('');

    lines.push('  Test 4: Autocorrelation');
    const ac = r.autocorrelation;
    lines.push(`    Lag-1: ${formatNum(ac.lag1, 4)}`);
    lines.push(`    Significant lags: ${ac.significantLags.length > 0 ? ac.significantLags.join(', ') : 'none'}`);
    lines.push(`    White noise: ${ac.overallWhite ? 'YES' : 'NO'}`);
    lines.push('');

    lines.push('  Test 5: Duration Analysis');
    lines.push(`    ${'Duration'.padEnd(10)} ${'CALL WR'.padEnd(10)} ${'PUT WR'.padEnd(10)} ${'Best'.padEnd(8)} ${'Best WR'.padEnd(10)} ${'Mean Ret'.padEnd(10)} ${'BE 85%?'.padEnd(10)}`);
    for (const dr of r.durationAnalysis) {
      const callWR = dr.callWR !== null ? formatPct(dr.callWR) : 'N/A';
      const putWR = dr.putWR !== null ? formatPct(dr.putWR) : 'N/A';
      const bestWR = dr.bestWR !== null ? formatPct(dr.bestWR) : 'N/A';
      const meanRet = dr.meanReturn !== null ? formatNum(dr.meanReturn, 4) : 'N/A';
      const pass = dr.bestWR !== null && dr.bestWR >= BREAKEVEN[85] ? 'YES' : 'NO';
      lines.push(`    ${String(dr.duration).padEnd(10)} ${callWR.padEnd(10)} ${putWR.padEnd(10)} ${(dr.best || 'N/A').padEnd(8)} ${bestWR.padEnd(10)} ${meanRet.padEnd(10)} ${pass.padEnd(10)}`);
    }
    lines.push('');

    lines.push('  Test 6: Hourly Stationarity');
    const hs = r.hourlyStationarity;
    lines.push(`    Hours with data: ${hs.hoursWithData}`);
    lines.push(`    Mean hourly return: ${formatNum(hs.meanHourlyReturn, 4)}`);
    lines.push(`    Ljung-Box p-value: ${formatNum(hs.ljungBoxPValue, 4)} (white noise: ${hs.isWhiteNoise === true ? 'YES' : 'NO'})`);
    lines.push(`    Longest positive/negative streak: ${hs.longestPositiveStreak} / ${hs.longestNegativeStreak}`);
    lines.push('');

    lines.push('  Test 7: Edge Quantification');
    const ee = r.edgeEstimate;
    lines.push(`    Best raw drift WR: ${formatPct(ee.bestRawWR)} (at ${ee.bestDuration} ticks)`);
    lines.push(`    Estimated filter improvement: +${ee.estimatedFilterImprovement}%`);
    lines.push(`    Estimated max WR: ${formatPct(ee.estimatedMaxWR)}`);
    lines.push(`    Breakeven 85% payout: ${formatPct(BREAKEVEN[85])}`);
    lines.push(`    Breakeven 90% payout: ${formatPct(BREAKEVEN[90])}`);
    lines.push(`    Breakeven 95% payout: ${formatPct(BREAKEVEN[95])}`);
    lines.push(`    85% projection: ${ee.projection85}`);
    lines.push(`    90% projection: ${ee.projection90}`);
    lines.push(`    95% projection: ${ee.projection95}`);
    lines.push(`    Recommendation: ${ee.recommendation}`);
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════');
  return lines.join('\n');
}

function main() {
  console.log('Statistical Analysis — Boom/Crash 1000');
  console.log('═══════════════════════════════════════════\n');

  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}. Run Phase 1 first.`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  const symbols = ['BOOM1000', 'CRASH1000'];
  const results = {};

  for (const symbol of symbols) {
    console.log(`Analyzing ${symbol}...`);
    const data = loadTicks(db, symbol);
    if (!data) {
      console.log(`  ❌ Insufficient data for ${symbol} (< 2 ticks). Skipping.\n`);
      results[symbol] = null;
      continue;
    }
    console.log(`  ${data.count.toLocaleString()} ticks loaded, ${data.deltas.length.toLocaleString()} deltas computed`);
    const analysis = analyzeSymbol(data);
    results[symbol] = analysis;
    console.log(`  ✓ All 7 tests complete\n`);
  }

  db.close();

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Results written to ${OUTPUT_JSON}`);

  const summary = buildSummary(results);
  fs.writeFileSync(OUTPUT_SUMMARY, summary, 'utf8');
  console.log(`Summary written to ${OUTPUT_SUMMARY}\n`);

  console.log(summary);
}

main();
