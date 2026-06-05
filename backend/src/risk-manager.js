class RiskManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.consecutiveLosses = 0;
    this.dailyLoss = 0;
    this.dailyTrades = 0;
    this.dailyWins = 0;
    this.dailyPnL = 0;
    this.startingBalance = config.startingBalance || 100;
    this.currentBalance = this.startingBalance;
    this.today = new Date().toDateString();
    this.maxDailyDrawdown = config.maxDailyDrawdown || 0.10;
  }

  canTrade() {
    if (this.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      return { allowed: false, reason: `max_consecutive_losses (${this.consecutiveLosses})` };
    }

    if (this.dailyLoss >= this.config.maxDailyLoss) {
      return { allowed: false, reason: `max_daily_loss (${this.dailyLoss.toFixed(2)})` };
    }

    if (this.dailyTrades >= this.config.maxDailyTrades) {
      return { allowed: false, reason: `max_daily_trades (${this.dailyTrades})` };
    }

    const drawdown = this.startingBalance - this.currentBalance;
    if (drawdown > this.startingBalance * this.maxDailyDrawdown) {
      return { allowed: false, reason: `max_daily_drawdown (${(drawdown / this.startingBalance * 100).toFixed(1)}%)` };
    }

    if (this.currentBalance < this.config.minStake) {
      return { allowed: false, reason: 'insufficient_balance' };
    }

    return { allowed: true };
  }

  recordTrade(result) {
    this._checkNewDay();

    this.dailyTrades++;
    if (result.win) {
      this.dailyWins++;
      this.consecutiveLosses = 0;
      this.currentBalance += result.pnl;
      this.dailyPnL += result.pnl;
    } else {
      this.consecutiveLosses++;
      this.dailyLoss += Math.abs(result.pnl);
      this.currentBalance += result.pnl;
      this.dailyPnL += result.pnl;
    }

    this.logger.info('RiskManager', `PnL: ${result.pnl >= 0 ? '+' : ''}${result.pnl.toFixed(4)} Balance: ${this.currentBalance.toFixed(2)} Daily: ${this.dailyTrades}t ${this.dailyPnL >= 0 ? '+' : ''}${this.dailyPnL.toFixed(2)}`);
  }

  _checkNewDay() {
    const today = new Date().toDateString();
    if (today !== this.today) {
      this.resetDaily();
    }
  }

  resetDaily() {
    this.dailyLoss = 0;
    this.dailyTrades = 0;
    this.dailyWins = 0;
    this.dailyPnL = 0;
    this.today = new Date().toDateString();
    this.logger.info('RiskManager', `Daily limits reset for ${this.today}`);
  }

  restoreFromDb(stats) {
    if (!stats || !stats.total) return;
    this.dailyTrades = stats.total || 0;
    this.dailyWins = stats.wins || 0;
    this.dailyLoss = Math.abs(stats.loss || 0);
    this.dailyPnL = stats.netPnl || 0;
    this.consecutiveLosses = stats.consecutiveLosses || 0;
    this.currentBalance = this.startingBalance + (stats.netPnl || 0);
    this.logger.info('RiskManager', `Session restored: ${this.dailyTrades}t ${this.dailyWins}W PnL=${this.dailyPnL >= 0 ? '+' : ''}${this.dailyPnL.toFixed(2)} balance=${this.currentBalance.toFixed(2)}`);
  }

  getStatus() {
    const drawdown = this.startingBalance - this.currentBalance;
    return {
      balance: this.currentBalance,
      dailyTrades: this.dailyTrades,
      dailyPnL: this.dailyPnL,
      dailyLoss: this.dailyLoss,
      consecutiveLosses: this.consecutiveLosses,
      drawdown: drawdown,
      drawdownPct: (drawdown / this.startingBalance * 100).toFixed(1),
      dailyWins: this.dailyWins,
      dailyWinRate: this.dailyTrades > 0 ? (this.dailyWins / this.dailyTrades * 100).toFixed(1) : '0.0',
    };
  }
}

module.exports = RiskManager;
