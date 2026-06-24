const TradeExecutor = require('../../src/trade-executor');

function makeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function makeConfig(overrides = {}) {
  return {
    dryRun: false,
    stake: 2.00,
    symbol: '1HZ100V',
    multiplier: 100,
    contractMinStake: 0,
    stopLoss: 0.50,
    takeProfit: 2.00,
    ...overrides,
  };
}

function makeConnectionManager(overrides = {}) {
  return {
    isAuthorized: jest.fn().mockReturnValue(true),
    api: {
      send: jest.fn(),
      subscribe: jest.fn(),
    },
    ...overrides,
  };
}

function makeProposalResponse(overrides = {}) {
  return {
    proposal: {
      id: 'prop1',
      ask_price: 2.00,
      spot: 100.5,
      ...overrides,
    },
  };
}

function makeBuyResponse(overrides = {}) {
  return {
    buy: {
      contract_id: 'contract1',
      buy_price: 2.00,
      payout: 0,
      transaction_id: 'tx1',
      balance_after: 98.00,
      ...overrides,
    },
  };
}

describe('TradeExecutor', () => {
  let executor;
  let config;
  let cm;
  let logger;

  beforeEach(() => {
    config = makeConfig();
    cm = makeConnectionManager();
    logger = makeLogger();
    executor = new TradeExecutor(config, cm, logger);
  });

  describe('constructor', () => {
    it('initializes with config', () => {
      expect(executor.config).toBe(config);
      expect(executor.dryRun).toBe(false);
      expect(executor._contractStreams.size).toBe(0);
    });

    it('defaults dryRun to true when config has dryRun', () => {
      const dry = new TradeExecutor(makeConfig({ dryRun: true }), cm, logger);
      expect(dry.dryRun).toBe(true);
    });
  });

  describe('_toContractType', () => {
    it('returns MULTDOWN for PUT', () => {
      expect(executor._toContractType('PUT')).toBe('MULTDOWN');
    });

    it('returns MULTUP for CALL', () => {
      expect(executor._toContractType('CALL')).toBe('MULTUP');
    });
  });

  describe('_buildContract', () => {
    it('builds multiplier contract for PUT', () => {
      const contract = executor._buildContract('PUT');
      expect(contract.contract_type).toBe('MULTDOWN');
      expect(contract.multiplier).toBe(100);
      expect(contract.underlying_symbol).toBe('1HZ100V');
    });

    it('builds multiplier contract for CALL', () => {
      const contract = executor._buildContract('CALL');
      expect(contract.contract_type).toBe('MULTUP');
    });
  });

  describe('executeTrade - dry run', () => {
    beforeEach(() => {
      executor.dryRun = true;
    });

    it('returns success without calling API', async () => {
      const result = await executor.executeTrade('PUT', 100, 7, {});
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.contractId).toBeNull();
      expect(cm.api.send).not.toHaveBeenCalled();
    });

    it('emits tradeExecuted event', async () => {
      const handler = jest.fn();
      executor.on('tradeExecuted', handler);
      await executor.executeTrade('CALL', 100, 7, {});
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        dryRun: true,
        direction: 'CALL',
      }));
    });
  });

  describe('executeTrade - not authorized', () => {
    beforeEach(() => {
      cm.isAuthorized.mockReturnValue(false);
    });

    it('returns not_authorized error', async () => {
      const result = await executor.executeTrade('PUT', 100, 7, {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('not_authorized');
    });
  });

  describe('executeTrade - proposal flow', () => {
    beforeEach(() => {
      cm.api.send.mockResolvedValue(makeProposalResponse());
    });

    it('sends proposal with correct contract', async () => {
      cm.api.send.mockResolvedValueOnce(makeProposalResponse());
      cm.api.send.mockResolvedValueOnce(makeBuyResponse());
      await executor.executeTrade('PUT', 100, 7, {});
      expect(cm.api.send).toHaveBeenNthCalledWith(1, expect.objectContaining({
        proposal: 1,
        contract_type: 'MULTDOWN',
        multiplier: 100,
      }));
    });

    it('buys after successful proposal', async () => {
      cm.api.send.mockResolvedValueOnce(makeProposalResponse());
      cm.api.send.mockResolvedValueOnce(makeBuyResponse());
      await executor.executeTrade('PUT', 100, 7, {});
      expect(cm.api.send).toHaveBeenNthCalledWith(2, expect.objectContaining({
        buy: 'prop1',
        price: 2.00,
      }));
    });

    it('returns successful trade result', async () => {
      cm.api.send.mockResolvedValueOnce(makeProposalResponse());
      cm.api.send.mockResolvedValueOnce(makeBuyResponse());
      const result = await executor.executeTrade('CALL', 100.5, 7, {});
      expect(result.success).toBe(true);
      expect(result.contractId).toBe('contract1');
      expect(result.entryPrice).toBe(100.5);
    });

    it('emits tradeExecuted on success', async () => {
      const handler = jest.fn();
      executor.on('tradeExecuted', handler);
      cm.api.send.mockResolvedValueOnce(makeProposalResponse());
      cm.api.send.mockResolvedValueOnce(makeBuyResponse());
      await executor.executeTrade('PUT', 100, 7, {});
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        contractId: 'contract1',
      }));
    });

    it('uses customStake when provided', async () => {
      cm.api.send.mockResolvedValueOnce(makeProposalResponse());
      cm.api.send.mockResolvedValueOnce(makeBuyResponse());
      await executor.executeTrade('PUT', 100, 7, {}, 3.00, 'sig1');
      expect(cm.api.send).toHaveBeenNthCalledWith(1, expect.objectContaining({
        amount: 3.00,
      }));
    });

    it('raises stake to contractMinStake when below minimum', async () => {
      const minCfg = makeConfig({ contractMinStake: 1.00 });
      const ex = new TradeExecutor(minCfg, cm, logger);
      cm.api.send.mockResolvedValueOnce(makeProposalResponse());
      cm.api.send.mockResolvedValueOnce(makeBuyResponse());
      await ex.executeTrade('PUT', 100, 7, {}, 0.50, 'sig1');
      expect(cm.api.send).toHaveBeenNthCalledWith(1, expect.objectContaining({
        amount: 1.00,
      }));
    });
  });

  describe('executeTrade - proposal rejection', () => {
    it('handles proposal rejection with error message', async () => {
      cm.api.send.mockResolvedValue({ error: { message: 'InvalidContract', code: 'InvalidContract' } });
      const result = await executor.executeTrade('PUT', 100, 7, {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('InvalidContract');
    });

    it('handles proposal timeout', async () => {
      cm.api.send.mockImplementation(() => new Promise(() => {}));
      const result = await executor.executeTrade('PUT', 100, 7, {});
      expect(result.success).toBe(false);
    }, 12000);
  });

  describe('executeTrade - buy rejection', () => {
    it('handles buy rejection', async () => {
      cm.api.send.mockResolvedValueOnce(makeProposalResponse());
      cm.api.send.mockResolvedValueOnce({ error: { message: 'BuyFailed' } });
      const result = await executor.executeTrade('PUT', 100, 7, {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('BuyFailed');
    });
  });

  describe('executeTrade - error handling', () => {
    it('handles not_authorized in error message', async () => {
      cm.api.send.mockRejectedValue(new Error('not_authorized'));
      const result = await executor.executeTrade('PUT', 100, 7, {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('not_authorized');
    });

    it('handles generic errors', async () => {
      cm.api.send.mockRejectedValue(new Error('Network error'));
      const result = await executor.executeTrade('PUT', 100, 7, {});
      expect(result.success).toBe(false);
    });
  });

  describe('setStopLossTakeProfit', () => {
    it('sends contract_update with SL/TP', async () => {
      cm.api.send.mockResolvedValue({ contract_update: {} });
      await executor._setStopLossTakeProfit('contract1');
      expect(cm.api.send).toHaveBeenCalledWith(expect.objectContaining({
        contract_update: 1,
        contract_id: 'contract1',
        limit_order: { stop_loss: 0.50, take_profit: 2.00 },
      }));
    });

    it('returns null on failure', async () => {
      cm.api.send.mockRejectedValue(new Error('Timeout'));
      const result = await executor._setStopLossTakeProfit('contract1');
      expect(result).toBeNull();
    });
  });

  describe('sellContract', () => {
    it('sends sell request with fetched bid price', async () => {
      cm.api.send
        .mockResolvedValueOnce({ proposal_open_contract: { bid_price: '1.50' } })
        .mockResolvedValueOnce({ sell: { sold_for: '1.50', sold_contract: { buy_price: '2.00', sell_price: '1.50' } } });
      await executor.sellContract('contract1');
      expect(cm.api.send).toHaveBeenNthCalledWith(2, expect.objectContaining({ sell: 'contract1', price: 1.50 }));
    });

    it('falls back to fetch status after sell', async () => {
      cm.api.send
        .mockResolvedValueOnce({ proposal_open_contract: { bid_price: '1.50' } })
        .mockResolvedValueOnce({ sell: { sold_for: '1.50' } })
        .mockResolvedValueOnce({ proposal_open_contract: { buy_price: '2.00', sell_price: '1.50' } });
      await executor.sellContract('contract1');
      expect(cm.api.send).toHaveBeenCalledTimes(3);
    });

    it('handles sell failure gracefully', async () => {
      cm.api.send
        .mockResolvedValueOnce({ proposal_open_contract: { bid_price: '1.50' } })
        .mockRejectedValueOnce(new Error('Sell failed'))
        .mockResolvedValueOnce({ proposal_open_contract: { is_sold: true, buy_price: '2.00', sell_price: '1.50' } });
      await expect(executor.sellContract('contract1')).resolves.not.toThrow();
    });
  });

  describe('_subscribeContract', () => {
    it('subscribes to proposal_open_contract stream', () => {
      const subscription = { subscribe: jest.fn() };
      cm.api.subscribe.mockReturnValue(subscription);
      executor._subscribeContract('contract1', 100, 'MULTDOWN');
      expect(cm.api.subscribe).toHaveBeenCalledWith({
        proposal_open_contract: 1,
        contract_id: 'contract1',
        subscribe: 1,
      });
    });

    it('falls back to polling when subscribe fails', () => {
      cm.api.subscribe.mockImplementation(() => { throw new Error('Subscribe failed'); });
      jest.useFakeTimers();
      executor._subscribeContract('contract1', 100, 'MULTDOWN');
      expect(logger.warn).toHaveBeenCalledWith('TradeExecutor', expect.stringContaining('falling back to polling'));
      jest.useRealTimers();
    });
  });

  describe('_resolveContract', () => {
    it('resolves with correct win/pnl from poc data', () => {
      executor._contractStreams.set('contract1', { entryPrice: 100, contractType: 'MULTDOWN', resolved: false });
      const poc = { buy_price: '2.00', sell_price: '2.50', date_start: 1000 };
      const handler = jest.fn();
      executor.on('contractResolved', handler);
      executor._resolveContract('contract1', poc, 'AUTO_CLOSE');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        contractId: 'contract1',
        win: true,
        pnl: 0.50,
        exitReason: 'AUTO_CLOSE',
      }));
    });

    it('resolves as loss when sell < buy', () => {
      executor._contractStreams.set('contract1', { entryPrice: 100, contractType: 'MULTDOWN', resolved: false });
      const poc = { buy_price: '2.00', sell_price: '1.50', date_start: 1000 };
      const handler = jest.fn();
      executor.on('contractResolved', handler);
      executor._resolveContract('contract1', poc, 'STOP_LOSS');
      expect(handler.mock.calls[0][0].win).toBe(false);
      expect(handler.mock.calls[0][0].pnl).toBe(-0.50);
    });
  });

  describe('hasActiveContracts / getActiveContractIds', () => {
    it('returns false when no contracts', () => {
      expect(executor.hasActiveContracts()).toBe(false);
      expect(executor.getActiveContractIds()).toEqual([]);
    });

    it('returns true after adding contract', () => {
      executor._contractStreams.set('contract1', {});
      expect(executor.hasActiveContracts()).toBe(true);
      expect(executor.getActiveContractIds()).toEqual(['contract1']);
    });
  });

  describe('cleanup', () => {
    it('marks stopped and clears streams', () => {
      executor._contractStreams.set('contract1', { subscription: { unsubscribe: jest.fn() } });
      executor.cleanup();
      expect(executor._stopped).toBe(true);
      expect(executor._contractStreams.size).toBe(0);
    });
  });

  describe('_startPolling', () => {
    it('starts polling loop', () => {
      jest.useFakeTimers();
      const entry = { resolved: false, entryPrice: 100 };
      executor._startPolling('contract1', entry);
      jest.advanceTimersByTime(1000);
      expect(cm.api.send).toHaveBeenCalledWith({
        proposal_open_contract: 1,
        contract_id: 'contract1',
      });
      jest.useRealTimers();
    });
  });

  describe('reconnectContracts', () => {
    it('reconnects pending contracts after reconnect', async () => {
      executor._contractStreams.set('contract1', { entryPrice: 100, contractType: 'MULTDOWN', subscription: null, stake: 2, multiplier: 500 });
      const subscribeMock = jest.spyOn(executor, '_subscribeContract').mockImplementation(() => {});
      jest.spyOn(executor, '_setStopLossTakeProfit').mockResolvedValue({});
      await executor.reconnectContracts();
      expect(subscribeMock).toHaveBeenCalledWith('contract1', 100, 'MULTDOWN', 2, 500);
      subscribeMock.mockRestore();
    });
  });
});
