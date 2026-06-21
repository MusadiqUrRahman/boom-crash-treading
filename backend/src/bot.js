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

const { EventEmitter } = require('events');

class Bot extends EventEmitter {
  constructor(config, logger) {
    super();
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
    this.contractMonitor = new ContractMonitor(logger, config.allowEquals);
    this.tradeLogger = new TradeLogger(config.liveTradesDbPath || './data/live_trades.db', null, 'MULTDOWN');
    this.sessionTracker = new SessionTracker(logger);

    this._currentTrade = null;
    this._tradeInProgress = false;
    this._paused = false;
    this._pendingSignalId = null;
    this._lastEntryTickIndex = -1;
    this._enteringTickCount = 0;
    this._maxEnteringTicks = parseInt(config.maxEnteringTicks || '30', 10);
    this._contractIdToLocalId = new Map();
    this._executingTrade = false;
    this._lastEntryAttemptTick = -1;
    this._entryCooldownTicks = parseInt(config.entryCooldownTicks || '10', 10);
    this._maxPositionTicks = parseInt(config.maxPositionTicks || '900', 10);
    this._setupListeners();
  }

  _toContractType(direction) {
    return direction === 'PUT' ? 'PUT' : 'CALL';
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
    this._lastStateChange = Date.now();
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

    this.tradeExecutor.cleanup();

    if (this.contractMonitor.hasActiveContracts()) {
      this.logger.info('Bot', 'Waiting for active contract to resolve...');
      const maxWait = (this.config.maxMlDurationTicks || 100) * 2 * 200;
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
      } catch (err) {
        this.logger.error('Bot', `Failed to check/remove stop.txt: ${err.message}`);
      }
      return false;
  }

  _setupListeners() {
    this.connectionManager.on('authorized', (authResult) => {
      console.log('[BOT] Authorized event received, starting tick stream');
      this._setState(BOT_STATE.AUTHORIZED);
      this.logger.info('Bot', 'Authorization successful, starting tick stream');
      this._paused = false;

      if (this._disconnectWatchdog) {
        clearTimeout(this._disconnectWatchdog);
        this._disconnectWatchdog = null;
        this.logger.info('Bot', 'Reconnected — cleared disconnect watchdog');
      }

      const apiBalance = authResult?.authorize?.balance;
      if (typeof apiBalance === 'number' && apiBalance > 0) {
        this.riskManager.setRealBalance(apiBalance);
        this.logger.info('Bot', `Live balance from Deriv: $${apiBalance.toFixed(2)}`);
      }

      this.tradeExecutor.reconnectContracts().catch(err => {
        this.logger.warn('Bot', `Reconnect contracts failed: ${err.message}`);
      });

      this.tickStream.start().then(() => {
        console.log('[BOT] Tick stream started');
      }).catch(err => {
        console.log('[BOT] Tick stream failed:', err.message);
        this.logger.error('Bot', `Failed to start tick stream: ${err.message}`);
        this._setState(BOT_STATE.ERROR);
      });
    });

    this.connectionManager.on('disconnected', () => {
      this.logger.warn('Bot', 'Connection lost — pausing trade evaluation');
      this._paused = true;
      if (this._tradeInProgress) {
        this.logger.warn('Bot', 'Aborting pending trade due to disconnect');
        this._currentTrade = null;
        this._tradeInProgress = false;
      }
      this._setState(BOT_STATE.DISCONNECTED);

      if (this.contractMonitor.hasActiveContracts()) {
        const count = this.contractMonitor.getActiveCount();
        this.logger.warn('Bot', `${count} active contract(s) during WS disconnect — starting force-exit watchdog (120s)`);
        if (this._disconnectWatchdog) clearTimeout(this._disconnectWatchdog);
        this._disconnectWatchdog = setTimeout(() => {
          this.logger.error('Bot', 'Watchdog: WS disconnected for >120s with active contract — force-exiting');
          this.stop().catch(() => {}).finally(() => process.exit(1));
        }, 120000);
      }
    });

    this.connectionManager.on('error', (err) => {
      this.logger.error('Bot', `Connection error: ${err.message}`);
      this._setState(BOT_STATE.ERROR);
    });

    this.connectionManager.on('reconnecting', ({ attempt, delay }) => {
      this.logger.warn('Bot', `Reconnecting in ${delay}ms (attempt ${attempt})`);
      this._setState(BOT_STATE.CONNECTING);
    });

    this.connectionManager.on('balance', (balance) => {
      this.riskManager.updateLiveBalance(balance);
    });

    this.connectionManager.on('contractConfig', (cfg) => {
      if (cfg.contractMinStake) {
        this.config.contractMinStake = cfg.contractMinStake;
        this.stakeManager.setContractMinStake(cfg.contractMinStake);
        this.logger.info('Bot', `Contract min stake updated: $${cfg.contractMinStake.toFixed(2)}`);
      }
      if (cfg.contractMultiplierRange) {
        this.config.contractMultiplierRange = cfg.contractMultiplierRange;
        this.logger.info('Bot', `Contract multiplier range updated: [${cfg.contractMultiplierRange.join(', ')}]`);
      }
    });

    this.tickStream.on('tick', (tick) => this._onTick(tick));
    this.tickStream.on('bufferReady', () => {
      this.logger.info('Bot', 'Buffer ready, starting scoring');
      this._setState(BOT_STATE.SCORING);
    });

    this.decisionEngine.on('enter', (signal) => this._onEnterSignal(signal));
    this.tradeExecutor.on('tradeExecuted', (result) => this._onTradeExecuted(result));
    this.contractMonitor.on('contractResolved', (result) => this._onContractResolved(result));
    this.tradeExecutor.on('contractResolved', (result) => this._onMultiplierResolved(result));
  }

