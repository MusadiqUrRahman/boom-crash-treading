const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function buildReport(trades, date) {
  if (trades.length === 0) return null;

  const wins = trades.filter(t => t.win === 1);
  const losses = trades.filter(t => t.win === 0);

  let runningPnl = 0;
  let peak = 0, maxDD = 0;
  let maxConsecWins = 0, maxConsecLosses = 0, curW = 0, curL = 0;

  const tradesByHour = {};
  for (const t of trades) {
    const pnl = t.pnl || 0;
    runningPnl += pnl;
    if (runningPnl > peak) peak = runningPnl;
    const dd = peak - runningPnl;
    if (dd > maxDD) maxDD = dd;

    if (t.win === 1) { curW++; curL = 0; if (curW > maxConsecWins) maxConsecWins = curW; }
    else if (t.win === 0) { curL++; curW = 0; if (curL > maxConsecLosses) maxConsecLosses = curL; }

    const hour = t.created_at ? new Date(t.created_at + 'Z').getUTCHours() : 0;
    tradesByHour[hour] = (tradesByHour[hour] || 0) + 1;
    tradesByHour[`${hour}_wins`] = (tradesByHour[`${hour}_wins`] || 0) + (t.win ? 1 : 0);
  }

  const totalPnL = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + Math.abs(t.pnl), 0) / losses.length : 0;

  let bestHour = 0, worstHour = 0, bestWR = 0, worstWR = 1;
  for (let h = 0; h < 24; h++) {
    const total = tradesByHour[h] || 0;
    const w = tradesByHour[`${h}_wins`] || 0;
    if (total >= 3) {
      const wr = w / total;
      if (wr > bestWR) { bestWR = wr; bestHour = h; }
      if (wr < worstWR) { worstWR = wr; worstHour = h; }
    }
  }

  return {
    date,
    symbol: trades[0].symbol,
    direction: trades[0].direction,
    account: {
      startBalance: 0,
      endBalance: Math.round(totalPnL * 100) / 100,
      dailyReturn: 0,
      totalPnL: Math.round(totalPnL * 100) / 100,
      maxDrawdown: Math.round(maxDD * 100) / 100,
    },
    trades: {
      total: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length > 0 ? Math.round((wins.length / trades.length) * 10000) / 10000 : 0,
      avgWin: Math.round(avgWin * 10000) / 10000,
      avgLoss: Math.round(avgLoss * 10000) / 10000,
      profitFactor,
      maxConsecutiveWins: maxConsecWins,
      maxConsecutiveLosses: maxConsecLosses,
      averageStake: Math.round(trades.reduce((s, t) => s + t.stake, 0) / trades.length * 10000) / 10000,
      totalStake: Math.round(trades.reduce((s, t) => s + t.stake, 0) * 100) / 100,
    },
    timeAnalysis: {
      bestHour,
      worstHour,
      bestHourWR: Math.round(bestWR * 10000) / 10000,
      worstHourWR: Math.round(worstWR * 10000) / 10000,
      tradesByHour,
    },
  };
}

function formatPct(v) {
  return (v * 100).toFixed(2) + '%';
}

function formatMoney(v) {
  return (v >= 0 ? '+' : '') + '$' + v.toFixed(2);
}

function formatTxt(report) {
  const r = report;
  return [
    '======================================================',
    `  Daily Report: ${r.date}`,
    `  Symbol: ${r.symbol} | Direction: ${r.direction}`,
    '======================================================',
    '',
    '  Account:',
    `    Start PnL:  $0.00`,
    `    End PnL:    $${r.account.endBalance.toFixed(2)}`,
    `    Max Drawdown: $${r.account.maxDrawdown.toFixed(2)}`,
    '',
    '  Trades:',
    `    Total:    ${r.trades.total}`,
    `    Wins:     ${r.trades.wins}`,
    `    Losses:   ${r.trades.losses}`,
    `    Win Rate: ${formatPct(r.trades.winRate)}`,
    `    PnL:      ${formatMoney(r.account.totalPnL)}`,
    `    Avg Win:  $${r.trades.avgWin.toFixed(4)}`,
    `    Avg Loss: $${r.trades.avgLoss.toFixed(4)}`,
    `    Profit Factor: ${r.trades.profitFactor === Infinity ? '∞' : r.trades.profitFactor.toFixed(2)}`,
    `    Max Consec Wins:  ${r.trades.maxConsecutiveWins}`,
    `    Max Consec Losses: ${r.trades.maxConsecutiveLosses}`,
    '',
    '  Time Analysis:',
    `    Best Hour (UTC):  ${r.timeAnalysis.bestHour} (WR ${(r.timeAnalysis.bestHourWR * 100).toFixed(0)}%)`,
    `    Worst Hour (UTC): ${r.timeAnalysis.worstHour} (WR ${(r.timeAnalysis.worstHourWR * 100).toFixed(0)}%)`,
    '======================================================',
  ].join('\n');
}

function generateForDate(dateStr, dbPath, outDir) {
  const db = new Database(dbPath);
  try {
    const rows = db.prepare("SELECT * FROM trades WHERE DATE(created_at) = ? ORDER BY id").all(dateStr);
    if (rows.length === 0) { console.log('No trades for ' + dateStr); return; }

    const groups = {};
    for (const r of rows) {
      const key = r.symbol + '|' + r.direction;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }

    for (const key of Object.keys(groups).sort()) {
      const report = buildReport(groups[key], dateStr);
      if (!report) continue;

      const suffix = `${dateStr}-${report.symbol}-${report.direction}`;
      fs.writeFileSync(path.join(outDir, `${suffix}-summary.json`), JSON.stringify(report, null, 2));
      fs.writeFileSync(path.join(outDir, `${suffix}-summary.txt`), formatTxt(report));
      console.log(`Generated: ${suffix}`);
    }
  } finally { db.close(); }
}

function generateAll(dbPath, outDir) {
  const db = new Database(dbPath);
  try {
    const dates = db.prepare("SELECT DISTINCT DATE(created_at) as day FROM trades ORDER BY day").all();
    for (const d of dates) generateForDate(d.day, dbPath, outDir);
  } finally { db.close(); }
}

module.exports = { buildReport, generateForDate, generateAll };

function main() {
  const dbPath = path.resolve(__dirname, '..', 'data', 'live_trades.db');
  const outDir = path.resolve(__dirname, '..', 'reports', 'daily');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const dateArg = process.argv[2];
  if (dateArg === '--all' || !dateArg) generateAll(dbPath, outDir);
  else generateForDate(dateArg, dbPath, outDir);
}

if (require.main === module) main();
