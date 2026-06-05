const { ConnectionManager, STATE } = require('./connection-manager');
const TickStream = require('./tick-stream');
const IndicatorEngine = require('./indicator-engine');
const DecisionEngine = require('./decision-engine');
const TradeExecutor = require('./trade-executor');
const ContractMonitor = require('./contract-monitor');
const RiskManager = require('./risk-manager');
const StakeManager = require('./stake-manager');
const TradeLogger = require('./trade-logger');
const SessionTracker = require('./session-tracker');
const fs = require('fs');
const path = require('path');

const BOT_STATE = {
  INIT: 'INIT',
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  AUTHORIZING: 'AUTHORIZING',
  AUTHORIZED: 'AUTHORIZED',
  COLLECTING: 'COLLECTING',
  SCORING: 'SCORING',
  DECISION: 'DECISION',
  SKIP: 'SKIP',
  ENTERING: 'ENTERING',
  IN_POSITION: 'IN_POSITION',
  RESOLVING: 'RESOLVING',
  COOLDOWN: 'COOLDOWN',
  STOPPING: 'STOPPING',
  STOPPED: 'STOPPED',
  ERROR: 'ERROR',
};

class Bot {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.state = BOT_STATE.INIT;
    this.tickIndex = 0;
    this._running = false;
    this._stopRequested = false;
    this._stopFilePath = path.join(__dirname, '..', 'stop.txt');

    this.connectionManager = new ConnectionManager(config, logger);
    this.tickStream = new TickStream(config, this.connectionManager, logger);
    this.indicatorEngine = new IndicatorEngine(config);
    this.riskManager = new RiskManager(config, logger);
    this.stakeManager = new StakeManager(config);
    this.decisionEngine = new DecisionEngine(config, this.riskManager, logger);
    this.tradeExecutor = new TradeExecutor(config, this.connectionManager, logger);
    this.contractMonitor = new ContractMonitor(logger);
    this.tradeLogger = new TradeLogger(config.liveTradesDbPath || './data/live_trades.db');
    this.sessionTracker = new SessionTracker(logger);

