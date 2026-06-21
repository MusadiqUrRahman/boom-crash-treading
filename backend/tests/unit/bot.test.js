const { Bot, BOT_STATE } = require('../../src/bot');

function makeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function makeConfig(overrides = {}) {
  return {
    symbol: '1HZ100V',
    dryRun: true,
    direction: 'CALL',
    stake: 2.00,
    durationTicks: 10,
    scoreThreshold: 4,
    cooldownTicks: 5,
    dynamicDirection: false,
    rsiOversold: 35,
    rsiOverbought: 65,
    lossCooldownMultiplier: 4,
    multiplier: 100,
    minStake: 0.35,
    contractMinStake: 0,
    maxStake: 5.00,
    stakeMode: 'fixed',
    baseStake: 2.00,
    volatilityThreshold: 0,
    volatilityLookbackTicks: 10,
    bufferSize: 200,
    minTicksBeforeTrade: 10,
    storeTicks: false,
    allowEquals: false,
    payoutRate: 0.80,
    stopLoss: 0.50,
    takeProfit: 2.00,
    entryCooldownTicks: 10,
    maxPositionTicks: 900,
    liveTradesDbPath: ':memory:',
    ...overrides,
  };
}

function createMockBot() {
  const logger = makeLogger();
  const config = makeConfig();
  const bot = new Bot(config, logger);
  return { bot, config, logger };
}

