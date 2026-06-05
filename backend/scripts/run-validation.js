const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const defaults = require('../config/backtest-defaults');
const { BacktestingEngine } = require('../lib/backtesting-engine');
const { computeMetrics } = require('../lib/metrics-calculator');
const { binomialTest, calculateBreakevenWR } = require('../lib/statistical-tests');
const { runMonteCarlo } = require('../lib/monte-carlo-simulator');
const { runSensitivityAnalysis } = require('../lib/sensitivity-analyzer');
const { splitData } = require('../lib/parameter-grid');

function loadBestParams() {
  const filePath = path.resolve(__dirname, '..', 'data', 'optimization-results', 'best-params.json');
  if (!fs.existsSync(filePath)) {
    console.error('best-params.json not found. Run Phase 4 optimization first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function loadTicks(dbPath, symbol) {
  const resolvedDbPath = path.resolve(__dirname, '..', dbPath);
  const db = new Database(resolvedDbPath);
  const rows = db.prepare(
    'SELECT epoch, quote FROM ticks WHERE symbol = ? ORDER BY epoch ASC'
  ).all(symbol);

  if (rows.length === 0) {
    console.error(`No ticks found for symbol: ${symbol}`);
    process.exit(1);
  }

  return rows.map(r => ({ epoch: r.epoch, quote: r.quote }));
}

function verifyTestDataUnseen(testEpochs, trainEpochs) {
  const testMin = Math.min(...testEpochs);
  const trainMax = Math.max(...trainEpochs);
  return testMin >= trainMax;
}

function formatPct(v) {
  if (v === null || v === undefined) return 'N/A';
  return (v * 100).toFixed(2) + '%';
}

function formatMoney(v) {
  if (v === null || v === undefined) return 'N/A';
  return (v >= 0 ? '+' : '') + '$' + v.toFixed(2);
}

function formatNumber(v) {
  if (v === null || v === undefined) return 'N/A';
  return v.toFixed(4);
}

function main() {
  const bestParamsData = loadBestParams();
  const baseParams = bestParamsData.config;

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   VALIDATION GATE                        ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`Symbol:    ${baseParams.symbol}`);
  console.log(`Direction: ${baseParams.direction}`);
  console.log('');

  const ticks = loadTicks(baseParams.dbPath, baseParams.symbol);
  const splits = splitData(ticks);

  const testEpochs = splits.test.map(t => t.epoch);
  const trainEpochs = splits.training.map(t => t.epoch);
  const validEpochs = splits.validation.map(t => t.epoch);

  console.log(`Total ticks:     ${ticks.length.toLocaleString()}`);
  console.log(`Training ticks:  ${splits.training.length.toLocaleString()} (${splits.indices.training.from}-${splits.indices.training.to})`);
  console.log(`Validation ticks:${splits.validation.length.toLocaleString()} (${splits.indices.validation.from}-${splits.indices.validation.to})`);
  console.log(`Test ticks:      ${splits.test.length.toLocaleString()} (${splits.indices.test.from}-${splits.indices.test.to})`);

  const dataOk = verifyTestDataUnseen(testEpochs, trainEpochs);
  console.log(`Test data unseen: ${dataOk ? '✅ YES (chronologically after training)' : '❌ NO — data leakage risk'}`);
  console.log('');

  if (splits.test.length < 20000) {
    console.log(`⚠ Test set (${splits.test.length} ticks) < 20,000 tick minimum. Consider collecting more data.`);
  }

  const engine = new BacktestingEngine(baseParams, splits.test);
  const engineResults = engine.run();
  const uniqueDays = engine.uniqueDays.size;
  const metrics = computeMetrics(engineResults.trades, uniqueDays);

  if (metrics.totalTrades === 0) {
    console.log('❌ NO-GO: 0 trades on test data. Strategy too selective.');
    process.exit(1);
  }

  const breakevenWR = calculateBreakevenWR(baseParams.payoutRate);
  const binomResult = binomialTest(metrics.wins, metrics.totalTrades, breakevenWR);

  let monteCarloResult = null;
  if (metrics.totalTrades > 0) {
    monteCarloResult = runMonteCarlo(
      engineResults.trades,
      splits.test.map(t => t.quote),
      baseParams,
      1000
    );
  }

  const sensResult = runSensitivityAnalysis(baseParams, splits.test, breakevenWR);

  const payoutScenarios = [
    { payout: 0.80, breakevenWR: calculateBreakevenWR(0.80) },
    { payout: 0.85, breakevenWR: calculateBreakevenWR(0.85) },
    { payout: 0.90, breakevenWR: calculateBreakevenWR(0.90) },
    { payout: 0.95, breakevenWR: calculateBreakevenWR(0.95) },
  ];

  const payoutResults = payoutScenarios.map(s => ({
    payout: s.payout,
    breakevenWR: s.breakevenWR,
    strategyWR: metrics.winRate,
    verdict: metrics.winRate !== null && metrics.winRate >= s.breakevenWR ? 'PASS' : 'FAIL',
    pctFormat: `${(s.payout * 100).toFixed(0)}%`,
  }));

  const report = {
    testData: {
      symbol: baseParams.symbol,
      tickCount: splits.test.length,
      dateRange: {
        from: testEpochs[0],
        to: testEpochs[testEpochs.length - 1],
      },
      verifiedUnseen: dataOk,
    },
    parameters: baseParams,
    primaryResults: metrics,
    statisticalTests: {
      binomial: {
        nullHypothesisWR: breakevenWR,
        observedWR: metrics.winRate,
        pValue: binomResult.pValue,
        significant: binomResult.significant,
        zScore: binomResult.zScore,
      },
      monteCarlo: monteCarloResult ? {
        iterations: monteCarloResult.iterations,
        actualWR: monteCarloResult.actualWR,
        actualPnl: monteCarloResult.actualPnl,
        wrPercentile: monteCarloResult.wrPercentile,
        pnlPercentile: monteCarloResult.pnlPercentile,
        top10percentWR: monteCarloResult.top10percentWR,
        top10percentPnl: monteCarloResult.top10percentPnl,
      } : null,
    },
    sensitivity: {
      allPass: sensResult.allPass,
      failures: sensResult.failures,
      worstCaseWR: sensResult.worstCaseWR,
    },
    payoutScenarios: payoutResults,
  };

  let goConditions = 0;
  let goTotal = 6;

  const condition1 = metrics.winRate !== null && metrics.winRate >= breakevenWR;
  if (condition1) goConditions++;

  const condition2 = binomResult.pValue !== null && binomResult.pValue < 0.10;
  if (condition2) goConditions++;

  const condition3 = monteCarloResult && monteCarloResult.pnlPercentile >= 80;
  if (condition3) goConditions++;

  const condition4 = sensResult.allPass;
  if (condition4) goConditions++;

  const condition5 = metrics.maxDrawdown <= 20;
  if (condition5) goConditions++;

  const condition6 = metrics.totalTrades >= 100;
  if (condition6) goConditions++;

  const noGo1 = metrics.winRate !== null && metrics.winRate < 0.50;
  const noGo2 = binomResult.pValue !== null && binomResult.pValue >= 0.10;
  const noGo3 = monteCarloResult && monteCarloResult.pnlPercentile < 80;
  const noGo4 = sensResult.failures.length > 2;
  const noGo5 = metrics.maxDrawdown > 20;

  let verdict, proceed, conditions;

  if (noGo1 || (noGo2 && metrics.totalTrades >= 50)) {
    verdict = 'NO-GO';
    proceed = false;
    conditions = 'Strategy failed on unseen test data.';
  } else if (condition1 && condition2 && condition3 && condition4 && condition5 && condition6) {
    verdict = 'GO';
    proceed = true;
    conditions = 'All conditions met. Proceed to live bot implementation.';
  } else if (metrics.winRate !== null && metrics.winRate >= calculateBreakevenWR(0.90) && binomResult.pValue !== null && binomResult.pValue < 0.05) {
    verdict = 'MARGINAL';
    proceed = true;
    conditions = `WR (${formatPct(metrics.winRate)}) >= 90% payout breakeven (${formatPct(calculateBreakevenWR(0.90))}). Proceed with 90%+ payout only.`;
  } else {
    verdict = 'NO-GO';
    proceed = false;
    conditions = 'Too many conditions not met.';
  }

  report.decision = {
    verdict,
    proceed,
    conditions,
    goChecks: {
      wrAboveBreakeven: condition1,
      binomialSignificant: condition2,
      monteCarloTop20: condition3,
      sensitivityPass: condition4,
      maxDDAcceptable: condition5,
      minTrades: condition6,
      goConditionsMet: goConditions,
      goConditionsTotal: goTotal,
    },
    reasons: [],
  };

  if (condition1) report.decision.reasons.push(`WR (${formatPct(metrics.winRate)}) above breakeven (${formatPct(breakevenWR)})`);
  if (condition2) report.decision.reasons.push(`Binomial test p-value (${formatNumber(binomResult.pValue)}) < 0.10`);
  if (condition3) report.decision.reasons.push(`Monte Carlo PnL in ${monteCarloResult ? monteCarloResult.pnlPercentile.toFixed(0) : 'N/A'}th percentile`);
  if (condition4) report.decision.reasons.push('Sensitivity: all parameter variations pass');
  if (condition5) report.decision.reasons.push(`Max drawdown (${formatMoney(-metrics.maxDrawdown)}) <= 20%`);
  if (condition6) report.decision.reasons.push(`Sufficient trades (${metrics.totalTrades})`);

  if (noGo1) report.decision.reasons.push(`❌ WR (${formatPct(metrics.winRate)}) below 50% on test data`);
  if (noGo2) report.decision.reasons.push(`❌ Binomial test p-value (${formatNumber(binomResult.pValue)}) >= 0.10`);
  if (noGo3) report.decision.reasons.push(`❌ Monte Carlo PnL in ${monteCarloResult ? monteCarloResult.pnlPercentile.toFixed(0) : 'N/A'}th percentile (below 80th)`);

  const outDir = path.resolve(__dirname, '..', 'data', 'validation-results');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outDir, 'validation-report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'sensitivity-results.json'), JSON.stringify(sensResult, null, 2));
  if (monteCarloResult) {
    fs.writeFileSync(path.join(outDir, 'monte-carlo-histogram.json'), JSON.stringify(monteCarloResult.histogram, null, 2));
  }

  const summary = [];
  summary.push('VALIDATION GATE REPORT');
  summary.push(''.padEnd(50, '='));
  summary.push('');
  summary.push(`Symbol:      ${baseParams.symbol} ${baseParams.direction}`);
  summary.push(`Test ticks:  ${splits.test.length.toLocaleString()}`);
  summary.push(`Data unseen: ${dataOk ? 'Yes' : 'No'}`);
  summary.push('');
  summary.push('Primary Results:');
  summary.push(`  Win Rate:          ${formatPct(metrics.winRate)} (${metrics.wins} / ${metrics.totalTrades})`);
  summary.push(`  Net Profit:        ${formatMoney(metrics.netProfit)}`);
  summary.push(`  Profit Factor:     ${formatNumber(metrics.profitFactor)}`);
  summary.push(`  Sharpe Ratio:      ${formatNumber(metrics.sharpeRatio)}`);
  summary.push(`  Max Drawdown:      ${formatMoney(-metrics.maxDrawdown)}`);
  summary.push(`  Max Consec Loss:   ${metrics.maxConsecutiveLosses}`);
  summary.push(`  Trades:            ${metrics.totalTrades}`);
  summary.push(`  Trades/Day:        ${metrics.tradesPerDay.toFixed(1)}`);
  summary.push('');
  summary.push('Breakeven at 85% payout: ' + formatPct(breakevenWR));
  summary.push(`Observed WR: ${formatPct(metrics.winRate)} — ${metrics.winRate >= breakevenWR ? '✅ ABOVE' : '❌ BELOW'}`);
  summary.push('');
  summary.push('Binomial Test (H0: WR = ' + formatPct(breakevenWR) + '):');
  summary.push(`  p-value:     ${formatNumber(binomResult.pValue)}`);
  summary.push(`  Significant: ${binomResult.significant}`);
  summary.push('');
  if (monteCarloResult) {
    summary.push('Monte Carlo (10,000 iterations, direction randomization):');
    summary.push(`  Actual WR:        ${formatPct(monteCarloResult.actualWR)}`);
    summary.push(`  WR Percentile:    ${monteCarloResult.wrPercentile.toFixed(1)}%`);
    summary.push(`  PnL Percentile:   ${monteCarloResult.pnlPercentile.toFixed(1)}%`);
    summary.push(`  Top 10% WR:       ${monteCarloResult.top10percentWR ? 'Yes' : 'No'}`);
    summary.push('');
  }
  summary.push('Sensitivity Analysis:');
  summary.push(`  All pass:          ${sensResult.allPass ? 'Yes' : 'No'}`);
  summary.push(`  Failures:          ${sensResult.failures.length}`);
  summary.push(`  Worst WR:          ${formatPct(sensResult.worstCaseWR)}`);
  if (sensResult.failures.length > 0) {
    for (const f of sensResult.failures) {
      summary.push(`    - ${f.param} = ${f.testValue}: WR ${formatPct(f.winRate)}`);
    }
  }
  summary.push('');
  summary.push('Payout Scenarios:');
  for (const pr of payoutResults) {
    summary.push(`  ${pr.pctFormat}: breakeven ${formatPct(pr.breakevenWR)} → WR ${formatPct(pr.strategyWR)} — ${pr.verdict}`);
  }
  summary.push('');
  summary.push(''.padEnd(50, '='));
  summary.push(`DECISION: ${verdict}`);
  summary.push(`Proceed: ${proceed ? 'YES' : 'NO'}`);
  summary.push(conditions);
  summary.push(''.padEnd(50, '='));

  fs.writeFileSync(path.join(outDir, 'validation-summary.txt'), summary.join('\n'));

  console.log(summary.join('\n'));
  console.log('');
  console.log(`Report saved to: ${outDir}`);
  console.log('');
}

main();
