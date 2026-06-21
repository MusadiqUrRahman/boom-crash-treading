const RiskManager = require('../../src/risk-manager');

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

function defaultConfig(overrides = {}) {
  return {
    maxConsecutiveLosses: 5,
    maxDailyLoss: 10,
    maxDailyTrades: 100,
    maxDailyDrawdown: 0.10,
    startingBalance: 100,
    minStake: 0.35,
    ...overrides,
  };
}

function winResult(pnl) {
  return { win: true, pnl: pnl || 0.425 };
}

function lossResult(pnl) {
  return { win: false, pnl: pnl || -0.50 };
}

describe('RiskManager', () => {
  let rm;

  beforeEach(() => {
    rm = new RiskManager(defaultConfig(), silentLogger);
  });

  describe('initial state', () => {
    it('starts with zero counters and configured balance', () => {
      expect(rm.consecutiveLosses).toBe(0);
      expect(rm.dailyLoss).toBe(0);
      expect(rm.dailyTrades).toBe(0);
      expect(rm.dailyWins).toBe(0);
      expect(rm.dailyPnL).toBe(0);
      expect(rm.currentBalance).toBe(100);
      expect(rm.startingBalance).toBe(100);
    });

    it('allows trading initially', () => {
      expect(rm.canTrade()).toEqual({ allowed: true });
    });
  });

  describe('canTrade', () => {
    it('blocks when consecutive losses exceed limit', () => {
      rm.consecutiveLosses = 5;
      const result = rm.canTrade();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('circuit_breaker');
    });

    it('blocks when daily loss exceeds limit', () => {
      rm.dailyLoss = 10;
      const result = rm.canTrade();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('max_daily_loss');
    });

    it('blocks when daily trades exceed limit', () => {
      rm.dailyTrades = 100;
      const result = rm.canTrade();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('max_daily_trades');
    });

    it('blocks when drawdown exceeds max', () => {
      rm.startingBalance = 100;
      rm.currentBalance = 89;
      const result = rm.canTrade();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('max_daily_drawdown');
    });

    it('blocks when balance is below min stake', () => {
      rm = new RiskManager(defaultConfig({ maxDailyDrawdown: 0.99, startingBalance: 10 }), silentLogger);
      rm.currentBalance = 0.30;
      const result = rm.canTrade();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('insufficient_balance');
    });

    it('allows when at exact drawdown boundary', () => {
      rm.currentBalance = 90;
      expect(rm.canTrade().allowed).toBe(true);
    });

    it('allows when at exact trade limit boundary minus one', () => {
      rm.dailyTrades = 99;
      expect(rm.canTrade().allowed).toBe(true);
    });
  });

  describe('recordTrade', () => {
    it('increments daily trades on each call', () => {
      rm.recordTrade(winResult());
      expect(rm.dailyTrades).toBe(1);
      rm.recordTrade(winResult());
      expect(rm.dailyTrades).toBe(2);
    });

    describe('on win', () => {
      beforeEach(() => {
        rm.recordTrade(winResult(0.425));
      });

      it('increments wins', () => {
        expect(rm.dailyWins).toBe(1);
      });

      it('resets consecutive losses', () => {
        expect(rm.consecutiveLosses).toBe(0);
      });

      it('adds PnL to balance', () => {
        expect(rm.currentBalance).toBeCloseTo(100.425, 3);
      });

      it('adds PnL to daily PnL', () => {
        expect(rm.dailyPnL).toBeCloseTo(0.425, 3);
      });
    });

    describe('on loss', () => {
      beforeEach(() => {
        rm.recordTrade(lossResult(-0.50));
      });

      it('does not increment wins', () => {
        expect(rm.dailyWins).toBe(0);
      });

      it('increments consecutive losses', () => {
        expect(rm.consecutiveLosses).toBe(1);
      });

      it('adds negative PnL to balance', () => {
        expect(rm.currentBalance).toBeCloseTo(99.50, 3);
      });

      it('adds absolute loss to dailyLoss', () => {
        expect(rm.dailyLoss).toBeCloseTo(0.50, 3);
      });

      it('adds negative PnL to daily PnL', () => {
        expect(rm.dailyPnL).toBeCloseTo(-0.50, 3);
      });

      it('accumulates consecutive losses', () => {
        rm.recordTrade(lossResult(-0.50));
        expect(rm.consecutiveLosses).toBe(2);
        rm.recordTrade(lossResult(-0.50));
        expect(rm.consecutiveLosses).toBe(3);
      });
    });

    describe('win after loss streak', () => {
      it('resets consecutive losses to 0', () => {
        rm.recordTrade(lossResult(-0.50));
        rm.recordTrade(lossResult(-0.50));
        expect(rm.consecutiveLosses).toBe(2);
        rm.recordTrade(winResult(0.425));
        expect(rm.consecutiveLosses).toBe(0);
      });
    });
  });

  describe('setRealBalance', () => {
    it('updates both starting and current balance', () => {
      rm.setRealBalance(250);
      expect(rm.startingBalance).toBe(250);
      expect(rm.currentBalance).toBe(250);
    });

    it('ignores zero or negative values', () => {
      rm.setRealBalance(0);
      expect(rm.startingBalance).toBe(100);
      rm.setRealBalance(-50);
      expect(rm.startingBalance).toBe(100);
    });

    it('ignores non-number values', () => {
      rm.setRealBalance('abc');
      expect(rm.startingBalance).toBe(100);
    });
  });

  describe('updateLiveBalance', () => {
    it('updates current balance only', () => {
      rm.updateLiveBalance(150);
      expect(rm.currentBalance).toBe(150);
      expect(rm.startingBalance).toBe(100);
    });

    it('ignores zero or negative values', () => {
      rm.updateLiveBalance(-10);
      expect(rm.currentBalance).toBe(100);
    });
  });

  describe('resetDaily', () => {
    it('resets all daily counters to zero', () => {
      rm.recordTrade(winResult());
      rm.recordTrade(lossResult());
      rm.recordTrade(winResult());
      rm.resetDaily();
      expect(rm.dailyLoss).toBe(0);
      expect(rm.dailyTrades).toBe(0);
      expect(rm.dailyWins).toBe(0);
      expect(rm.dailyPnL).toBe(0);
    });

    it('sets today to a valid date string', () => {
      rm.resetDaily();
      expect(rm.today).toMatch(/^\w{3} \w{3} \d{2} \d{4}$/);
    });
  });

  describe('restoreFromDb', () => {
    it('restores state from stats object', () => {
      const stats = {
        total: 10,
        wins: 7,
        loss: 3,
        netPnl: 2.50,
        consecutiveLosses: 1,
      };
      rm.restoreFromDb(stats);
      expect(rm.dailyTrades).toBe(10);
      expect(rm.dailyWins).toBe(7);
      expect(rm.dailyLoss).toBe(3);
      expect(rm.dailyPnL).toBe(2.50);
      expect(rm.consecutiveLosses).toBe(1);
      expect(rm.currentBalance).toBeCloseTo(102.50, 3);
    });

    it('handles null stats gracefully', () => {
      rm.restoreFromDb(null);
      expect(rm.dailyTrades).toBe(0);
    });

    it('handles stats with zero total by resetting state', () => {
      rm.dailyTrades = 5;
      rm.dailyPnL = 3.0;
      rm.restoreFromDb({ total: 0, wins: 0, loss: 0, netPnl: 0 });
      expect(rm.dailyTrades).toBe(0);
      expect(rm.dailyPnL).toBe(0);
      expect(rm.dailyWins).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('returns current status with correct values', () => {
      const status = rm.getStatus();
      expect(status.balance).toBe(100);
      expect(status.dailyTrades).toBe(0);
      expect(status.dailyPnL).toBe(0);
      expect(status.consecutiveLosses).toBe(0);
      expect(status.drawdown).toBe(0);
    });

    it('reflects trades in status', () => {
      rm.recordTrade(winResult(0.425));
      const status = rm.getStatus();
      expect(status.dailyTrades).toBe(1);
      expect(status.dailyWins).toBe(1);
      expect(status.balance).toBeCloseTo(100.425, 3);
    });

    it('returns drawdown correctly', () => {
      rm.currentBalance = 80;
      const status = rm.getStatus();
      expect(status.drawdown).toBe(20);
      expect(status.drawdownPct).toBe('20.0');
    });
  });

  describe('integration: full trade cycle', () => {
    it('tracks a complete sequence of trades correctly', () => {
      expect(rm.canTrade().allowed).toBe(true);

      rm.recordTrade(winResult(0.425));
      expect(rm.dailyTrades).toBe(1);
      expect(rm.dailyWins).toBe(1);
      expect(rm.consecutiveLosses).toBe(0);
      expect(rm.currentBalance).toBeCloseTo(100.425, 3);

      rm.recordTrade(winResult(0.425));
      expect(rm.dailyTrades).toBe(2);
      expect(rm.dailyWins).toBe(2);
      expect(rm.currentBalance).toBeCloseTo(100.85, 3);
      expect(rm.dailyPnL).toBeCloseTo(0.85, 3);

      rm.recordTrade(lossResult(-0.50));
      expect(rm.dailyTrades).toBe(3);
      expect(rm.dailyWins).toBe(2);
      expect(rm.consecutiveLosses).toBe(1);
      expect(rm.currentBalance).toBeCloseTo(100.35, 3);
      expect(rm.dailyLoss).toBeCloseTo(0.50, 3);

      rm.recordTrade(lossResult(-0.50));
      expect(rm.consecutiveLosses).toBe(2);
      expect(rm.canTrade().allowed).toBe(true);

      rm.recordTrade(lossResult(-8.00));
      expect(rm.dailyLoss).toBeCloseTo(9.00, 3);
      expect(rm.canTrade().allowed).toBe(true);

      rm.recordTrade(lossResult(-1.00));
      expect(rm.dailyLoss).toBeCloseTo(10.00, 3);
      expect(rm.canTrade().allowed).toBe(false);
    });
  });

  describe('custom config limits', () => {
    it('respects custom maxConsecutiveLosses', () => {
      rm = new RiskManager(defaultConfig({ maxConsecutiveLosses: 2 }), silentLogger);
      expect(rm.canTrade().allowed).toBe(true);
      rm.recordTrade(lossResult(-0.50));
      expect(rm.canTrade().allowed).toBe(true);
      rm.recordTrade(lossResult(-0.50));
      expect(rm.canTrade().allowed).toBe(false);
    });

    it('respects custom maxDailyTrades', () => {
      rm = new RiskManager(defaultConfig({ maxDailyTrades: 3 }), silentLogger);
      rm.recordTrade(winResult());
      rm.recordTrade(winResult());
      rm.recordTrade(winResult());
      expect(rm.canTrade().allowed).toBe(false);
    });

    it('respects custom starting balance', () => {
      rm = new RiskManager(defaultConfig({ startingBalance: 500 }), silentLogger);
      expect(rm.startingBalance).toBe(500);
      expect(rm.currentBalance).toBe(500);
    });
  });
});
