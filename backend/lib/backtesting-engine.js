const IndicatorEngine = require('./indicator-engine');
const { computeScore } = require('./scoring-engine');
const { simulateTrade, simulateMultiplierTrade } = require('./trade-simulator');

const STATES = {
  COLLECTING: 'COLLECTING',
  SCORING: 'SCORING',
  SCORE_READY: 'SCORE_READY',
  DECISION: 'DECISION',
  ENTERING: 'ENTERING',
  IN_POSITION: 'IN_POSITION',
  RESOLVING: 'RESOLVING',
  COOLDOWN: 'COOLDOWN',
  STOPPED: 'STOPPED',
};

class BacktestingEngine {
  constructor(config, tickData) {
    this.config = config;
    this.tickData = tickData;
    this.indicatorEngine = new IndicatorEngine(config.tickBufferSize);

    this.state = STATES.COLLECTING;
    this.currentTickIndex = 0;
    this.cooldownRemaining = 0;
    this.pendingExitIndex = -1;
    this.currentTrade = null;

    this.trades = [];
    this.accountBalance = config.startingBalance || 100;
    this.cumulativePnl = 0;
    this.peakBalance = this.accountBalance;
    this.maxDrawdown = 0;
    this.consecutiveLosses = 0;
    this.dailyTrades = 0;
    this.dailyLoss = 0;
    this.currentDay = null;
    this.tradeCounter = 0;

    this.uniqueDays = new Set();
  }

  _formatTradeId(index) {
    return `BC-${String(index + 1).padStart(4, '0')}`;
  }

  _getDayFromEpoch(epoch) {
    return Math.floor(epoch / 86400);
  }

  _checkDayReset(epoch) {
    const day = this._getDayFromEpoch(epoch);
    if (this.currentDay !== day) {
      this.currentDay = day;
      this.dailyTrades = 0;
      this.dailyLoss = 0;
      this.uniqueDays.add(day);
    }
  }

  _checkRiskLimits() {
    if (this.consecutiveLosses >= this.config.maxConsecutiveLosses) return false;
    if (this.dailyTrades >= this.config.maxDailyTrades) return false;
    if (this.dailyLoss >= this.config.maxDailyLoss) return false;
    return true;
  }

