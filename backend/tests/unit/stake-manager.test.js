const StakeManager = require('../../src/stake-manager');

function makeConfig(overrides = {}) {
  return {
    baseStake: 2.00,
    minStake: 0.35,
    maxStake: 5.00,
    stakeMode: 'fixed',
    riskPercent: 0.005,
    contractMinStake: 0,
    ...overrides,
  };
}

describe('StakeManager', () => {
  let sm;

  beforeEach(() => {
    sm = new StakeManager(makeConfig());
  });

  describe('constructor', () => {
    it('initializes with default config', () => {
      expect(sm.baseStake).toBe(2.00);
      expect(sm.minStake).toBe(0.35);
      expect(sm.maxStake).toBe(5.00);
      expect(sm.mode).toBe('fixed');
      expect(sm.currentStake).toBe(2.00);
      expect(sm.consecutiveLosses).toBe(0);
    });

    it('accepts custom values', () => {
      const cs = new StakeManager(makeConfig({ baseStake: 5, maxStake: 10 }));
      expect(cs.baseStake).toBe(5);
      expect(cs.maxStake).toBe(10);
    });
  });

  describe('setContractMinStake', () => {
    it('updates contractMinStake when valid', () => {
      sm.setContractMinStake(1.50);
      expect(sm.contractMinStake).toBe(1.50);
    });

    it('ignores zero values', () => {
      sm.setContractMinStake(0);
      expect(sm.contractMinStake).toBe(0);
    });

    it('ignores negative values', () => {
      sm.setContractMinStake(-1);
      expect(sm.contractMinStake).toBe(0);
    });

    it('ignores non-number values', () => {
      sm.setContractMinStake('abc');
      expect(sm.contractMinStake).toBe(0);
    });
  });

  describe('_effectiveMinStake', () => {
    it('returns max of minStake and contractMinStake', () => {
      sm.setContractMinStake(1.00);
      expect(sm._effectiveMinStake()).toBe(1.00);
    });

    it('returns minStake when contractMinStake is lower', () => {
      sm.minStake = 1.00;
      expect(sm._effectiveMinStake()).toBe(1.00);
    });
  });

  describe('fixed mode', () => {
    it('returns baseStake with no losses', () => {
      expect(sm.getStake(100)).toBe(2.00);
    });

    it('reduces to 50% after 3 consecutive losses', () => {
      sm.recordResult(false);
      sm.recordResult(false);
      sm.recordResult(false);
      expect(sm.getStake(100)).toBe(1.00);
    });

    it('reduces to minStake after 5 consecutive losses', () => {
      for (let i = 0; i < 5; i++) sm.recordResult(false);
      expect(sm.getStake(100)).toBe(0.35);
    });

    it('never goes below minStake', () => {
      for (let i = 0; i < 10; i++) sm.recordResult(false);
      expect(sm.getStake(100)).toBeGreaterThanOrEqual(0.35);
    });

    it('never exceeds maxStake', () => {
      const capped = new StakeManager(makeConfig({ maxStake: 1.00 }));
      expect(capped.getStake(100)).toBe(1.00);
    });
  });

  describe('proportional mode', () => {
    beforeEach(() => {
      sm = new StakeManager(makeConfig({ stakeMode: 'proportional', riskPercent: 0.01 }));
    });

    it('returns riskPercent of balance', () => {
      expect(sm.getStake(100)).toBe(1.00);
      expect(sm.getStake(200)).toBe(2.00);
    });

    it('reduces risk after 3 consecutive losses', () => {
      for (let i = 0; i < 3; i++) sm.recordResult(false);
      const stake = sm.getStake(100);
      expect(stake).toBeCloseTo(0.50, 2);
    });

    it('caps at maxStake', () => {
      const capped = new StakeManager(makeConfig({ stakeMode: 'proportional', riskPercent: 0.5, maxStake: 10 }));
      expect(capped.getStake(1000)).toBe(10);
    });

    it('floors at minStake', () => {
      const low = new StakeManager(makeConfig({ stakeMode: 'proportional', riskPercent: 0.001 }));
      expect(low.getStake(100)).toBeGreaterThanOrEqual(0.35);
    });
  });

  describe('recordResult', () => {
    it('resets consecutive losses on win', () => {
      sm.recordResult(false);
      sm.recordResult(false);
      expect(sm.consecutiveLosses).toBe(2);
      sm.recordResult(true);
      expect(sm.consecutiveLosses).toBe(0);
    });

    it('increments consecutive losses on loss', () => {
      sm.recordResult(false);
      expect(sm.consecutiveLosses).toBe(1);
      sm.recordResult(false);
      expect(sm.consecutiveLosses).toBe(2);
    });

    it('resets currentStake to baseStake on win', () => {
      for (let i = 0; i < 3; i++) sm.recordResult(false);
      expect(sm.currentStake).toBe(2.00);
      sm.recordResult(true);
      expect(sm.currentStake).toBe(2.00);
    });
  });

  describe('edge cases', () => {
    it('handles zero balance gracefully', () => {
      const prop = new StakeManager(makeConfig({ stakeMode: 'proportional' }));
      expect(prop.getStake(0)).toBeGreaterThanOrEqual(0.35);
    });

    it('handles negative balance gracefully', () => {
      const prop = new StakeManager(makeConfig({ stakeMode: 'proportional' }));
      expect(prop.getStake(-100)).toBeGreaterThanOrEqual(0.35);
    });
  });
});
