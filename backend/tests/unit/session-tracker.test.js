const SessionTracker = require('../../src/session-tracker');

function makeLogger() {
  return { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() };
}

function winResult(pnl, stake) {
  return { win: true, pnl: pnl || 0.50, stake: stake || 2.00 };
}

function lossResult(pnl, stake) {
  return { win: false, pnl: pnl || -0.50, stake: stake || 2.00 };
}

describe('SessionTracker', () => {
  let st;
  let logger;

  beforeEach(() => {
    logger = makeLogger();
    st = new SessionTracker(logger);
  });

  describe('initial state', () => {
    it('starts with zero counters', () => {
      expect(st.trades).toBe(0);
      expect(st.wins).toBe(0);
      expect(st.losses).toBe(0);
      expect(st.totalPnL).toBe(0);
      expect(st.totalStake).toBe(0);
      expect(st.maxDrawdown).toBe(0);
      expect(st.consecutiveWins).toBe(0);
      expect(st.consecutiveLosses).toBe(0);
    });
  });

  describe('recordTrade', () => {
    it('increments trades on each call', () => {
      st.recordTrade(winResult(), 100);
      expect(st.trades).toBe(1);
      st.recordTrade(winResult(), 100);
      expect(st.trades).toBe(2);
    });

    it('tracks win correctly', () => {
      st.recordTrade(winResult(), 100);
      expect(st.wins).toBe(1);
      expect(st.losses).toBe(0);
      expect(st.consecutiveWins).toBe(1);
      expect(st.consecutiveLosses).toBe(0);
    });

    it('tracks loss correctly', () => {
      st.recordTrade(lossResult(), 100);
      expect(st.wins).toBe(0);
      expect(st.losses).toBe(1);
      expect(st.consecutiveWins).toBe(0);
      expect(st.consecutiveLosses).toBe(1);
    });

    it('accumulates total PnL', () => {
      st.recordTrade(winResult(0.50), 100);
      st.recordTrade(lossResult(-0.30), 100.50);
      expect(st.totalPnL).toBeCloseTo(0.20, 2);
    });

    it('tracks totalStake', () => {
      st.recordTrade(winResult(0.50, 2.00), 100);
      st.recordTrade(winResult(0.50, 1.50), 100.50);
      expect(st.totalStake).toBeCloseTo(3.50, 2);
    });

    it('updates currentBalance correctly', () => {
      st.recordTrade(winResult(0.50), 100);
      expect(st.currentBalance).toBe(100.50);
      st.recordTrade(lossResult(-0.50), 100.50);
      expect(st.currentBalance).toBe(100.00);
    });

    it('updates peakBalance', () => {
      st.recordTrade(winResult(0.50), 100);
      expect(st.peakBalance).toBe(100.50);
      st.recordTrade(lossResult(-0.30), 100.50);
      expect(st.peakBalance).toBe(100.50);
    });

    it('tracks max drawdown', () => {
      st.recordTrade(winResult(5.00), 100);
      expect(st.peakBalance).toBe(105.00);
      st.recordTrade(lossResult(-10.00), 105.00);
      expect(st.maxDrawdown).toBe(10.00);
    });
  });

  describe('consecutive tracking', () => {
    it('tracks consecutive wins', () => {
      st.recordTrade(winResult(), 100);
      st.recordTrade(winResult(), 100.50);
      st.recordTrade(winResult(), 101);
      expect(st.consecutiveWins).toBe(3);
      expect(st.consecutiveLosses).toBe(0);
    });

    it('resets consecutive wins on loss', () => {
      st.recordTrade(winResult(), 100);
      st.recordTrade(winResult(), 100.50);
      st.recordTrade(lossResult(), 101);
      expect(st.consecutiveWins).toBe(0);
      expect(st.consecutiveLosses).toBe(1);
    });

    it('resets consecutive losses on win', () => {
      st.recordTrade(lossResult(), 100);
      st.recordTrade(lossResult(), 99.50);
      st.recordTrade(winResult(), 99);
      expect(st.consecutiveLosses).toBe(0);
      expect(st.consecutiveWins).toBe(1);
    });
  });

  describe('getWinRate', () => {
    it('returns 0 when no trades', () => {
      expect(st.getWinRate()).toBe(0);
    });

    it('returns ratio of wins to trades', () => {
      st.recordTrade(winResult(), 100);
      st.recordTrade(winResult(), 100.50);
      st.recordTrade(lossResult(), 101);
      expect(st.getWinRate()).toBeCloseTo(2 / 3, 5);
    });
  });

  describe('getProfitFactor', () => {
    it('returns 0 when no trades', () => {
      expect(st.getProfitFactor()).toBe(0);
    });

    it('returns Infinity when no losses', () => {
      st.recordTrade(winResult(1.00), 100);
      st.recordTrade(winResult(0.50), 101);
      expect(st.getProfitFactor()).toBe(Infinity);
    });

    it('returns Infinity when overall profitable', () => {
      st.recordTrade(winResult(2.00), 100);
      st.recordTrade(lossResult(-1.00), 102);
      expect(st.getProfitFactor()).toBe(Infinity);
    });
  });

  describe('getAvgPnL', () => {
    it('returns 0 when no trades', () => {
      expect(st.getAvgPnL()).toBe(0);
    });

    it('returns average PnL', () => {
      st.recordTrade(winResult(0.50), 100);
      st.recordTrade(lossResult(-0.10), 100.50);
      expect(st.getAvgPnL()).toBeCloseTo(0.20, 2);
    });
  });

  describe('getStatus', () => {
    it('returns all status fields', () => {
      const status = st.getStatus();
      expect(status).toHaveProperty('sessionDuration');
      expect(status).toHaveProperty('trades');
      expect(status).toHaveProperty('wins');
      expect(status).toHaveProperty('losses');
      expect(status).toHaveProperty('winRate');
      expect(status).toHaveProperty('totalPnL');
      expect(status).toHaveProperty('avgPnL');
      expect(status).toHaveProperty('profitFactor');
      expect(status).toHaveProperty('maxDrawdown');
      expect(status).toHaveProperty('consecutiveWins');
      expect(status).toHaveProperty('consecutiveLosses');
      expect(status).toHaveProperty('totalStake');
    });

    it('reflects recorded trades', () => {
      st.recordTrade(winResult(0.50), 100);
      st.recordTrade(winResult(0.50), 100.50);
      st.recordTrade(lossResult(-0.50), 101);
      const s = st.getStatus();
      expect(s.trades).toBe(3);
      expect(s.wins).toBe(2);
      expect(s.losses).toBe(1);
      expect(parseFloat(s.winRate)).toBeCloseTo(66.7, 0);
      expect(s.totalPnL).toBeCloseTo(0.50, 2);
    });

    it('formats profitFactor as Inf when infinite', () => {
      st.recordTrade(winResult(0.50), 100);
      expect(st.getStatus().profitFactor).toBe('Inf');
    });
  });

  describe('resetAll', () => {
    it('resets all counters to zero', () => {
      st.recordTrade(winResult(), 100);
      st.recordTrade(lossResult(), 100.50);
      st.resetAll();
      expect(st.trades).toBe(0);
      expect(st.wins).toBe(0);
      expect(st.losses).toBe(0);
      expect(st.totalPnL).toBe(0);
    });
  });

  describe('printSummary', () => {
    it('logs summary to logger', () => {
      st.recordTrade(winResult(0.50), 100);
      st.printSummary();
      expect(logger.info).toHaveBeenCalled();
      expect(logger.info.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });
});