  _onTick(tick) {
    if (this._checkStopFile()) {
      this.stop().catch(err => this.logger.error('Bot', `Error stopping: ${err.message}`));
      return;
    }

    // State machine watchdog: if stuck in same non-idle state >60s, restart
    if (this._lastStateChange && this.state !== BOT_STATE.SKIP && this.state !== BOT_STATE.COOLDOWN) {
      const stuckMs = Date.now() - this._lastStateChange;
      if (stuckMs > 60000) {
        this.logger.error('Bot', `State watchdog: stuck in ${this.state} for ${Math.floor(stuckMs / 1000)}s — force restarting`);
        this.stop().catch(() => {}).finally(() => process.exit(1));
        return;
      }
    }

    this.tickIndex++;
    if (this.tickIndex % 10 === 0) {
      this.logger.info('Bot', `Tick #${this.tickIndex} price=${tick.quote} state=${this.state}`);
    }

    this.indicatorEngine.update(tick.quote);
    this.contractMonitor.onTick(tick, this.tickIndex);
    this.tradeExecutor.checkPerTickStopLoss(tick.quote);
    this.riskManager.recordTick(tick.quote);

    if (this._paused) {
      this._setState(BOT_STATE.DISCONNECTED);
      return;
    }

    if (!this.indicatorEngine.isReady()) {
      if (this.tickIndex % 50 === 0) {
        this.logger.info('Bot', `Warming up indicators: ${this.indicatorEngine.priceCount}/${this.config.minTicksBeforeTrade}`);
      }
      this._setState(BOT_STATE.COLLECTING);
      return;
    }

    if (this.contractMonitor.hasActiveContracts()) {
      this._setState(BOT_STATE.IN_POSITION);
      const ticksInPosition = this.tickIndex - this._lastEntryTickIndex;
      if (this._maxPositionTicks > 0 && ticksInPosition > this._maxPositionTicks) {
        this.logger.warn('Bot', `Position auto-sell: ${ticksInPosition} ticks exceeded ${this._maxPositionTicks} max — selling`);
        for (const [localId, info] of this.contractMonitor.activeContracts) {
          const contractId = info.contractId;
          if (contractId) {
            this.tradeExecutor.sellContract(contractId).catch(err => {
              this.logger.error('Bot', `Auto-sell failed for ${contractId}: ${err.message}`);
            });
          }
        }
      }
      return;
    }

    if (this.state === BOT_STATE.ENTERING) {
      this._enteringTickCount++;
      if (this._enteringTickCount > this._maxEnteringTicks) {
        this.logger.warn('Bot', `ENTERING timeout after ${this._maxEnteringTicks} ticks — forcing SKIP (executing=${this._executingTrade})`);
        this._currentTrade = null;
        this._tradeInProgress = false;
        this._enteringTickCount = 0;
        this._setState(BOT_STATE.SKIP);
      }
      return;
    }
    this._enteringTickCount = 0;

    this._setState(BOT_STATE.DECISION);
    this._evaluateTrade(tick);
  }

