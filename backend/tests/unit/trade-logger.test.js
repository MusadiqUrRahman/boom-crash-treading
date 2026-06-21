const path = require('path');
const os = require('os');
const fs = require('fs');

const TradeLogger = require('../../src/trade-logger');

function makeTradeRecord(overrides = {}) {
  return {
    contractId: 'c1',
    localId: 'BC-0001',
    symbol: '1HZ100V',
    direction: 'CALL',
    stake: 2.00,
    payoutRate: 0.80,
    entryPrice: 100,
    exitPrice: 101,
    entryEpoch: 1000,
    exitEpoch: 1005,
    durationTicks: 10,
    score: 7,
    scoreComponents: { rsi: 4, momentum: 3 },
    win: true,
    pnl: 0.80,
    balanceAfter: 100.80,
    dryRun: false,
    contractType: 'MULTUP',
    multiplier: 100,
    stopLoss: 0.50,
    takeProfit: 2.00,
    exitReason: 'SELL',
    ...overrides,
  };
}

function makeSignalData(overrides = {}) {
  return {
    timestamp: '2026-01-01T00:00:00.000Z',
    epoch: 1000,
    price: 100,
    direction: 'CALL',
    score: 7,
    scoreComponents: { rsi: 4, momentum: 3, bb: 1, ema: 0, roc: 0, spikePenalty: 0 },
    indicatorsJson: '{"rsi":75}',
    contractType: 'MULTUP',
    ...overrides,
  };
}

