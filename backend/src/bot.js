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
const { computeScore } = require('../lib/scoring-engine');
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
    this._maxEnteringTicks = parseInt(config.maxEnteringTicks || '120', 10);
    this._contractIdToLocalId = new Map();
    this._contractIdToSignalId = new Map();
    this._executingTrade = false;
    this._lastEntryAttemptTick = -1;
    this._lastEntryTickIndex = -1;
    this._entryCooldownTicks = parseInt(config.entryCooldownTicks || '10', 10);
    this._maxPositionTicks = parseInt(config.maxPositionTicks || '900', 10);
    this._autoSellTriggered = false;
    this._minTicksBetweenEntries = parseInt(config.minTicksBetweenEntries || '15', 10);
    this._contractWatchdog = null;
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

    this._startContractWatchdog();

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

    this._stopContractWatchdog();
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

  _startContractWatchdog() {
    if (this._contractWatchdog) return;
    this._contractWatchdog = setInterval(() => {
      if (this.state !== BOT_STATE.IN_POSITION) return;
      this.tradeExecutor.verifyActiveContracts().catch(err => {
        this.logger.error('Bot', `Contract watchdog error: ${err.message}`);
      });
    }, 3000);
    this._contractWatchdog.unref();
  }

  _stopContractWatchdog() {
    if (this._contractWatchdog) {
      clearInterval(this._contractWatchdog);
      this._contractWatchdog = null;
    }
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
      if (this.state === BOT_STATE.ENTERING) return;
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

    // State machine watchdog: if stuck in a transient working state >60s, restart.
    // Exclude idle states (SKIP/COOLDOWN), live positions (IN_POSITION — a contract
    // can legitimately run for minutes and is protected by SL/TP + the disconnect
    // watchdog), and connection states (reconnect/backoff can exceed 60s legitimately).
    const watchdogExempt = new Set([
      BOT_STATE.SKIP, BOT_STATE.COOLDOWN, BOT_STATE.IN_POSITION,
      BOT_STATE.DISCONNECTED, BOT_STATE.CONNECTING, BOT_STATE.STOPPING, BOT_STATE.STOPPED,
    ]);
    if (this._lastStateChange && !watchdogExempt.has(this.state)) {
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
      // Auto-sell removed — let contracts run to natural expiry or SL/TP
      // The 112-tick forced sell was causing tiny wins ($0.01) and bad exits
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

    if (this._tradeInProgress) {
      this._setState(BOT_STATE.SKIP);
      return;
    }

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


  _evaluateTrade(tick) {
    const indicatorValues = this.indicatorEngine.getAll();
    const buffer = this.tickStream.getBuffer();
    const savedDirection = this.config.direction;

    const putIndicators = { ...indicatorValues, deltaAlignment: this.indicatorEngine._engine.deltaAlignment(5, 'PUT') };
    const callIndicators = { ...indicatorValues, deltaAlignment: this.indicatorEngine._engine.deltaAlignment(5, 'CALL') };

    const putResult = computeScore(putIndicators, { ...this.config, direction: 'PUT' });
    const callResult = computeScore(callIndicators, { ...this.config, direction: 'CALL' });

    const bestResult = putResult.score >= callResult.score ? putResult : callResult;
    this.config.direction = bestResult.direction;

    this.logger.info('DecisionEngine', `PUT=${putResult.score} CALL=${callResult.score} → BEST=${bestResult.direction} (${bestResult.score}) threshold=${this.config.scoreThreshold}`);
    if (this.config.debugScores) {
      this.logger.info('DecisionEngine', `PUT components: ${JSON.stringify(putResult.components)}`);
      this.logger.info('DecisionEngine', `CALL components: ${JSON.stringify(callResult.components)}`);
    }

    // DIRECTION FILTER: Only trade with EMA trend
    // If price > EMA Long → uptrend → only allow CALL
    // If price < EMA Long → downtrend → only allow PUT
    const emaLong = indicatorValues.emaLong;
    const currentPrice = tick.quote;
    if (emaLong != null && currentPrice != null) {
      const trendUp = currentPrice > emaLong;
      if (trendUp && bestResult.direction === 'PUT') {
        this.logger.info('Bot', `Direction filter: price ${currentPrice} > EMA Long ${emaLong.toFixed(2)} → uptrend → blocking PUT`);
        this.config.direction = savedDirection;
        this._setState(BOT_STATE.SKIP);
        return;
      }
      if (!trendUp && bestResult.direction === 'CALL') {
        this.logger.info('Bot', `Direction filter: price ${currentPrice} < EMA Long ${emaLong.toFixed(2)} → downtrend → blocking CALL`);
        this.config.direction = savedDirection;
        this._setState(BOT_STATE.SKIP);
        return;
      }
    }

    let result;
    try {
      const correctedIndicators = bestResult.direction === 'PUT' ? putIndicators : callIndicators;
      result = this.decisionEngine.evaluate(buffer, correctedIndicators, this.tickIndex);
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

    if (this._lastEntryAttemptTick > 0 && this.tickIndex - this._lastEntryAttemptTick < this._entryCooldownTicks) {
      this.logger.info('Bot', `Entry cooldown (${this.tickIndex - this._lastEntryAttemptTick}/${this._entryCooldownTicks}) — skipping`);
      return;
    }

    // Minimum tick gap between entries — prevents duplicate trades
    if (this._lastEntryTickIndex > 0 && this.tickIndex - this._lastEntryTickIndex < this._minTicksBetweenEntries) {
      this.logger.info('Bot', `Min tick gap (${this.tickIndex - this._lastEntryTickIndex}/${this._minTicksBetweenEntries}) — skipping duplicate`);
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
    this._autoSellTriggered = false;
    this._lastEntryAttemptTick = this.tickIndex;
    this._lastEntryTickIndex = this.tickIndex;
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
      // The ENTERING window expired before the buy result arrived. The contract
      // was STILL successfully bought on Deriv with real money — we MUST track
      // it. Do NOT sell it as an orphan (that discards real money). Instead,
      // adopt the contract now and transition to IN_POSITION.
      this.logger.warn('Bot', `Late buy result — ENTERING already expired (state=${this.state}) but contract ${result.contractId} was bought on Deriv — adopting`);
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
      this._contractIdToSignalId.set(result.contractId, signalId);
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

    // UNRESOLVED: Deriv outcome unknown. Record the trade WITHOUT a fabricated P/L
    // so the reconciliation script can settle it from Deriv's profit_table. Do not
    // feed null into risk/stake accounting.
    const isUnresolved = result.pnl == null || result.win == null;
    if (isUnresolved) {
      this.logger.error('Bot', `Trade ${result.localId || result.contractId} UNRESOLVED — logging with null P/L for reconciliation (exit=${result.exitReason})`);
      const ctU = result.contractType || this._toContractType(result.direction) || 'CALL';
      this.tradeLogger.logTrade({
        contractId: result.contractId,
        localId: result.localId,
        symbol: this.config.symbol,
        direction: result.direction,
        stake: result.stake,
        payoutRate: this.config.payoutRate,
        entryPrice: result.entryPrice,
        exitPrice: result.exitPrice,
        entryEpoch: result.entryEpoch || Math.floor(Date.now() / 1000),
        exitEpoch: result.exitEpoch || Math.floor(Date.now() / 1000),
        durationTicks: result.durationTicks,
        score: result.score,
        scoreComponents: result.scoreComponents,
        win: false,
        pnl: null,
        balanceAfter: this.riskManager.currentBalance,
        dryRun: this.config.dryRun,
        contractType: ctU,
        exitReason: result.exitReason || 'UNRESOLVED',
        multiplier: this.config.multiplier || null,
        stopLoss: this.config.stopLoss || null,
        takeProfit: this.config.takeProfit || null,
        derivProfit: null,
        reconcileStatus: 'PENDING',
      });

      // Clear signal tracking — this contract won't resolve again
      this._pendingSignalId = null;
      if (result.contractId) this._contractIdToSignalId.delete(result.contractId);

      this._setState(BOT_STATE.COOLDOWN);
      return;
    }

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
      derivProfit: result.derivProfit ?? null,
    };

    const tradeId = this.tradeLogger.logTrade(record);

    // Resolve the signal linked to this contract. Priority:
    // 1. _pendingSignalId (most recent entry, set in _onEnterSignal)
    // 2. _contractIdToSignalId (stored when contract was bought)
    // 3. Fallback: search signals table by contract_id
    let signalToResolve = null;
    if (this._pendingSignalId) {
      signalToResolve = this._pendingSignalId;
      this._pendingSignalId = null;
    } else if (result.contractId && this._contractIdToSignalId.has(result.contractId)) {
      signalToResolve = this._contractIdToSignalId.get(result.contractId);
    }
    if (signalToResolve != null) {
      this.tradeLogger.updateSignalWithTrade(
        signalToResolve,
        result.win != null ? (result.win ? 'WIN' : 'LOSS') : null,
        result.pnl,
        result.contractId,
        tradeId
      );
      if (result.contractId) this._contractIdToSignalId.delete(result.contractId);
    } else if (result.contractId) {
      // Fallback: search by contract_id directly — catches orphaned signals
      // from prior sessions where the mapping was lost on restart, as well as
      // signals prematurely marked resolved=1 by the old (pre-Fix-B) code.
      const sigs = this.tradeLogger.getPendingSignals();
      let match = sigs.find(s => s.contract_id === result.contractId);
      if (!match) {
        // Also check resolved=1 signals (orphans from before Fix B)
        const allSigs = this.tradeLogger.getSignalsByContractId(result.contractId);
        if (allSigs && allSigs.length > 0) {
          match = allSigs[0];
        }
      }
      if (match) {
        this.tradeLogger.updateSignalWithTrade(
          match.id,
          result.win != null ? (result.win ? 'WIN' : 'LOSS') : null,
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
        derivProfit: result.derivProfit,
        exitPrice: result.exitPrice,
        exitReason: result.exitReason,
      });
      this._contractIdToLocalId.delete(contractId);
      this._contractIdToSignalId.delete(contractId);
    } else {
      // No local mapping (e.g. contract opened in a prior session). The
      // reconciliation script settles orphaned contracts from Deriv's profit_table,
      // so we log and leave it rather than fabricating a record here.
      this.logger.warn('Bot', `Contract ${contractId} resolved with no local mapping — leaving for reconciliation`);
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

  getActiveContractData() {
    const contractIds = this.tradeExecutor.getActiveContractIds();
    if (contractIds.length === 0) return null;
    return contractIds.map(cid => {
      const entry = this.tradeExecutor._contractStreams.get(cid);
      if (!entry) return null;
      return {
        localId: this._contractIdToLocalId.get(cid) || null,
        contractId: cid,
        direction: entry.contractType === 'MULTDOWN' ? 'PUT' : 'CALL',
        entryPrice: entry.entryPrice,
        entryTick: 0,
        expiryTick: 0,
        stake: entry.stake,
        contractType: entry.contractType,
        multiplier: entry.multiplier,
        stopLoss: entry.stopLoss,
        takeProfit: entry.takeProfit,
        entryEpoch: Math.floor(entry.openedAt / 1000),
      };
    }).filter(Boolean);
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

  updateConfig(partial) {
    for (const [key, value] of Object.entries(partial)) {
      if (this.config[key] !== undefined) {
        const old = this.config[key];
        this.config[key] = value;
        this.logger.info('Bot', `Config ${key}: ${old} -> ${value}`);
      }
    }
    if (this.stakeManager) {
      this.stakeManager.config = this.config;
    }
    if (this.riskManager) {
      this.riskManager.config = this.config;
    }
    if (this.decisionEngine) {
      this.decisionEngine.config = this.config;
    }
    if (this.indicatorEngine) {
      this.indicatorEngine.config = this.config;
    }
    if (this.tradeExecutor) {
      // CRITICAL: tradeExecutor reads stopLoss/takeProfit/stake/multiplier from
      // this.config. Without this line, SL/TP/stake changes from the UI never
      // reached the executor and active trades kept the old protection values.
      this.tradeExecutor.config = this.config;
    }
    if (this.contractMonitor) {
      this.contractMonitor.config = this.config;
    }
  }
}

module.exports = { Bot, BOT_STATE };