    this._currentTrade = null;
    this._tradeInProgress = false;
    this._setupListeners();
  }

  async restoreSession() {
    try {
      const stats = this.tradeLogger.getTodayStats();
      if (stats && stats.total > 0) {
        this.riskManager.resetDaily();
        this.riskManager.restoreFromDb(stats);
        this.logger.info('Bot', `Session recovered: ${stats.total} trades today, $${stats.netPnl.toFixed(2)} PnL`);
      }
    } catch (err) {
      this.logger.warn('Bot', `Session recovery failed: ${err.message}`);
    }
  }

  _setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.logger.debug('Bot', `State: ${oldState} -> ${newState}`);
  }

  async start() {
    this._running = true;
    this._stopRequested = false;

    this.logger.info('Bot', `Starting bot for ${this.config.symbol}`);
    this.logger.info('Bot', `Mode: ${this.config.dryRun ? 'DRY-RUN' : 'LIVE'}`);
    this.logger.info('Bot', `Direction: ${this.config.direction}, Stake: ${this.config.stake}, Duration: ${this.config.durationTicks}t`);
    this.logger.info('Bot', `Score threshold: ${this.config.scoreThreshold}, Cooldown: ${this.config.cooldownTicks}`);

    this.tradeLogger.init();
    await this.restoreSession();

    this._setState(BOT_STATE.DISCONNECTED);
    await this.connectionManager.connect();
  }

  async stop() {
    this._stopRequested = true;
    this._setState(BOT_STATE.STOPPING);
    this.logger.info('Bot', 'Graceful shutdown initiated');

    if (this.contractMonitor.hasActiveContracts()) {
      this.logger.info('Bot', 'Waiting for active contract to resolve...');
      const maxWait = (this.config.durationTicks || 10) * 2 * 200;
      const deadline = Date.now() + maxWait;
      while (Date.now() < deadline && this.contractMonitor.hasActiveContracts()) {
        await new Promise(r => setTimeout(r, 200));
      }
      if (this.contractMonitor.hasActiveContracts()) {
        this.logger.warn('Bot', 'Contract did not resolve within timeout — force resolving');
        const latestTick = this.tickStream.getBuffer();
        const last = latestTick.length > 0 ? latestTick[latestTick.length - 1] : null;
        if (last) {
          for (const [localId] of this.contractMonitor.activeContracts) {
            this.contractMonitor.forceResolve(localId, last);
          }
        }
      }
    }

    this._running = false;
    this._setState(BOT_STATE.STOPPED);
    this.tickStream.stop();
    await this.connectionManager.disconnect();
    this.tradeLogger.close();
    this.sessionTracker.printSummary();
    this.logger.info('Bot', 'Bot stopped gracefully');
  }

  _checkStopFile() {
    if (this._stopRequested) return true;
    try {
      if (fs.existsSync(this._stopFilePath)) {
        this.logger.warn('Bot', 'stop.txt found — stopping');
        fs.unlinkSync(this._stopFilePath);
        return true;
      }
    } catch {}
    return false;
  }

  _setupListeners() {
    this.connectionManager.on('authorized', () => {
      console.log('[BOT] Authorized event received, starting tick stream');
      this._setState(BOT_STATE.AUTHORIZED);
      this.logger.info('Bot', 'Authorization successful, starting tick stream');
      this.tickStream.start().then(() => {
        console.log('[BOT] Tick stream started');
      }).catch(err => {
        console.log('[BOT] Tick stream failed:', err.message);
        this.logger.error('Bot', `Failed to start tick stream: ${err.message}`);
        this._setState(BOT_STATE.ERROR);
      });
    });

    this.connectionManager.on('error', (err) => {
      this.logger.error('Bot', `Connection error: ${err.message}`);
      this._setState(BOT_STATE.ERROR);
    });

    this.connectionManager.on('reconnecting', ({ attempt, delay }) => {
      this.logger.warn('Bot', `Reconnecting in ${delay}ms (attempt ${attempt})`);
      this._setState(BOT_STATE.CONNECTING);
    });

    this.tickStream.on('tick', (tick) => this._onTick(tick));
    this.tickStream.on('bufferReady', () => {
      this.logger.info('Bot', 'Buffer ready, starting scoring');
      this._setState(BOT_STATE.SCORING);
    });

    this.decisionEngine.on('enter', (signal) => this._onEnterSignal(signal));
    this.tradeExecutor.on('tradeExecuted', (result) => this._onTradeExecuted(result));
    this.contractMonitor.on('contractResolved', (result) => this._onContractResolved(result));
  }

  _onTick(tick) {
    if (this._checkStopFile()) {
      this.stop().catch(err => this.logger.error('Bot', `Error stopping: ${err.message}`));
      return;
    }

    this.tickIndex++;
    if (this.tickIndex % 10 === 0) {
      console.log(`[TICK] #${this.tickIndex} price=${tick.quote} state=${this.state}`);
    }

    this.indicatorEngine.update(tick.quote);
    this.contractMonitor.onTick(tick, this.tickIndex);

    if (!this.indicatorEngine.isReady()) {
      if (this.tickIndex % 50 === 0) {
        this.logger.info('Bot', `Warming up indicators: ${this.indicatorEngine.priceCount}/${this.config.minTicksBeforeTrade}`);
      }
      this._setState(BOT_STATE.COLLECTING);
      return;
    }

    if (this.contractMonitor.hasActiveContracts()) {
      this._setState(BOT_STATE.IN_POSITION);
      return;
    }

    this._setState(BOT_STATE.DECISION);
    this._evaluateTrade(tick);
  }

  _evaluateTrade(tick) {
    const indicatorValues = this.indicatorEngine.getAll();
    const buffer = this.tickStream.getBuffer();
    const result = this.decisionEngine.evaluate(buffer, indicatorValues, this.tickIndex);

    if (result.action === 'ENTER') {
      this._setState(BOT_STATE.ENTERING);
    } else {
      this._setState(BOT_STATE.SKIP);
    }
  }

  _onEnterSignal(signal) {
    if (this._tradeInProgress) {
      this.logger.info('Bot', 'Trade already in progress, skipping');
      return;
    }

    if (this.contractMonitor.hasActiveContracts()) {
      this.logger.info('Bot', 'Already in position, skipping entry');
      console.log('[TRADE] Already in position, skipping');
      return;
    }

    this._tradeInProgress = true;
    this._currentTrade = { signal, entryTickIndex: this.tickIndex };
    console.log(`[TRADE] Signal: ${signal.direction} at ${signal.price} score=${signal.score}`);
    this.logger.info('Bot', `Enter signal: ${signal.direction} at ${signal.price} (score=${signal.score})`);

    this.tradeExecutor.executeTrade(
      signal.direction,
      signal.price,
      signal.score,
      signal.scoreComponents
    ).then(result => {
      console.log('[TRADE] Result:', JSON.stringify(result));
      if (!result || !result.success) {
        const errMsg = (result && result.error) ? result.error : 'unknown_error';
        this.logger.error('Bot', `Trade execution failed: ${errMsg}`);
        this._currentTrade = null;
        this._tradeInProgress = false;
        this._setState(BOT_STATE.COLLECTING);
      }
    }).catch(err => {
      console.log('[TRADE] Error:', err.message);
      this.logger.error('Bot', `Trade execution error: ${err.message}`);
      this._currentTrade = null;
      this._tradeInProgress = false;
      this._setState(BOT_STATE.COLLECTING);
    });
  }

  _onTradeExecuted(result) {
    console.log('[TRADE] Executed callback:', JSON.stringify(result).slice(0, 300));
    if (!result.success) {
      console.log('[TRADE] FAILED:', result.error);
      this.logger.error('Bot', `Trade execution failed: ${result.error}`);
      this._currentTrade = null;
      this._tradeInProgress = false;
      this._setState(BOT_STATE.COLLECTING);
      return;
    }

    const signal = this._currentTrade ? this._currentTrade.signal : null;
    const entryTickIndex = this._currentTrade ? this._currentTrade.entryTickIndex : this.tickIndex;

    const localId = this.contractMonitor.startContract(
      result.contractId,
      result.entryPrice || (this.tickStream.getLastPrice()),
      entryTickIndex,
      this.config.durationTicks,
      signal ? signal.direction : this.config.direction,
      result.dryRun ? this.config.stake : result.stake,
      result.dryRun ? this.config.stake * (1 + this.config.payoutRate) : result.payout,
      signal ? signal.score : null,
      signal ? signal.scoreComponents : null
    );

    this._currentTrade = { ...this._currentTrade, localId, executed: true };
    this._tradeInProgress = false;
    this._setState(BOT_STATE.IN_POSITION);
  }

  _onContractResolved(result) {
    this.riskManager.recordTrade(result);
    this.stakeManager.recordResult(result.win);
    this.sessionTracker.recordTrade(result, this.riskManager.currentBalance);

    const record = {
      contractId: result.contractId,
      localId: result.localId,
      symbol: this.config.symbol,
      direction: result.direction,
      stake: result.stake,
      payoutRate: this.config.payoutRate,
      entryPrice: result.entryPrice,
      exitPrice: result.exitPrice,
      entryEpoch: Math.floor(Date.now() / 1000) - this.config.durationTicks,
      exitEpoch: Math.floor(Date.now() / 1000),
      durationTicks: result.durationTicks,
      score: result.score,
      scoreComponents: result.scoreComponents,
      win: result.win,
      pnl: result.pnl,
      balanceAfter: this.riskManager.currentBalance,
      dryRun: this.config.dryRun,
    };

    this.tradeLogger.logTrade(record);
    this.logger.info('Bot', `Trade ${result.localId}: ${result.win ? 'WIN' : 'LOSS'} PnL=${result.pnl >= 0 ? '+' : ''}${result.pnl.toFixed(4)}`);

    this.decisionEngine.startCooldown(this.tickIndex);
    this.decisionEngine.setCooldownAfterLoss(!result.win);
    this._setState(BOT_STATE.COOLDOWN);
  }

  getStatus() {
    return {
      state: this.state,
      tickIndex: this.tickIndex,
      connectionState: this.connectionManager.getState(),
      bufferSize: this.tickStream.getPriceCount(),
      indicatorsReady: this.indicatorEngine.isReady(),
      activeContracts: this.contractMonitor.getActiveCount(),
      risk: this.riskManager.getStatus(),
      session: this.sessionTracker.getStatus(),
    };
  }

  getHealth() {
    const mem = process.memoryUsage();
    const now = Date.now();
    return {
      status: this.state === BOT_STATE.ERROR ? 'error' : this.state === BOT_STATE.STOPPED ? 'stopped' : 'running',
      uptime: process.uptime(),
      version: '1.0.0',
      lastTickEpoch: this.tickStream.lastEpoch || 0,
      tickGap: this.tickStream.lastEpoch ? (now / 1000) - this.tickStream.lastEpoch : -1,
      connectionState: this.connectionManager.getState(),
      currentState: this.state,
      activeContract: this.contractMonitor.hasActiveContracts()
        ? { count: this.contractMonitor.getActiveCount() } : null,
      dailyStats: {
        trades: this.riskManager.dailyTrades,
        wins: this.riskManager.dailyWins,
        losses: this.riskManager.dailyTrades - this.riskManager.dailyWins,
        pnl: this.riskManager.dailyPnL,
        maxDrawdown: this.riskManager.drawdown || 0,
      },
      riskLimits: {
        consecutiveLosses: this.riskManager.consecutiveLosses,
        dailyLoss: this.riskManager.dailyLoss,
        dailyTrades: this.riskManager.dailyTrades,
        dailyLossLimit: this.config.maxDailyLoss,
        dailyTradeLimit: this.config.maxDailyTrades,
      },
      memoryUsage: (mem.heapUsed / 1024 / 1024).toFixed(1),
      config: {
        symbol: this.config.symbol,
        direction: this.config.direction,
        stake: this.config.stake,
        dryRun: this.config.dryRun,
        durationTicks: this.config.durationTicks,
        scoreThreshold: this.config.scoreThreshold,
      },
    };
  }
}

module.exports = { Bot, BOT_STATE };
