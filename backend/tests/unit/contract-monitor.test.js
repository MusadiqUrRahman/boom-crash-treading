const ContractMonitor = require('../../src/contract-monitor');

function makeLogger() {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return logger;
}

function makeTick(quote, epoch) {
  return { quote, epoch: epoch || Math.floor(Date.now() / 1000) };
}

describe('ContractMonitor', () => {
  let cm;
  let logger;

  beforeEach(() => {
    logger = makeLogger();
    cm = new ContractMonitor(logger, false);
  });

  describe('constructor', () => {
    it('initializes with empty contracts', () => {
      expect(cm.activeContracts.size).toBe(0);
      expect(cm.getActiveCount()).toBe(0);
      expect(cm.hasActiveContracts()).toBe(false);
    });

    it('stores allowEquals config', () => {
      const withEquals = new ContractMonitor(logger, true);
      expect(withEquals.allowEquals).toBe(true);
    });
  });

  describe('startContract', () => {
    it('returns a local ID with BC- prefix', () => {
      const id = cm.startContract('c1', 100, 0, 10, 'CALL', 2, 2.5, 7, {}, 'MULTUP', null, null, null, null);
      expect(id).toMatch(/^BC-\d{4}$/);
    });

    it('increments local ID counter', () => {
      const id1 = cm.startContract('c1', 100, 0, 10, 'CALL', 2, 2.5, 7, {}, 'MULTUP', null, null, null, null);
      const id2 = cm.startContract('c2', 101, 1, 10, 'PUT', 2, 2.5, 5, {}, 'MULTDOWN', null, null, null, null);
      expect(id1).toBe('BC-0001');
      expect(id2).toBe('BC-0002');
    });

    it('adds contract to activeContracts', () => {
      const localId = cm.startContract('c1', 100, 0, 10, 'CALL', 2, 2.5, 7, {}, 'MULTUP', null, null, 1000, 100);
      expect(cm.activeContracts.has(localId)).toBe(true);
      const c = cm.activeContracts.get(localId);
      expect(c.contractId).toBe('c1');
      expect(c.direction).toBe('CALL');
      expect(c.stake).toBe(2);
      expect(c.hasFixedDuration).toBe(true);
    });

    it('creates open-ended contract when duration is 0', () => {
      const localId = cm.startContract('c1', 100, 0, 0, 'PUT', 2, 0, 7, {}, 'MULTDOWN', null, null, null, null);
      const c = cm.activeContracts.get(localId);
      expect(c.hasFixedDuration).toBeFalsy();
      expect(c.expiryTickIndex).toBeNull();
    });

    it('accepts all 14 parameters without error', () => {
      const id = cm.startContract(
        'c1', 100, 0, 0, 'CALL', 2, 2.5, 7,
        { rsi: 4, momentum: 3 }, 'MULTUP', 0.50, 2.00, 1000, 100
      );
      const c = cm.activeContracts.get(id);
      expect(c.stopLoss).toBeUndefined();
      expect(c.takeProfit).toBeUndefined();
      expect(c.entryEpoch).toBe(1000);
    });
  });

  describe('onTick', () => {
    it('updates currentTickIndex for all active contracts', () => {
      const id = cm.startContract('c1', 100, 0, 10, 'CALL', 2, 2.5, 7, {}, 'MULTUP', null, null, null, null);
      cm.onTick(makeTick(101), 1);
      expect(cm.activeContracts.get(id).currentTickIndex).toBe(1);
    });

    it('resolves fixed-duration binary contract on expiry tick', () => {
      const callback = jest.fn();
      cm.on('contractResolved', callback);
      cm.startContract('c1', 100, 0, 5, 'CALL', 2, 2.5, 7, {}, 'CALL', null, null, null, null);
      cm.onTick(makeTick(105), 5);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].win).toBe(true);
    });

    it('does not resolve open-ended contract', () => {
      const callback = jest.fn();
      cm.on('contractResolved', callback);
      cm.startContract('c1', 100, 0, 0, 'CALL', 2, 2.5, 7, {}, 'MULTUP', null, null, null, null);
      cm.onTick(makeTick(200), 100);
      expect(callback).not.toHaveBeenCalled();
    });

    it('skips already resolved contracts', () => {
      const callback = jest.fn();
      cm.on('contractResolved', callback);
      const id = cm.startContract('c1', 100, 0, 5, 'CALL', 2, 2.5, 7, {}, 'MULTUP', null, null, null, null);
      cm.activeContracts.get(id).resolved = true;
      cm.onTick(makeTick(200), 10);
      expect(callback).not.toHaveBeenCalled();
    });

    // MULTIPLIER contracts must NEVER be resolved with binary win/loss P/L by the
    // tick monitor — that fabricated phantom losses (see PNL_MISMATCH_REPORT.md).
    // They resolve as UNRESOLVED (null pnl) so Deriv's profit settles them.
    it('emits UNRESOLVED for a multiplier contract hitting tick expiry (no fabricated P/L)', () => {
      const callback = jest.fn();
      cm.on('contractResolved', callback);
      cm.startContract('c1', 100, 0, 5, 'PUT', 2, 4, 7, {}, 'MULTDOWN', null, null, null, null);
      cm.onTick(makeTick(95), 5);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].pnl).toBeNull();
      expect(callback.mock.calls[0][0].win).toBeNull();
      expect(callback.mock.calls[0][0].exitReason).toBe('UNRESOLVED');
    });

    // Genuine fixed-duration BINARY contracts (non-MULT type) keep binary resolution.
    it('resolves a binary PUT contract correctly (price down = win)', () => {
      const callback = jest.fn();
      cm.on('contractResolved', callback);
      cm.startContract('c1', 100, 0, 5, 'PUT', 2, 4, 7, {}, 'PUT', null, null, null, null);
      cm.onTick(makeTick(95), 5);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].win).toBe(true);
    });

    it('resolves a binary CALL contract as loss when exit < entry', () => {
      const callback = jest.fn();
      cm.on('contractResolved', callback);
      cm.startContract('c1', 100, 0, 5, 'CALL', 2, 4, 7, {}, 'CALL', null, null, null, null);
      cm.onTick(makeTick(95), 5);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].win).toBe(false);
    });

    it('uses allowEquals when set (binary contract)', () => {
      const cmEq = new ContractMonitor(logger, true);
      const callback = jest.fn();
      cmEq.on('contractResolved', callback);
      cmEq.startContract('c1', 100, 0, 5, 'CALL', 2, 4, 7, {}, 'CALL', null, null, null, null);
      cmEq.onTick(makeTick(100), 5);
      expect(callback.mock.calls[0][0].win).toBe(true);
    });
  });

  describe('resolveContract (API-based)', () => {
    it('resolves contract with API result', () => {
      const callback = jest.fn();
      cm.on('contractResolved', callback);
      const id = cm.startContract('c1', 100, 0, 0, 'CALL', 2, 2.5, 7, {}, 'MULTUP', null, null, null, null);
      cm.resolveContract(id, { win: true, pnl: 0.80, exitPrice: 102, exitReason: 'SELL' });
      expect(callback).toHaveBeenCalledTimes(1);
      const result = callback.mock.calls[0][0];
      expect(result.win).toBe(true);
      expect(result.pnl).toBe(0.80);
      expect(result.exitPrice).toBe(102);
      expect(result.exitReason).toBe('SELL');
      expect(cm.hasActiveContracts()).toBe(false);
    });

    it('ignores non-existent contract', () => {
      cm.resolveContract('BC-9999', { win: true, pnl: 0.50 });
      expect(cm.getActiveCount()).toBe(0);
    });

    it('ignores already resolved contract', () => {
      const callback = jest.fn();
      cm.on('contractResolved', callback);
      const id = cm.startContract('c1', 100, 0, 0, 'CALL', 2, 2.5, 7, {}, 'MULTUP', null, null, null, null);
      cm.resolveContract(id, { win: true, pnl: 0.50 });
      cm.resolveContract(id, { win: true, pnl: 1.00 });
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('forceResolve', () => {
    it('force-resolves a multiplier as UNRESOLVED (no fabricated P/L)', () => {
      const callback = jest.fn();
      cm.on('contractResolved', callback);
      const id = cm.startContract('c1', 100, 0, 0, 'CALL', 2, 4, 7, {}, 'MULTUP', null, null, null, null);
      cm.forceResolve(id, makeTick(110));
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].pnl).toBeNull();
      expect(callback.mock.calls[0][0].exitReason).toBe('UNRESOLVED');
    });

    it('force-resolves a binary contract with current tick price', () => {
      const callback = jest.fn();
      cm.on('contractResolved', callback);
      const id = cm.startContract('c1', 100, 0, 5, 'CALL', 2, 4, 7, {}, 'CALL', null, null, null, null);
      cm.forceResolve(id, makeTick(110));
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].win).toBe(true);
      expect(callback.mock.calls[0][0].exitReason).toBe('TICK_RESOLVED');
    });

    it('ignores non-existent contract', () => {
      cm.forceResolve('BC-9999', makeTick(100));
      expect(cm.getActiveCount()).toBe(0);
    });
  });

  describe('multiple contracts', () => {
    it('tracks multiple contracts independently', () => {
      const id1 = cm.startContract('c1', 100, 0, 10, 'CALL', 2, 2.5, 7, {}, 'MULTUP', null, null, null, null);
      const id2 = cm.startContract('c2', 200, 0, 10, 'PUT', 1, 2, 5, {}, 'MULTDOWN', null, null, null, null);
      expect(cm.getActiveCount()).toBe(2);
      expect(cm.hasActiveContracts()).toBe(true);
      cm.resolveContract(id1, { win: true, pnl: 0.50 });
      expect(cm.getActiveCount()).toBe(1);
      expect(cm.hasActiveContracts()).toBe(true);
      cm.resolveContract(id2, { win: false, pnl: -0.50 });
      expect(cm.getActiveCount()).toBe(0);
      expect(cm.hasActiveContracts()).toBe(false);
    });
  });
});