function getTempDbPath() {
  return path.join(os.tmpdir(), `trade-logger-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe('TradeLogger', () => {
  let logger;
  let dbPath;

  afterEach(() => {
    if (logger) {
      try { logger.close(); } catch {}
    }
    if (dbPath && fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch {}
    }
  });

  describe('constructor', () => {
    it('initializes with dbPath and defaultContractType', () => {
      logger = new TradeLogger(':memory:', null, 'MULTDOWN');
      expect(logger.defaultContractType).toBe('MULTDOWN');
    });

    it('defaults contractType to MULTDOWN', () => {
      logger = new TradeLogger(':memory:');
      expect(logger.defaultContractType).toBe('MULTDOWN');
    });
  });

  describe('init and schema creation', () => {
    it('creates tables on init', () => {
      logger = new TradeLogger(':memory:');
      logger.init();
      const tables = logger.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all().map(r => r.name);
      expect(tables).toContain('trades');
      expect(tables).toContain('signals');
      expect(tables).toContain('daily_stats');
    });

    it('creates with file path', () => {
      dbPath = getTempDbPath();
      logger = new TradeLogger(dbPath);
      logger.init();
      expect(fs.existsSync(dbPath)).toBe(true);
    });
  });

  describe('logTrade', () => {
    beforeEach(() => {
      logger = new TradeLogger(':memory:');
      logger.init();
    });

    it('inserts a trade record and returns row id', () => {
      const id = logger.logTrade(makeTradeRecord());
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    it('stores all trade fields correctly', () => {
      logger.logTrade(makeTradeRecord());
      const row = logger.db.prepare('SELECT * FROM trades WHERE id = 1').get();
      expect(row.contract_id).toBe('c1');
      expect(row.symbol).toBe('1HZ100V');
      expect(row.direction).toBe('CALL');
      expect(row.stake).toBe(2.00);
      expect(row.win).toBe(1);
      expect(row.pnl).toBe(0.80);
      expect(row.contract_type).toBe('MULTUP');
      expect(row.multiplier).toBe(100);
    });
  });

  describe('logSignal', () => {
    beforeEach(() => {
      logger = new TradeLogger(':memory:');
      logger.init();
    });

    it('inserts a signal and returns row id', () => {
      const id = logger.logSignal(makeSignalData());
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    it('stores signal fields correctly', () => {
      logger.logSignal(makeSignalData());
      const row = logger.db.prepare('SELECT * FROM signals WHERE id = 1').get();
      expect(row.direction).toBe('CALL');
      expect(row.score).toBe(7);
      expect(row.contract_type).toBe('MULTUP');
    });

    it('uses defaultContractType when not provided', () => {
      logger = new TradeLogger(':memory:', null, 'MULTDOWN');
      logger.init();
      logger.logSignal(makeSignalData({ contractType: undefined }));
      const row = logger.db.prepare('SELECT * FROM signals WHERE id = 1').get();
      expect(row.contract_type).toBe('MULTDOWN');
    });
  });

  describe('updateSignalWithTrade', () => {
    beforeEach(() => {
      logger = new TradeLogger(':memory:');
      logger.init();
    });

    it('updates signal with trade outcome', () => {
      const signalId = logger.logSignal(makeSignalData());
      logger.updateSignalWithTrade(signalId, 'WIN', 0.80, 'c1', 1);
      const row = logger.db.prepare('SELECT * FROM signals WHERE id = ?').get(signalId);
      expect(row.resolved).toBe(1);
      expect(row.outcome).toBe('WIN');
      expect(row.pnl).toBe(0.80);
      expect(row.contract_id).toBe('c1');
    });
  });

  describe('getSignals', () => {
    beforeEach(() => {
      logger = new TradeLogger(':memory:');
      logger.init();
    });

    it('returns signals ordered by id DESC', () => {
      logger.logSignal(makeSignalData({ score: 5 }));
      logger.logSignal(makeSignalData({ score: 7 }));
      const signals = logger.getSignals(10, 0);
      expect(signals).toHaveLength(2);
      expect(signals[0].score).toBe(7);
    });

    it('respects limit and offset', () => {
      logger.logSignal(makeSignalData({ score: 5 }));
      logger.logSignal(makeSignalData({ score: 7 }));
      logger.logSignal(makeSignalData({ score: 6 }));
      const signals = logger.getSignals(2, 1);
      expect(signals).toHaveLength(2);
    });
  });

  describe('getPendingSignals', () => {
    beforeEach(() => {
      logger = new TradeLogger(':memory:');
      logger.init();
    });

    it('returns only unresolved signals', () => {
      const id1 = logger.logSignal(makeSignalData());
      logger.logSignal(makeSignalData());
      logger.updateSignalWithTrade(id1, 'WIN', 0.50, 'c1', 1);
      const pending = logger.getPendingSignals();
      expect(pending).toHaveLength(1);
    });
  });

  describe('getTradesToday', () => {
    it('returns trades created today', () => {
      logger = new TradeLogger(':memory:');
      logger.init();
      logger.logTrade(makeTradeRecord());
      const trades = logger.getTradesToday();
      expect(trades).toHaveLength(1);
    });
  });

  describe('getDailyStats', () => {
    beforeEach(() => {
      logger = new TradeLogger(':memory:');
      logger.init();
    });

    it('returns zeros when no trades', () => {
      const stats = logger.getDailyStats();
      expect(stats.total).toBe(0);
      expect(stats.wins).toBeNull();
      expect(stats.losses).toBeNull();
      expect(stats.consecutiveLosses).toBe(0);
    });

    it('aggregates trade stats correctly', () => {
      logger.logTrade(makeTradeRecord({ win: true, pnl: 0.80 }));
      logger.logTrade(makeTradeRecord({ win: false, pnl: -0.50, direction: 'PUT', contractId: 'c2' }));
      const stats = logger.getDailyStats();
      expect(stats.total).toBe(2);
      expect(stats.wins).toBe(1);
      expect(stats.losses).toBe(1);
      expect(stats.netPnl).toBeCloseTo(0.30, 2);
    });

    it('computes consecutive losses from recent trades', () => {
      logger.logTrade(makeTradeRecord({ win: true, pnl: 0.50 }));
      logger.logTrade(makeTradeRecord({ win: false, pnl: -0.50, direction: 'PUT', contractId: 'c2' }));
      logger.logTrade(makeTradeRecord({ win: false, pnl: -0.50, direction: 'PUT', contractId: 'c3' }));
      const stats = logger.getDailyStats();
      expect(stats.consecutiveLosses).toBe(2);
    });
  });

  describe('getTodayStats', () => {
    beforeEach(() => {
      logger = new TradeLogger(':memory:');
      logger.init();
    });

    it('returns today aggregated stats with consecutive losses', () => {
      logger.logTrade(makeTradeRecord({ win: false, pnl: -0.50, direction: 'PUT', contractId: 'c1' }));
      logger.logTrade(makeTradeRecord({ win: false, pnl: -0.50, direction: 'PUT', contractId: 'c2' }));
      const stats = logger.getTodayStats();
      expect(stats.total).toBe(2);
      expect(stats.consecutiveLosses).toBe(2);
    });
  });

  describe('logDailyStats', () => {
    beforeEach(() => {
      logger = new TradeLogger(':memory:');
      logger.init();
    });

    it('inserts daily stats row', () => {
      logger.logDailyStats('2026-01-01', '1HZ100V', 10, 7, 3, 2.50, 102.50);
      const row = logger.db.prepare('SELECT * FROM daily_stats WHERE date = ?').get('2026-01-01');
      expect(row.trades).toBe(10);
      expect(row.wins).toBe(7);
      expect(row.pnl).toBe(2.50);
    });

    it('updates existing daily stats', () => {
      logger.logDailyStats('2026-01-01', '1HZ100V', 5, 3, 2, 1.00, 101.00);
      logger.logDailyStats('2026-01-01', '1HZ100V', 10, 7, 3, 2.50, 102.50);
      const rows = logger.db.prepare('SELECT * FROM daily_stats').all();
      expect(rows).toHaveLength(1);
      expect(rows[0].trades).toBe(10);
    });
  });

  describe('getRecentTrades', () => {
    beforeEach(() => {
      logger = new TradeLogger(':memory:');
      logger.init();
    });

    it('returns trades ordered by id DESC', () => {
      logger.logTrade(makeTradeRecord({ contractId: 'c1' }));
      logger.logTrade(makeTradeRecord({ contractId: 'c2' }));
      const trades = logger.getRecentTrades(10);
      expect(trades).toHaveLength(2);
      expect(trades[0].contract_id).toBe('c2');
    });

    it('respects limit', () => {
      logger.logTrade(makeTradeRecord({ contractId: 'c1' }));
      logger.logTrade(makeTradeRecord({ contractId: 'c2' }));
      logger.logTrade(makeTradeRecord({ contractId: 'c3' }));
      expect(logger.getRecentTrades(2)).toHaveLength(2);
    });

    it('defaults to 20', () => {
      logger.logTrade(makeTradeRecord({ contractId: 'c1' }));
      expect(logger.getRecentTrades().length).toBe(1);
    });
  });

  describe('migration', () => {
    it('adds missing columns to trades table', () => {
      dbPath = getTempDbPath();
      logger = new TradeLogger(dbPath);
      logger.init();

      const cols = logger.db.prepare("SELECT name FROM pragma_table_info('trades')").all().map(r => r.name);
      expect(cols).toContain('contract_type');
      expect(cols).toContain('multiplier');
      expect(cols).toContain('stop_loss');
      expect(cols).toContain('take_profit');
      expect(cols).toContain('exit_reason');
    });
  });

  describe('edge cases', () => {
    it('handles null score components', () => {
      logger = new TradeLogger(':memory:');
      logger.init();
      const record = makeTradeRecord({ scoreComponents: null });
      expect(() => logger.logTrade(record)).not.toThrow();
    });

    it('handles signal without scoreComponents', () => {
      logger = new TradeLogger(':memory:');
      logger.init();
      expect(() => logger.logSignal(makeSignalData({ scoreComponents: null }))).not.toThrow();
    });

    it('handles empty signals list', () => {
      logger = new TradeLogger(':memory:');
      logger.init();
      expect(logger.getSignals()).toEqual([]);
    });
  });
});