  _updateDrawdown() {
    if (this.accountBalance > this.peakBalance) {
      this.peakBalance = this.accountBalance;
    }
    const drawdown = this.peakBalance - this.accountBalance;
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }
  }

  _transition(tick) {
    const epoch = tick.epoch;
    const price = tick.quote;
    const idx = this.currentTickIndex;

    switch (this.state) {
      case STATES.COLLECTING:
        this.indicatorEngine.addPrice(price);
        if (this.indicatorEngine.priceCount >= this.config.minTicksBeforeTrade) {
          this.state = STATES.SCORING;
        }
        break;

      case STATES.SCORING:
        this.indicatorEngine.addPrice(price);

        if (this.indicatorEngine.priceCount < this.config.minTicksBeforeTrade) {
          this.state = STATES.COLLECTING;
          break;
        }

        const emaShortVal = this.indicatorEngine.ema(this.config.emaShortPeriod);

        const indicators = {
          rsi: this.indicatorEngine.rsi(14),
          bb: this.indicatorEngine.bollingerBands(this.config.bbPeriod, this.config.bbStdDev),
          emaShort: emaShortVal,
          emaDistance: emaShortVal !== null
            ? (price - emaShortVal) / price
            : null,
          deltaAlignment: this.indicatorEngine.deltaAlignment(5, this.config.direction),
          roc: this.indicatorEngine.roc(this.config.rocPeriod),
          deltas: this.indicatorEngine.deltas(5),
          _rawPrices: this.indicatorEngine.prices,
        };

        const score = computeScore(indicators, this.config);

        if (score.enter) {
          this._currentScore = score;
          this.state = STATES.SCORE_READY;
        }
        break;

      case STATES.SCORE_READY:
        this._checkDayReset(epoch);

        if (!this._checkRiskLimits()) {
          this.state = STATES.STOPPED;
          break;
        }

        this.state = STATES.DECISION;
        break;

      case STATES.DECISION:
        this.pendingExitIndex = idx + this.config.durationTicks;
        if (this.pendingExitIndex >= this.tickData.length) {
          this.state = STATES.SCORING;
          break;
        }

        this.currentTrade = {
          tradeId: this._formatTradeId(this.tradeCounter),
          entryTick: idx,
          entryPrice: price,
          entryTime: epoch,
          direction: this.config.direction,
          durationTicks: this.config.durationTicks,
          contractType: this.config.contractType,
          score: this._currentScore.score,
          scoreComponents: this._currentScore.components,
        };

        this.state = STATES.ENTERING;
        break;

      case STATES.ENTERING:
        this.state = STATES.IN_POSITION;
        break;

      case STATES.IN_POSITION:
        if (this.config.contractType && this.config.contractType.startsWith('MULT')) {
          this.state = STATES.RESOLVING;
        } else if (idx >= this.pendingExitIndex) {
          this.state = STATES.RESOLVING;
        }
        break;

      case STATES.RESOLVING:
        let result;
        if (this.config.contractType && this.config.contractType.startsWith('MULT')) {
          result = simulateMultiplierTrade(
            this.currentTrade.entryTick,
            this.currentTrade.entryPrice,
            this.currentTrade.direction,
            this.tickData.map(t => t.quote),
            this.config.stake,
            this.config.multiplier || 500,
            this.config.stopLoss || 1.00,
            this.config.takeProfit || 2.00,
            this.config.maxMlDurationTicks || 100,
            this.config.trailDistance || 0
          );
        } else {
          result = simulateTrade(
            this.currentTrade.entryTick,
            this.currentTrade.entryPrice,
            this.currentTrade.direction,
            this.config.durationTicks,
            this.config.payoutRate,
            this.config.stake,
            this.config.allowEquals,
            this.tickData.map(t => t.quote)
          );
        }

        if (result) {
          this.tradeCounter++;
          this._checkDayReset(epoch);

          const tradeRecord = {
            ...this.currentTrade,
            exitTick: result.exitIndex,
            exitTime: result.exitIndex !== undefined
              ? this.tickData[Math.min(result.exitIndex, this.tickData.length - 1)].epoch
              : epoch,
            exitPrice: result.exitPrice,
            win: result.win,
            pnl: result.pnl,
            exitReason: result.exitReason,
          };

          this.trades.push(tradeRecord);
          this.cumulativePnl += result.pnl;
          this.accountBalance += result.pnl;
          this._updateDrawdown();

          if (result.win) {
            this.consecutiveLosses = 0;
          } else {
            this.consecutiveLosses++;
            this.dailyLoss += Math.abs(result.pnl);
          }

          this.dailyTrades++;

          const lastTrade = this.trades[this.trades.length - 1];
          lastTrade.cumulativePnl = this.cumulativePnl;
          lastTrade.accountBalance = this.accountBalance;
          lastTrade.maxDrawdown = this.maxDrawdown;
        }

        this.currentTrade = null;
        this._currentScore = null;
        this.cooldownRemaining = this.config.cooldownTicks;
        this.state = STATES.COOLDOWN;
        break;

      case STATES.COOLDOWN:
        this.indicatorEngine.addPrice(price);
        this.cooldownRemaining--;
        if (this.cooldownRemaining <= 0) {
          this.state = STATES.COLLECTING;
        }
        break;

      case STATES.STOPPED:
        break;
    }
  }

  run() {
    for (let i = 0; i < this.tickData.length; i++) {
      this.currentTickIndex = i;
      const tick = this.tickData[i];
      this._transition(tick);
      if (this.state === STATES.STOPPED) break;
    }

    return this.getResults();
  }

  getResults() {
    const equityCurve = [];
    let runningPnl = 0;
    for (let i = 0; i < this.trades.length; i++) {
      runningPnl += this.trades[i].pnl;
      equityCurve.push(runningPnl);
    }

    return {
      config: this.config,
      trades: this.trades,
      equityCurve,
      stoppedEarly: this.state === STATES.STOPPED,
      ticksProcessed: this.currentTickIndex + 1,
    };
  }
}

module.exports = { BacktestingEngine, STATES };
