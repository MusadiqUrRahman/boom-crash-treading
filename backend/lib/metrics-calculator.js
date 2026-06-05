function computeMetrics(trades, uniqueDays) {
  if (!trades || trades.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: null,
      profitFactor: null,
      netProfit: 0,
      sharpeRatio: null,
      maxDrawdown: 0,
      maxConsecutiveLosses: 0,
      avgWin: null,
      avgLoss: null,
      winLossRatio: null,
      tradesPerDay: 0,
    };
  }

  const totalTrades = trades.length;
  const pnls = trades.map(t => t.pnl);
  const wins = trades.filter(t => t.win);
  const losses = trades.filter(t => !t.win);
  const winCount = wins.length;
  const lossCount = losses.length;

  const winRate = winCount / totalTrades;

  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

  const netProfit = pnls.reduce((s, v) => s + v, 0);

  let maxDrawdown = 0;
  let peak = 0;
  let cumulative = 0;
  for (let i = 0; i < pnls.length; i++) {
    cumulative += pnls[i];
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  let maxConsecutiveLosses = 0;
  let currentStreak = 0;
  for (let i = 0; i < trades.length; i++) {
    if (!trades[i].win) {
      currentStreak++;
      if (currentStreak > maxConsecutiveLosses) maxConsecutiveLosses = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  const avgWin = winCount > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / winCount : null;
  const avgLoss = lossCount > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0)) / lossCount : null;
  const winLossRatio = avgWin !== null && avgLoss !== null && avgLoss > 0 ? avgWin / avgLoss : null;

  const daysCount = Math.max(1, uniqueDays);
  const tradesPerDay = totalTrades / daysCount;

  let sharpeRatio = null;
  if (pnls.length >= 2) {
    const meanPnl = pnls.reduce((s, v) => s + v, 0) / pnls.length;
    let sumSq = 0;
    for (let i = 0; i < pnls.length; i++) sumSq += (pnls[i] - meanPnl) ** 2;
    const stdPnl = Math.sqrt(sumSq / (pnls.length - 1));
    if (stdPnl > 1e-10) {
      sharpeRatio = (meanPnl / stdPnl) * Math.sqrt(tradesPerDay);
    }
  }

  return {
    totalTrades,
    wins: winCount,
    losses: lossCount,
    winRate,
    profitFactor,
    netProfit,
    sharpeRatio,
    maxDrawdown,
    maxConsecutiveLosses,
    avgWin,
    avgLoss,
    winLossRatio,
    tradesPerDay,
  };
}

module.exports = { computeMetrics };
