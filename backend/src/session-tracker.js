class SessionTracker {
  constructor(logger) {
    this.logger = logger;
    this.resetAll();
  }

  resetAll() {
    this.sessionStart = new Date();
    this.trades = 0;
    this.wins = 0;
    this.losses = 0;
    this.totalPnL = 0;
    this.totalStake = 0;
    this.maxDrawdown = 0;
    this.peakBalance = 0;
    this.currentBalance = 0;
    this.consecutiveWins = 0;
    this.consecutiveLosses = 0;
  }

  recordTrade(tradeResult, balanceBefore) {
    this.trades++;
    this.totalStake += tradeResult.stake;

    if (tradeResult.win) {
      this.wins++;
      this.consecutiveWins++;
      this.consecutiveLosses = 0;
    } else {
      this.losses++;
      this.consecutiveLosses++;
      this.consecutiveWins = 0;
    }

    this.totalPnL += tradeResult.pnl;
    this.currentBalance = balanceBefore + tradeResult.pnl;

    if (this.currentBalance > this.peakBalance) {
      this.peakBalance = this.currentBalance;
    }

    const drawdown = this.peakBalance - this.currentBalance;
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }
  }

  getWinRate() {
    if (this.trades === 0) return 0;
    return this.wins / this.trades;
  }

  getProfitFactor() {
    if (this.totalPnL >= 0) return this.totalPnL > 0 ? Infinity : 0;
    const grossLoss = Math.abs(this.totalPnL);
    const grossProfit = this.wins > 0 ? (this.totalPnL + grossLoss) : this.totalPnL;
    return grossProfit / grossLoss;
  }

  getAvgPnL() {
    if (this.trades === 0) return 0;
    return this.totalPnL / this.trades;
  }

  getStatus() {
    return {
      sessionDuration: Math.floor((new Date() - this.sessionStart) / 1000),
      trades: this.trades,
      wins: this.wins,
      losses: this.losses,
      winRate: (this.getWinRate() * 100).toFixed(1),
      totalPnL: this.totalPnL,
      avgPnL: this.getAvgPnL(),
      profitFactor: this.getProfitFactor() === Infinity ? 'Inf' : this.getProfitFactor().toFixed(2),
      maxDrawdown: this.maxDrawdown.toFixed(2),
      consecutiveWins: this.consecutiveWins,
      consecutiveLosses: this.consecutiveLosses,
      totalStake: this.totalStake.toFixed(2),
    };
  }

  printSummary() {
    const s = this.getStatus();
    this.logger.info('SessionTracker', '=== Session Summary ===');
    this.logger.info('SessionTracker', `Duration: ${s.sessionDuration}s | Trades: ${s.trades} | Win Rate: ${s.winRate}%`);
    this.logger.info('SessionTracker', `PnL: ${s.totalPnL >= 0 ? '+' : ''}${s.totalPnL.toFixed(4)} | Avg: ${s.avgPnL.toFixed(4)} | Profit Factor: ${s.profitFactor}`);
    this.logger.info('SessionTracker', `Max Drawdown: ${s.maxDrawdown} | Consecutive: ${s.consecutiveWins}W / ${s.consecutiveLosses}L`);
    this.logger.info('SessionTracker', '========================');
  }
}

module.exports = SessionTracker;
