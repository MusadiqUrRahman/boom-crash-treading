const { BacktestingEngine } = require('./backtesting-engine');
const { computeMetrics } = require('./metrics-calculator');

const SENSITIVITY_PARAMS = [
  { name: 'durationTicks', steps: [-5, 5] },
  { name: 'scoreThreshold', steps: [-1, 1] },
  { name: 'rsiOversold', steps: [-5, 5] },
  { name: 'rsiOverbought', steps: [-5, 5] },
  { name: 'bbPeriod', steps: [-10, 10] },
  { name: 'cooldownTicks', steps: [-2, 2] },
];

function runSensitivityAnalysis(baseParams, ticks, breakevenWR) {
  const results = [];

  for (const param of SENSITIVITY_PARAMS) {
    const baseValue = baseParams[param.name];
    if (baseValue === undefined) continue;

    for (const step of param.steps) {
      const newValue = baseValue + step;
      const testParams = { ...baseParams, [param.name]: newValue };

      const engine = new BacktestingEngine(testParams, ticks);
      const engineResults = engine.run();
      const metrics = computeMetrics(engineResults.trades, engine.uniqueDays.size);

      results.push({
        param: param.name,
        baseValue,
        testValue: newValue,
        step,
        winRate: metrics.winRate,
        totalTrades: metrics.totalTrades,
        aboveBreakeven: metrics.winRate !== null && metrics.winRate >= breakevenWR,
      });
    }
  }

  const failures = results.filter(r => !r.aboveBreakeven);
  const allPass = failures.length === 0;
  const worstWR = results.reduce((worst, r) => {
    if (r.winRate === null) return worst;
    return worst === null || r.winRate < worst ? r.winRate : worst;
  }, null);

  return { allPass, failures, worstCaseWR: worstWR, variations: results };
}

module.exports = { runSensitivityAnalysis, SENSITIVITY_PARAMS };