describe('Bot', () => {
  describe('constructor', () => {
    it('creates bot with initial state INIT', () => {
      const { bot } = createMockBot();
      expect(bot.state).toBe('INIT');
      expect(bot._executingTrade).toBe(false);
      expect(bot._tradeInProgress).toBe(false);
    });
  });

  describe('_setState', () => {
    it('changes state and logs transition', () => {
      const { bot } = createMockBot();
      bot._setState('RUNNING');
      expect(bot.state).toBe('RUNNING');
    });
  });

  describe('_resolveDirection', () => {
    it('returns config direction when dynamicDirection is false', () => {
      const { bot } = createMockBot();
      bot.config.dynamicDirection = false;
      expect(bot._resolveDirection()).toBe('CALL');
    });

    it('returns PUT when RSI above overbought', () => {
      const { bot } = createMockBot();
      bot.config.dynamicDirection = true;
      bot.config.rsiOverbought = 65;
      bot.indicatorEngine._cached.rsi = { value: 70 };
      expect(bot._resolveDirection()).toBe('PUT');
    });

    it('returns CALL when RSI below oversold', () => {
      const { bot } = createMockBot();
      bot.config.dynamicDirection = true;
      bot.config.rsiOversold = 35;
      bot.indicatorEngine._cached.rsi = { value: 30 };
      expect(bot._resolveDirection()).toBe('CALL');
    });

    it('returns config direction as fallback when RSI not ready', () => {
      const { bot } = createMockBot();
      bot.config.dynamicDirection = true;
      bot.config.direction = 'PUT';
      bot.indicatorEngine._cached.rsi = null;
      expect(bot._resolveDirection()).toBe('PUT');
    });

    it('handles null RSI', () => {
      const { bot } = createMockBot();
      bot.indicatorEngine._cached.rsi = null;
      expect(bot._resolveDirection()).toBe('CALL');
    });
  });

  describe('_toContractType', () => {
    it('returns PUT for PUT direction', () => {
      const { bot } = createMockBot();
      expect(bot._toContractType('PUT')).toBe('PUT');
    });

    it('returns CALL for CALL direction', () => {
      const { bot } = createMockBot();
      expect(bot._toContractType('CALL')).toBe('CALL');
    });
  });

  describe('_onTick', () => {
    it('increments tickIndex', () => {
      const { bot } = createMockBot();
      bot._onTick({ quote: 100, epoch: 1000 });
      expect(bot.tickIndex).toBe(1);
    });

    it('updates indicator engine with tick price', () => {
      const { bot } = createMockBot();
      const spy = jest.spyOn(bot.indicatorEngine, 'update');
      bot._onTick({ quote: 100, epoch: 1000 });
      expect(spy).toHaveBeenCalledWith(100);
    });

    it('updates contract monitor', () => {
      const { bot } = createMockBot();
      const spy = jest.spyOn(bot.contractMonitor, 'onTick');
      bot.tickIndex = 5;
      bot._onTick({ quote: 100, epoch: 1000 });
      expect(spy).toHaveBeenCalled();
    });

    it('returns early when stop file is detected', () => {
      const { bot } = createMockBot();
      const spy = jest.spyOn(bot, 'stop').mockResolvedValue(undefined);
      bot._checkStopFile = jest.fn().mockReturnValue(true);
      bot._onTick({ quote: 100, epoch: 1000 });
      expect(spy).toHaveBeenCalled();
    });

    it('sets DISCONNECTED state when paused', () => {
      const { bot } = createMockBot();
      bot._paused = true;
      bot.indicatorEngine.isReady = jest.fn().mockReturnValue(true);
      bot.contractMonitor.hasActiveContracts = jest.fn().mockReturnValue(false);
      bot._onTick({ quote: 100, epoch: 1000 });
      expect(bot.state).toBe('DISCONNECTED');
    });

    it('sets COLLECTING state when indicators not ready', () => {
      const { bot } = createMockBot();
      bot.indicatorEngine.isReady = jest.fn().mockReturnValue(false);
      bot.contractMonitor.hasActiveContracts = jest.fn().mockReturnValue(false);
      bot._onTick({ quote: 100, epoch: 1000 });
      expect(bot.state).toBe('COLLECTING');
    });

    it('sets IN_POSITION state when active contracts exist', () => {
      const { bot } = createMockBot();
      bot.indicatorEngine.isReady = jest.fn().mockReturnValue(true);
      bot.contractMonitor.hasActiveContracts = jest.fn().mockReturnValue(true);
      bot._lastEntryTickIndex = 3;
      bot._onTick({ quote: 100, epoch: 1000 });
      expect(bot.state).toBe('IN_POSITION');
    });

    it('calls evaluate when ready, not paused, no contracts', () => {
      const { bot } = createMockBot();
      bot.indicatorEngine.isReady = jest.fn().mockReturnValue(true);
      bot.contractMonitor.hasActiveContracts = jest.fn().mockReturnValue(false);
      jest.spyOn(bot, '_evaluateTrade');
      bot._onTick({ quote: 100, epoch: 1000 });
      expect(bot._evaluateTrade).toHaveBeenCalled();
    });
  });

  describe('_evaluateTrade', () => {
    it('calls decisionEngine.evaluate with indicators', () => {
      const { bot } = createMockBot();
      bot.decisionEngine.evaluate = jest.fn().mockReturnValue({ action: 'SKIP' });
      bot._evaluateTrade({ quote: 100 });
      expect(bot.decisionEngine.evaluate).toHaveBeenCalled();
    });

    it('sets ENTERING state on ENTER signal', () => {
      const { bot } = createMockBot();
      bot.decisionEngine.evaluate = jest.fn().mockReturnValue({ action: 'ENTER', direction: 'PUT', score: 7 });
      bot._tradeInProgress = true;
      bot._evaluateTrade({ quote: 100 });
      expect(bot.state).toBe('ENTERING');
    });

    it('sets SKIP state on SKIP action', () => {
      const { bot } = createMockBot();
      bot.decisionEngine.evaluate = jest.fn().mockReturnValue({ action: 'SKIP', reason: 'cooldown' });
      bot._evaluateTrade({ quote: 100 });
      expect(bot.state).toBe('SKIP');
    });
  });

  describe('_onEnterSignal', () => {
    const signal = { direction: 'CALL', price: 100, score: 7, scoreComponents: { rsi: 4, momentum: 3 } };

    function setupEnter(bot) {
      bot.connectionManager.isAuthorized = jest.fn().mockReturnValue(true);
      bot.contractMonitor.hasActiveContracts = jest.fn().mockReturnValue(false);
      bot.tradeExecutor.executeTrade = jest.fn().mockResolvedValue({ success: true });
    }

    it('sets tradeInProgress and executingTrade', () => {
      const { bot } = createMockBot();
      setupEnter(bot);
      bot._onEnterSignal(signal);
      expect(bot._tradeInProgress).toBe(true);
      expect(bot._executingTrade).toBe(true);
    });

    it('calls executeTrade', () => {
      const { bot } = createMockBot();
      setupEnter(bot);
      bot._onEnterSignal(signal);
      expect(bot.tradeExecutor.executeTrade).toHaveBeenCalled();
    });

    it('skips when paused', () => {
      const { bot } = createMockBot();
      bot._paused = true;
      bot.tradeExecutor.executeTrade = jest.fn();
      bot._onEnterSignal(signal);
      expect(bot.tradeExecutor.executeTrade).not.toHaveBeenCalled();
    });

    it('skips when executingTrade is already true', () => {
      const { bot } = createMockBot();
      bot._executingTrade = true;
      bot.tradeExecutor.executeTrade = jest.fn();
      bot._onEnterSignal(signal);
      expect(bot.tradeExecutor.executeTrade).not.toHaveBeenCalled();
    });

    it('skips when tradeInProgress is already true', () => {
      const { bot } = createMockBot();
      bot._tradeInProgress = true;
      bot.tradeExecutor.executeTrade = jest.fn();
      bot._onEnterSignal(signal);
      expect(bot.tradeExecutor.executeTrade).not.toHaveBeenCalled();
    });

    it('skips duplicate entry on same tick', () => {
      const { bot } = createMockBot();
      bot.tickIndex = 5;
      bot._lastEntryTickIndex = 5;
      bot.tradeExecutor.executeTrade = jest.fn();
      bot._onEnterSignal(signal);
      expect(bot.tradeExecutor.executeTrade).not.toHaveBeenCalled();
    });

    it('skips when entry cooldown not elapsed', () => {
      const { bot } = createMockBot();
      bot._lastEntryAttemptTick = 95;
      bot.tickIndex = 100;
      bot._entryCooldownTicks = 10;
      bot.tradeExecutor.executeTrade = jest.fn();
      bot._onEnterSignal(signal);
      expect(bot.tradeExecutor.executeTrade).not.toHaveBeenCalled();
    });

    it('skips when already in position', () => {
      const { bot } = createMockBot();
      bot.contractMonitor.hasActiveContracts = jest.fn().mockReturnValue(true);
      bot.tradeExecutor.executeTrade = jest.fn();
      bot._onEnterSignal(signal);
      expect(bot.tradeExecutor.executeTrade).not.toHaveBeenCalled();
    });

    it('skips when not authorized', () => {
      const { bot } = createMockBot();
      bot.connectionManager.isAuthorized = jest.fn().mockReturnValue(false);
      bot.tradeExecutor.executeTrade = jest.fn();
      bot._onEnterSignal(signal);
      expect(bot.tradeExecutor.executeTrade).not.toHaveBeenCalled();
    });

    it('applies volatility filter', () => {
      const { bot } = createMockBot();
      bot.connectionManager.isAuthorized = jest.fn().mockReturnValue(true);
      bot.contractMonitor.hasActiveContracts = jest.fn().mockReturnValue(false);
      bot.config.volatilityThreshold = 5;
      bot.config.volatilityLookbackTicks = 3;
      bot.tickStream.getBuffer = jest.fn().mockReturnValue([
        { quote: 100 }, { quote: 102 }, { quote: 108 },
      ]);
      bot.tradeExecutor.executeTrade = jest.fn();
      bot._onEnterSignal(signal);
      expect(bot.tradeExecutor.executeTrade).not.toHaveBeenCalled();
      expect(bot._executingTrade).toBe(false);
    });

    it('logs signal via tradeLogger', () => {
      const { bot } = createMockBot();
      setupEnter(bot);
      bot.tradeLogger.logSignal = jest.fn().mockReturnValue(1);
      bot._onEnterSignal(signal);
      expect(bot.tradeLogger.logSignal).toHaveBeenCalledWith(expect.objectContaining({
        direction: 'CALL',
        score: 7,
      }));
    });
  });

  describe('_onTradeExecuted', () => {
    it('sets IN_POSITION on successful execution', () => {
      const { bot } = createMockBot();
      bot._executingTrade = true;
      bot._currentTrade = { signal: { direction: 'CALL' }, entryTickIndex: 0 };
      bot._onTradeExecuted({ success: true, contractId: 'c1', entryPrice: 100, stake: 2, contractType: 'MULTUP' });
      expect(bot._tradeInProgress).toBe(false);
      expect(bot._executingTrade).toBe(false);
    });

    it('sets COLLECTING state on failure', () => {
      const { bot } = createMockBot();
      bot._onTradeExecuted({ success: false, error: 'buy_rejected' });
      expect(bot.state).toBe('COLLECTING');
    });

    it('rejects stale result when not in ENTERING state', () => {
      const { bot } = createMockBot();
      bot._executingTrade = true;
      bot.tradeExecutor.sellContract = jest.fn().mockResolvedValue(undefined);
      bot._onTradeExecuted({ success: true, contractId: 'c1', entryPrice: 100, stake: 2 });
      expect(bot.tradeExecutor.sellContract).toHaveBeenCalledWith('c1');
    });
  });

  describe('_onContractResolved', () => {
    const resolvedResult = {
      localId: 'BC-0001', contractId: 'c1', direction: 'CALL', win: true,
      pnl: 0.80, entryPrice: 100, exitPrice: 101, stake: 2,
      score: 7, scoreComponents: {}, durationTicks: 5,
      contractType: 'MULTUP', entryEpoch: 1000, exitEpoch: 1005, exitReason: 'TICK_RESOLVED',
    };

    it('records trade in risk manager', () => {
      const { bot } = createMockBot();
      bot.riskManager.recordTrade = jest.fn();
      bot.riskManager.currentBalance = 100;
      bot._onContractResolved(resolvedResult);
      expect(bot.riskManager.recordTrade).toHaveBeenCalledWith(resolvedResult);
    });

    it('logs trade via tradeLogger', () => {
      const { bot } = createMockBot();
      bot.tradeLogger.logTrade = jest.fn().mockReturnValue(1);
      bot._onContractResolved(resolvedResult);
      expect(bot.tradeLogger.logTrade).toHaveBeenCalled();
    });

    it('starts cooldown on loss', () => {
      const { bot } = createMockBot();
      bot.decisionEngine.setCooldownAfterLoss = jest.fn();
      bot._onContractResolved({ ...resolvedResult, win: false, pnl: -0.50 });
      expect(bot.decisionEngine.setCooldownAfterLoss).toHaveBeenCalledWith(true, 0);
    });

    it('starts cooldown on win', () => {
      const { bot } = createMockBot();
      bot.decisionEngine.startCooldown = jest.fn();
      bot._onContractResolved(resolvedResult);
      expect(bot.decisionEngine.startCooldown).toHaveBeenCalled();
    });

    it('sets COOLDOWN state', () => {
      const { bot } = createMockBot();
      bot._onContractResolved(resolvedResult);
      expect(bot.state).toBe('COOLDOWN');
    });
  });

  describe('_onMultiplierResolved', () => {
    const result = { contractId: 'c1', win: true, pnl: 0.80, exitPrice: 101, exitReason: 'MANUAL_SELL' };

    it('resolves contract in monitor when localId is found', () => {
      const { bot } = createMockBot();
      bot.contractMonitor.resolveContract = jest.fn();
      bot._contractIdToLocalId.set('c1', 'BC-0001');
      bot._onMultiplierResolved(result);
      expect(bot.contractMonitor.resolveContract).toHaveBeenCalledWith('BC-0001', {
        win: true, pnl: 0.80, exitPrice: 101, exitReason: 'MANUAL_SELL',
      });
    });

    it('removes mapping after resolution', () => {
      const { bot } = createMockBot();
      bot._contractIdToLocalId.set('c1', 'BC-0001');
      bot._onMultiplierResolved(result);
      expect(bot._contractIdToLocalId.has('c1')).toBe(false);
    });

    it('ignores unknown contract IDs', () => {
      const { bot } = createMockBot();
      bot.contractMonitor.resolveContract = jest.fn();
      bot._onMultiplierResolved(result);
      expect(bot.contractMonitor.resolveContract).not.toHaveBeenCalled();
    });
  });

  describe('restoreSession', () => {
    it('restores risk manager state from DB', async () => {
      const { bot } = createMockBot();
      bot.tradeLogger.getTodayStats = jest.fn().mockReturnValue({ total: 5, wins: 3, netPnl: 1.50 });
      bot.riskManager.resetDaily = jest.fn();
      bot.riskManager.restoreFromDb = jest.fn();
      await bot.restoreSession();
      expect(bot.riskManager.resetDaily).toHaveBeenCalled();
      expect(bot.riskManager.restoreFromDb).toHaveBeenCalledWith({ total: 5, wins: 3, netPnl: 1.50 });
    });

    it('handles null stats gracefully', async () => {
      const { bot } = createMockBot();
      bot.tradeLogger.getTodayStats = jest.fn().mockReturnValue(null);
      bot.riskManager.resetDaily = jest.fn();
      await bot.restoreSession();
      expect(bot.riskManager.resetDaily).not.toHaveBeenCalled();
    });

    it('handles stats with zero total gracefully', async () => {
      const { bot } = createMockBot();
      bot.tradeLogger.getTodayStats = jest.fn().mockReturnValue({ total: 0 });
      bot.riskManager.resetDaily = jest.fn();
      await bot.restoreSession();
      expect(bot.riskManager.resetDaily).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns status object with expected fields', () => {
      const { bot } = createMockBot();
      const status = bot.getStatus();
      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('tickIndex');
      expect(status).toHaveProperty('connectionState');
      expect(status).toHaveProperty('bufferSize');
      expect(status).toHaveProperty('indicatorsReady');
      expect(status).toHaveProperty('activeContracts');
      expect(status).toHaveProperty('risk');
      expect(status).toHaveProperty('session');
      expect(status).toHaveProperty('liveBalance');
    });
  });

  describe('start', () => {
    it('sets running flag and initiates connection', async () => {
      const { bot } = createMockBot();
      bot.tradeLogger.init = jest.fn();
      jest.spyOn(bot, 'restoreSession').mockResolvedValue(undefined);
      bot.connectionManager.connect = jest.fn().mockResolvedValue(undefined);
      await bot.start();
      expect(bot._running).toBe(true);
      expect(bot.tradeLogger.init).toHaveBeenCalled();
      expect(bot.connectionManager.connect).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('sets stop flag and cleans up', async () => {
      const { bot } = createMockBot();
      bot.contractMonitor.hasActiveContracts = jest.fn().mockReturnValue(false);
      bot.tradeExecutor.cleanup = jest.fn();
      await bot.stop();
      expect(bot._stopRequested).toBe(true);
      expect(bot.tradeExecutor.cleanup).toHaveBeenCalled();
    });
  });
});
