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
    this._circuitBreakerTrippedAt = null;
    this._circuitBreakerTripsToday = 0;
    this._circuitBreakerCooldownMs = (config.circuitBreakerCooldownMin || 30) * 60 * 1000;
    this._maxCircuitBreakerTrips = config.maxCircuitBreakerTrips || 3;

    // Spike cluster detection
    this._spikeCount = 0;
    this._lastSpikeEpoch = 0;
    this._spikeClusterWindow = 500;
    this._spikeReductionActive = false;

    // Blacklisted hours (UTC) — 18:00 is historically worst
    this._blacklistedHours = [18];
  }

  canTrade() {
    // ---- Blacklisted hour check ----
    const currentHour = new Date().getUTCHours();
    if (this._blacklistedHours.includes(currentHour)) {
      return { allowed: false, reason: `blacklisted_hour: ${currentHour}:00 UTC` };
    }

    if (this.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      if (this._circuitBreakerTrippedAt === null) {
        this._circuitBreakerTrippedAt = Date.now();
        this._circuitBreakerTripsToday++;
        this.logger.warn('RiskManager', `Circuit breaker tripped at ${this.consecutiveLosses} consecutive losses (trip #${this._circuitBreakerTripsToday} today)`);
      }
      const elapsed = Date.now() - this._circuitBreakerTrippedAt;
      const remaining = this._circuitBreakerCooldownMs - elapsed;
      if (remaining > 0) {
        return {
          allowed: false,
          reason: `circuit_breaker: ${Math.ceil(remaining / 60000)}min cooldown remaining (${this.consecutiveLosses} consecutive losses)`,
        };
      }
      if (this._circuitBreakerTripsToday >= this._maxCircuitBreakerTrips) {
        return {
          allowed: false,
          reason: `circuit_breaker: max daily trips (${this._maxCircuitBreakerTrips}) reached`,
        };
      }
      this.logger.info('RiskManager', `Circuit breaker cooldown expired — resetting consecutive losses counter`);
      this._circuitBreakerTrippedAt = null;
      this.consecutiveLosses = 0;
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

  recordTick(price) {
    // Spike cluster detection: detect rapid price moves > 2% in one tick
    if (this._lastPrice !== undefined && this._lastPrice > 0) {
      const move = Math.abs(price - this._lastPrice) / this._lastPrice;
      if (move > 0.02) {
        const now = Math.floor(Date.now() / 1000);
        if (now - this._lastSpikeEpoch < this._spikeClusterWindow) {
          this._spikeCount++;
          if (this._spikeCount >= 3 && !this._spikeReductionActive) {
            this._spikeReductionActive = true;
            this.logger.warn('RiskManager', `Spike cluster detected: ${this._spikeCount} spikes in ${this._spikeClusterWindow}s — stake reduction active`);
          }
        } else {
          this._spikeCount = 1;
          this._spikeReductionActive = false;
        }
        this._lastSpikeEpoch = now;
      }
    }
    this._lastPrice = price;
  }

  isSpikeClusterActive() {
    return this._spikeReductionActive;
  }

  _checkNewDay() {
    const today = new Date().toDateString();
    if (today !== this.today) {
      this.resetDaily();
    }
  }

  setRealBalance(balance) {
    if (this.config.virtualBalance > 0) {
      this.logger.info('RiskManager', `Virtual balance active: using $${this.config.virtualBalance.toFixed(2)} instead of API balance $${(balance || 0).toFixed(2)}`);
      this.startingBalance = this.config.virtualBalance;
      this.currentBalance = this.config.virtualBalance;
      return;
    }
    if (typeof balance !== 'number' || balance <= 0) return;
    this.logger.info('RiskManager', `Setting real balance from Deriv API: $${balance.toFixed(2)} (was $${this.startingBalance.toFixed(2)})`);
    this.startingBalance = balance;
    this.currentBalance = balance;
  }

  updateLiveBalance(balance) {
    if (this.config.virtualBalance > 0) return;
    if (typeof balance !== 'number' || balance <= 0) return;
    this.currentBalance = balance;
  }

  resetDaily() {
    this.dailyLoss = 0;
    this.dailyTrades = 0;
    this.dailyWins = 0;
    this.dailyPnL = 0;
    this._circuitBreakerTripsToday = 0;
    this._circuitBreakerTrippedAt = null;
    this.today = new Date().toDateString();
    this.logger.info('RiskManager', `Daily limits reset for ${this.today}`);
  }

  restoreFromDb(stats) {
    if (!stats) return;
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
    const cbRemaining = this._circuitBreakerTrippedAt
      ? Math.max(0, this._circuitBreakerCooldownMs - (Date.now() - this._circuitBreakerTrippedAt))
      : 0;
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
      circuitBreaker: {
        tripped: this._circuitBreakerTrippedAt !== null,
        tripsToday: this._circuitBreakerTripsToday,
        maxTrips: this._maxCircuitBreakerTrips,
        cooldownRemainingMs: cbRemaining,
        cooldownRemainingMin: Math.ceil(cbRemaining / 60000),
      },
      spikeClusterActive: this._spikeReductionActive,
    };
  }
}

module.exports = RiskManager;