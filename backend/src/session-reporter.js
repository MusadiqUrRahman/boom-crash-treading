const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

class SessionReporter {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.reportDir = config.reportDir || path.join(__dirname, '..', 'reports', 'daily');
    this.dbPath = config.liveTradesDbPath || './data/live_trades.db';
    this.lastReportDate = '';
  }

  ensureDir() {
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  checkAndGenerate() {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (today === this.lastReportDate) return false;

    const db = new Database(this.dbPath);
    db.pragma('journal_mode = WAL');

    try {
      const trades = db.prepare(
        "SELECT * FROM trades WHERE DATE(created_at, 'localtime') = ? ORDER BY id"
      ).all(today);

      if (trades.length === 0) {
        this.lastReportDate = today;
        return false;
      }

      this.ensureDir();
      const report = this._buildReport(trades, today);
      this._writeReport(report, today);
      this.lastReportDate = today;
      this.logger.info('SessionReporter', `Daily report generated: ${today} (${trades.length} trades)`);
      return report;
    } finally {
      db.close();
    }
  }

  _buildReport(trades, date) {
    const wins = trades.filter(t => t.win === 1);
    const losses = trades.filter(t => t.win === 0);
    const totalPnL = trades.reduce((s, t) => s + (t.pnl || 0), 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + Math.abs(t.pnl), 0) / losses.length : 0;
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

    const tradesByHour = {};
    for (const t of trades) {
      const hour = t.created_at ? new Date(t.created_at + 'Z').getUTCHours() : 0;
      tradesByHour[hour] = (tradesByHour[hour] || 0) + 1;
      tradesByHour[`${hour}_wins`] = (tradesByHour[`${hour}_wins`] || 0) + (t.win ? 1 : 0);
    }

    let bestHour = 0, worstHour = 0;
    let bestWR = 0, worstWR = 1;
    for (let h = 0; h < 24; h++) {
      const total = tradesByHour[h] || 0;
      const w = tradesByHour[`${h}_wins`] || 0;
      if (total >= 3) {
        const wr = w / total;
        if (wr > bestWR) { bestWR = wr; bestHour = h; }
        if (wr < worstWR) { worstWR = wr; worstHour = h; }
      }
    }

    const startBalance = trades.length > 0 ? ((trades[0].balance_after ?? 0) - (trades[0].pnl ?? 0)) : 0;
    const endBalance = trades.length > 0 ? (trades[trades.length - 1].balance_after ?? trades[trades.length - 1].balance_before ?? 0) : 0;
    const maxDrawdown = this._calcMaxDrawdown(trades);
    const maxConsecutiveWins = this._calcMaxConsecutive(trades, 1);
    const maxConsecutiveLosses = this._calcMaxConsecutive(trades, 0);

    return {
      date,
      symbol: this.config.symbol,
      direction: this.config.direction,
      parameters: {
        durationTicks: this.config.durationTicks,
        scoreThreshold: this.config.scoreThreshold,
        cooldownTicks: this.config.cooldownTicks,
        rsiOversold: this.config.rsiOversold,
        rsiOverbought: this.config.rsiOverbought,
        bbPeriod: this.config.bbPeriod,
        bbStdDev: this.config.bbStdDev,
        emaShortPeriod: this.config.emaShortPeriod,
        emaLongPeriod: this.config.emaLongPeriod,
        rocPeriod: this.config.rocPeriod,
      },
      account: {
        startBalance,
        endBalance,
        dailyReturn: startBalance > 0 ? (endBalance - startBalance) / startBalance : 0,
        totalPnL,
        maxDrawdown,
      },
      trades: {
        total: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: trades.length > 0 ? wins.length / trades.length : 0,
        avgWin,
        avgLoss,
        profitFactor: profitFactor === Infinity ? Infinity : profitFactor,
        maxConsecutiveWins,
        maxConsecutiveLosses,
        averageStake: trades.reduce((s, t) => s + t.stake, 0) / trades.length,
        totalStake: trades.reduce((s, t) => s + t.stake, 0),
      },
      timeAnalysis: {
        bestHour,
        worstHour,
        bestHourWR: bestWR,
        worstHourWR: worstWR,
        tradesByHour,
      },
    };
  }

  _calcMaxDrawdown(trades) {
    let peak = 0, maxDd = 0;
    for (const t of trades) {
      const bal = t.balance_after ?? 0;
      if (bal > peak) peak = bal;
      const dd = peak - bal;
      if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
  }

  _calcMaxConsecutive(trades, type) {
    let max = 0, cur = 0;
    for (const t of trades) {
      if (t.win === type) {
        cur++;
        if (cur > max) max = cur;
      } else {
        cur = 0;
      }
    }
    return max;
  }

  _writeReport(report, date) {
    const jsonPath = path.join(this.reportDir, `${date}-summary.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    const txtPath = path.join(this.reportDir, `${date}-summary.txt`);
    const lines = [
      `=== Daily Report: ${date} ===`,
      `Symbol: ${report.symbol} | Direction: ${report.direction}`,
      '',
      `--- Account ---`,
      `Start Balance: $${report.account.startBalance.toFixed(2)}`,
      `End Balance:   $${report.account.endBalance.toFixed(2)}`,
      `Daily Return:  ${(report.account.dailyReturn * 100).toFixed(2)}%`,
      `Max Drawdown:  $${report.account.maxDrawdown.toFixed(2)}`,
      '',
      `--- Trades ---`,
      `Total:   ${report.trades.total}`,
      `Wins:    ${report.trades.wins}`,
      `Losses:  ${report.trades.losses}`,
      `Win Rate: ${(report.trades.winRate * 100).toFixed(1)}%`,
      `Avg Win:  $${report.trades.avgWin.toFixed(4)}`,
      `Avg Loss: $${report.trades.avgLoss.toFixed(4)}`,
      `Profit Factor: ${report.trades.profitFactor === Infinity ? '∞' : report.trades.profitFactor.toFixed(2)}`,
      `Max Consec Wins:  ${report.trades.maxConsecutiveWins}`,
      `Max Consec Losses: ${report.trades.maxConsecutiveLosses}`,
      '',
      `--- Time Analysis ---`,
      `Best Hour (UTC):  ${report.timeAnalysis.bestHour} (WR ${(report.timeAnalysis.bestHourWR * 100).toFixed(0)}%)`,
      `Worst Hour (UTC): ${report.timeAnalysis.worstHour} (WR ${(report.timeAnalysis.worstHourWR * 100).toFixed(0)}%)`,
      '========================',
    ];
    fs.writeFileSync(txtPath, lines.join('\n'));
  }
}

module.exports = SessionReporter;