  _getLocalDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  _resolveDirection() {
    if (!this.config.dynamicDirection) return this.config.direction;

    const buffer = this.tickStream.getBuffer();
    const lookback = this.config.directionLookbackTicks || 10;

    if (buffer.length >= lookback) {
      const recent = buffer.slice(-lookback);
      const prices = recent.map(t => t.quote);
      const startPrice = prices[0];
      const endPrice = prices[prices.length - 1];
      const trendPct = ((endPrice - startPrice) / startPrice) * 100;

      if (trendPct > 0.01) return 'PUT';
      if (trendPct < -0.01) return 'CALL';
    }

    return this.config.direction;
  }

  _evaluateTrade(tick) {
    const indicatorValues = this.indicatorEngine.getAll();
    const buffer = this.tickStream.getBuffer();
    const savedDirection = this.config.direction;
    this.config.direction = this._resolveDirection();
    let result;
    try {
      result = this.decisionEngine.evaluate(buffer, indicatorValues, this.tickIndex);
    } finally {
      this.config.direction = savedDirection;
    }

    if (result.action === 'ENTER') {
      // _onEnterSignal is called synchronously by evaluate() — if it rejected
      // the entry (e.g. volatility filter), _tradeInProgress will be false.
      if (this._tradeInProgress) {
        this._setState(BOT_STATE.ENTERING);
      } else {
        this._setState(BOT_STATE.SKIP);
      }
    } else {
      this._setState(BOT_STATE.SKIP);
    }
  }

