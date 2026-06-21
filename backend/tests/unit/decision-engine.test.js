const DecisionEngine = require('../../src/decision-engine');

function makeConfig(overrides = {}) {
  return {
    direction: 'PUT',
    scoreThreshold: 4,
    cooldownTicks: 5,
    lossCooldownMultiplier: 2,
    ...overrides,
  };
}

function makeRiskManager(overrides = {}) {
  return {
    canTrade: () => ({ allowed: true }),
    ...overrides,
  };
}

function makeLogger() {
  return { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() };
}

describe('DecisionEngine', () => {
  let engine;
  let config;
  let riskManager;
  let logger;

  beforeEach(() => {
    config = makeConfig();
    riskManager = makeRiskManager();
    logger = makeLogger();
    engine = new DecisionEngine(config, riskManager, logger);
  });

  describe('constructor', () => {
    it('creates instance with config, riskManager, logger', () => {
      expect(engine.config).toBe(config);
      expect(engine.riskManager).toBe(riskManager);
      expect(engine.logger).toBe(logger);
      expect(engine.inCooldown).toBe(false);
    });
  });

  describe('cooldown', () => {
    it('skips when in cooldown', () => {
      engine.inCooldown = true;
      engine.cooldownEnd = 100;
      const result = engine.evaluate([], {}, 50);
      expect(result.action).toBe('SKIP');
      expect(result.reason).toBe('cooldown');
    });

    it('ends cooldown when tickIndex passes cooldownEnd', () => {
      engine.inCooldown = true;
      engine.cooldownEnd = 100;
      const result = engine.evaluate([], {}, 150);
      expect(engine.inCooldown).toBe(false);
    });
  });

  describe('risk check', () => {
    it('skips when riskManager disallows', () => {
      const mockRisk = makeRiskManager({ canTrade: () => ({ allowed: false, reason: 'test_block' }) });
      const eng = new DecisionEngine(config, mockRisk, logger);
      const result = eng.evaluate([], {}, 0);
      expect(result.action).toBe('SKIP');
      expect(result.reason).toBe('test_block');
    });
  });

  describe('scoring', () => {
    it('returns SKIP with no_signal when score is below threshold', () => {
      const result = engine.evaluate([], { _rawPrices: [] }, 0);
      expect(result.action).toBe('SKIP');
      expect(result.reason).toBe('no_signal');
    });

    it('returns ENTER when score >= threshold', () => {
      const indicators = {
        rsi: { value: 75 },
        deltaAlignment: 5,
        _rawPrices: [100, 100.1, 100.2],
      };
      const result = engine.evaluate([{ quote: 100 }], indicators, 0);
      expect(result.action).toBe('ENTER');
      expect(result.direction).toBe('PUT');
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(4);
    });
  });

  describe('entry event', () => {
    it('emits enter event with correct data', () => {
      const enterHandler = jest.fn();
      engine.on('enter', enterHandler);

      const indicators = {
        rsi: { value: 75 },
        deltaAlignment: 5,
        _rawPrices: [100, 100.1, 100.2],
      };
      engine.evaluate([{ quote: 100 }], indicators, 0);

      expect(enterHandler).toHaveBeenCalledTimes(1);
      const event = enterHandler.mock.calls[0][0];
      expect(event.direction).toBe('PUT');
      expect(typeof event.score).toBe('number');
      expect(event.scoreComponents).toBeDefined();
      expect(event.price).toBe(100);
      expect(event.tickIndex).toBe(0);
    });

    it('direction matches config direction (CALL)', () => {
      const callConfig = makeConfig({ direction: 'CALL' });
      const callRisk = makeRiskManager();
      const callLogger = makeLogger();
      const callEngine = new DecisionEngine(callConfig, callRisk, callLogger);
      const enterHandler = jest.fn();
      callEngine.on('enter', enterHandler);

      const indicators = {
        rsi: { value: 25 },
        deltaAlignment: 5,
        _rawPrices: [100, 100.1, 100.2],
      };
      callEngine.evaluate([{ quote: 100 }], indicators, 0);

      expect(enterHandler).toHaveBeenCalledTimes(1);
      expect(enterHandler.mock.calls[0][0].direction).toBe('CALL');
    });
  });

  describe('startCooldown', () => {
    it('starts cooldown with configured ticks', () => {
      engine.startCooldown(100);
      expect(engine.inCooldown).toBe(true);
      expect(engine.cooldownEnd).toBe(105);
    });

    it('resets cooldown on second call', () => {
      engine.startCooldown(100);
      engine.startCooldown(200);
      expect(engine.cooldownEnd).toBe(205);
    });
  });

  describe('setCooldownAfterLoss', () => {
    it('sets cooldown when lost and lossCooldownMultiplier is set', () => {
      engine.setCooldownAfterLoss(true, 100);
      expect(engine.inCooldown).toBe(true);
      expect(engine.cooldownEnd).toBe(110);
    });

    it('does not set cooldown when won', () => {
      engine.setCooldownAfterLoss(false, 100);
      expect(engine.inCooldown).toBe(false);
    });
  });
});
