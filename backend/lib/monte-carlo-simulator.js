const { simulateTrade } = require('./trade-simulator');

function runMonteCarlo(trades, prices, config, iterations) {
  const actualWR = trades.length > 0 ? trades.filter(t => t.win).length / trades.length : 0;
  const simulatedWRs = [];
  const simulatedPnLs = [];
  const actualPnl = trades.reduce((s, t) => s + t.pnl, 0);

  for (let iter = 0; iter < iterations; iter++) {
    let wins = 0;
    let totalPnl = 0;

    for (let ti = 0; ti < trades.length; ti++) {
      const t = trades[ti];
      const direction = Math.random() < 0.5 ? 'CALL' : 'PUT';
      const result = simulateTrade(
        t.entryTick, t.entryPrice, direction, config.durationTicks,
        config.payoutRate, config.stake, config.allowEquals, prices
      );

      if (result) {
        if (result.win) wins++;
        totalPnl += result.pnl;
      }
    }

    simulatedWRs.push(wins / trades.length);
    simulatedPnLs.push(totalPnl);
  }

  simulatedWRs.sort((a, b) => a - b);
  simulatedPnLs.sort((a, b) => a - b);

  let wrPercentile = 0;
  for (let i = 0; i < simulatedWRs.length; i++) {
    if (actualWR >= simulatedWRs[i]) wrPercentile = (i + 1) / simulatedWRs.length;
  }

  let pnlPercentile = 0;
  for (let i = 0; i < simulatedPnLs.length; i++) {
    if (actualPnl >= simulatedPnLs[i]) pnlPercentile = (i + 1) / simulatedPnLs.length;
  }

  const histogram = generateHistogram(simulatedWRs, 20);

  return {
    actualWR,
    actualPnl,
    wrPercentile: wrPercentile * 100,
    pnlPercentile: pnlPercentile * 100,
    top10percentWR: wrPercentile >= 0.90,
    top10percentPnl: pnlPercentile >= 0.90,
    iterations,
    histogram,
  };
}

function generateHistogram(values, bins) {
  if (values.length === 0) return [];

  const min = values[0];
  const max = values[values.length - 1];
  const range = max - min;
  const binWidth = range / bins || 0.001;

  const hist = [];
  for (let i = 0; i < bins; i++) {
    const binMin = min + i * binWidth;
    const binMax = binMin + binWidth;
    const count = values.filter(v => v >= binMin && (i === bins - 1 ? v <= binMax : v < binMax)).length;
    hist.push({ binMin, binMax, count });
  }

  return hist;
}

module.exports = { runMonteCarlo, generateHistogram };