  _onEnterSignal(signal) {
    if (this._paused) {
      this.logger.info('Bot', 'Paused — skipping entry');
      return;
    }

    if (this._executingTrade) {
      this.logger.info('Bot', 'Trade execution already in flight — skipping');
      return;
    }

    if (this._tradeInProgress) {
      this.logger.info('Bot', 'Trade already in progress, skipping');
      return;
    }

    if (this._lastEntryTickIndex === this.tickIndex) {
      this.logger.info('Bot', `Already entered on tick ${this.tickIndex}, skipping duplicate`);
      return;
    }
    this._lastEntryTickIndex = this.tickIndex;

    if (this._lastEntryAttemptTick > 0 && this.tickIndex - this._lastEntryAttemptTick < this._entryCooldownTicks) {
      this.logger.info('Bot', `Entry cooldown (${this.tickIndex - this._lastEntryAttemptTick}/${this._entryCooldownTicks}) — skipping`);
      return;
    }

    if (this.contractMonitor.hasActiveContracts()) {
      this.logger.info('Bot', 'Already in position, skipping entry');
      console.log('[TRADE] Already in position, skipping');
      return;
    }

    if (!this.connectionManager.isAuthorized()) {
      this.logger.warn('Bot', 'Not authorized — skipping entry');
      return;
    }

    this._tradeInProgress = true;
    this._executingTrade = true;
    this._lastEntryAttemptTick = this.tickIndex;
    this._currentTrade = { signal, entryTickIndex: this.tickIndex };

    let stake = this.stakeManager.getStake(this.riskManager.currentBalance);
    if (this.riskManager.isSpikeClusterActive()) {
      stake = Math.max(this.config.minStake || 0.35, stake * 0.3);
      this.logger.warn('Bot', `Spike cluster active — reducing stake to $${stake.toFixed(2)}`);
    }
    this._currentTrade.stake = stake;

    const ct = this._toContractType(signal.direction);
    const signalId = this.tradeLogger.logSignal({
      timestamp: new Date().toISOString(),
      epoch: Math.floor(Date.now() / 1000),
      price: signal.price,
      direction: signal.direction,
      score: signal.score,
      scoreComponents: signal.scoreComponents,
      indicatorsJson: this.indicatorEngine.isReady() ? JSON.stringify(this.indicatorEngine.getAll()) : null,
      contractType: ct,
    });
    this._pendingSignalId = signalId;
    this._currentTrade.signalId = signalId;

    console.log(`[TRADE] Signal: ${signal.direction} at ${signal.price} score=${signal.score} signalId=${signalId} type=${ct}`);
    this.logger.info('Bot', `Enter signal: ${signal.direction} at ${signal.price} (score=${signal.score}) signalId=${signalId} type=${ct}`);

    if (this.config.volatilityThreshold > 0) {
      const buffer = this.tickStream.getBuffer();
      const lookback = this.config.volatilityLookbackTicks || 10;
      if (buffer.length >= lookback) {
        const recent = buffer.slice(-lookback);
        const prices = recent.map(t => t.quote);
        const range = Math.max(...prices) - Math.min(...prices);
        if (range > this.config.volatilityThreshold) {
          this.logger.info('Bot', `Volatility filter: range ${range.toFixed(2)} > ${this.config.volatilityThreshold} — skipping entry`);
          console.log(`[TRADE] Volatility filter: range ${range.toFixed(2)} > ${this.config.volatilityThreshold} — skipping`);
          this._tradeInProgress = false;
          this._executingTrade = false;
          this._setState(BOT_STATE.SKIP);
          return;
        }
      }
    }

    this.emit('signal', {
      ...signal,
      signalId,
      timestamp: new Date().toISOString(),
      contractType: ct,
    });

    const activeStake = this._currentTrade?.stake ?? this.config.stake;
    this.tradeExecutor.executeTrade(
      signal.direction,
      signal.price,
      signal.score,
      signal.scoreComponents,
      activeStake,
      signalId
    ).then(result => {
      console.log('[TRADE] Result:', JSON.stringify(result));
      if (!result || !result.success) {
        const errMsg = (result && result.error) ? result.error : 'unknown_error';
        this.logger.error('Bot', `Trade execution failed: ${errMsg} [signalId=${this._pendingSignalId} dir=${signal.direction} score=${signal.score} price=${signal.price}]`);
        this._currentTrade = null;
        this._tradeInProgress = false;
        this._executingTrade = false;
        this._setState(BOT_STATE.COLLECTING);
      }
    }).catch(err => {
      console.log('[TRADE] Error:', err.message);
      this.logger.error('Bot', `Trade execution error: ${err.message} [signalId=${this._pendingSignalId} dir=${signal.direction} score=${signal.score} price=${signal.price}]`);
      this._currentTrade = null;
      this._tradeInProgress = false;
      this._executingTrade = false;
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
      this._executingTrade = false;
      this._setState(BOT_STATE.COLLECTING);
      return;
    }

    if (this.state !== BOT_STATE.ENTERING) {
      this.logger.warn('Bot', `Stale trade result ignored — ENTERING timeout already expired (state=${this.state})`);
      this._tradeInProgress = false;
      this._executingTrade = false;
      if (result.contractId) {
        this.tradeExecutor.sellContract(result.contractId).catch(() => {
          this.logger.warn('Bot', `Stale sell cleanup failed for ${result.contractId}`);
        });
      }
      return;
    }

    const signal = this._currentTrade ? this._currentTrade.signal : null;
    const entryTickIndex = this._currentTrade ? this._currentTrade.entryTickIndex : this.tickIndex;

    const actualCt = result.contractType || this._toContractType(signal ? signal.direction : this.config.direction);
    const durationTicks = this.config.durationTicks;

    const entryEpoch = Math.floor(Date.now() / 1000);

    const multiplier = this.config.multiplier || 100;

    const localId = this.contractMonitor.startContract(
      result.contractId,
      result.entryPrice || (this.tickStream.getLastPrice()),
      entryTickIndex,
      0,
      signal ? signal.direction : this.config.direction,
      result.dryRun ? this.config.stake : result.stake,
      result.dryRun ? this.config.stake * (1 + this.config.payoutRate) : 0,
      signal ? signal.score : null,
      signal ? signal.scoreComponents : null,
      actualCt,
      this.config.stopLoss || null,
      this.config.takeProfit || null,
      entryEpoch,
      multiplier
    );

    if (result.contractId) {
      this._contractIdToLocalId.set(result.contractId, localId);
    }

    const signalId = this._currentTrade?.signalId;
    if (signalId && result.contractId) {
      this.tradeLogger.updateSignalWithTrade(signalId, null, null, result.contractId, null);
    }

    this.emit('tradeExecuted', {
      ...result,
      localId,
      entryEpoch,
      entryPrice: result.entryPrice || this.tickStream.getLastPrice(),
    });

    this._currentTrade = { ...this._currentTrade, localId, executed: true };
    this._tradeInProgress = false;
    this._executingTrade = false;
    this._setState(BOT_STATE.IN_POSITION);
  }

  _onContractResolved(result) {
    const balanceBefore = this.riskManager.currentBalance;
    this.riskManager.recordTrade(result);
    this.stakeManager.recordResult(result.win);
    this.sessionTracker.recordTrade(result, balanceBefore);

    const ct = result.contractType || this._toContractType(result.direction) || 'CALL';

    const record = {
      contractId: result.contractId,
      localId: result.localId,
      symbol: this.config.symbol,
      direction: result.direction,
      stake: result.stake,
      payoutRate: this.config.payoutRate,
      entryPrice: result.entryPrice,
      exitPrice: result.exitPrice,
      entryEpoch: result.entryEpoch || Math.floor(Date.now() / 1000) - this.config.durationTicks,
      exitEpoch: result.exitEpoch || Math.floor(Date.now() / 1000),
      durationTicks: result.durationTicks,
      score: result.score,
      scoreComponents: result.scoreComponents,
      win: result.win,
      pnl: result.pnl,
      balanceAfter: this.riskManager.currentBalance,
      dryRun: this.config.dryRun,
      contractType: ct,
      exitReason: result.exitReason || null,
      multiplier: this.config.multiplier || null,
      stopLoss: this.config.stopLoss || null,
      takeProfit: this.config.takeProfit || null,
    };

    const tradeId = this.tradeLogger.logTrade(record);

    if (this._pendingSignalId) {
      this.tradeLogger.updateSignalWithTrade(
        this._pendingSignalId,
        result.win ? 'WIN' : 'LOSS',
        result.pnl,
        result.contractId,
        tradeId
      );
      this._pendingSignalId = null;
    } else if (result.contractId) {
      const sigs = this.tradeLogger.getPendingSignals();
      const match = sigs.find(s => s.contract_id === result.contractId);
      if (match) {
        this.tradeLogger.updateSignalWithTrade(
          match.id,
          result.win ? 'WIN' : 'LOSS',
          result.pnl,
          result.contractId,
          tradeId
        );
      }
    }

    this.tradeLogger.logDailyStats(
      this._getLocalDateString(),
      this.config.symbol,
      this.riskManager.dailyTrades,
      this.riskManager.dailyWins,
      this.riskManager.dailyTrades - this.riskManager.dailyWins,
      this.riskManager.dailyPnL,
      this.riskManager.currentBalance
    );
    this.logger.info('Bot', `Trade ${result.localId}: ${result.win ? 'WIN' : 'LOSS'} PnL=${result.pnl >= 0 ? '+' : ''}${result.pnl.toFixed(4)}`);

    if (this._disconnectWatchdog && !this.contractMonitor.hasActiveContracts()) {
      clearTimeout(this._disconnectWatchdog);
      this._disconnectWatchdog = null;
      this.logger.info('Bot', 'No active contracts — cleared disconnect watchdog');
    }

    if (!result.win) {
      this.decisionEngine.setCooldownAfterLoss(true, this.tickIndex);
    } else {
      this.decisionEngine.startCooldown(this.tickIndex);
    }
    this._setState(BOT_STATE.COOLDOWN);
  }

  _onMultiplierResolved(result) {
    const contractId = result.contractId;
    const localId = this._contractIdToLocalId.get(contractId);
    this.logger.warn('Bot', `Contract ${contractId} resolved via executor (exit=${result.exitReason}) localId=${localId}`);

    if (localId) {
      this.contractMonitor.resolveContract(localId, {
        win: result.win,
        pnl: result.pnl,
        exitPrice: result.exitPrice,
        exitReason: result.exitReason,
      });
      this._contractIdToLocalId.delete(contractId);
    }
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
      liveBalance: this.riskManager.getStatus().balance,
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
