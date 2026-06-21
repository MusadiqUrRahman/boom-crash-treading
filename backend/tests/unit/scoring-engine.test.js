const { computeScore } = require('../../lib/scoring-engine');

function makeIndicators(overrides = {}) {
  return {
    rsi: null,
    deltaAlignment: null,
    _rawPrices: [],
    ...overrides,
  };
}

function makeConfig(overrides = {}) {
  return {
    direction: 'PUT',
    scoreThreshold: 4,
    rsiOversold: 35,
    rsiOverbought: 65,
    ...overrides,
  };
}

describe('computeScore', () => {
  describe('return structure', () => {
    it('returns object with score, components, direction, enter keys', () => {
      const result = computeScore(makeIndicators(), makeConfig());
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('components');
      expect(result).toHaveProperty('direction');
      expect(result).toHaveProperty('enter');
    });

    it('components has rsi, momentum, postSpike, bb, ema, roc', () => {
      const result = computeScore(makeIndicators(), makeConfig());
      expect(result.components).toHaveProperty('rsi');
      expect(result.components).toHaveProperty('momentum');
      expect(result.components).toHaveProperty('postSpike');
      expect(result.components).toHaveProperty('bb');
      expect(result.components).toHaveProperty('ema');
      expect(result.components).toHaveProperty('roc');
    });

    it('direction matches config.direction (PUT)', () => {
      const result = computeScore(makeIndicators(), makeConfig({ direction: 'PUT' }));
      expect(result.direction).toBe('PUT');
    });

    it('direction matches config.direction (CALL)', () => {
      const result = computeScore(makeIndicators(), makeConfig({ direction: 'CALL' }));
      expect(result.direction).toBe('CALL');
    });

    it('score is 0 when all indicators are null', () => {
      const result = computeScore(makeIndicators(), makeConfig());
      expect(result.score).toBe(0);
    });
  });

  describe('RSI scoring for PUT (reversed logic)', () => {
    it('scores RSI=4 when RSI > 70 (overbought = spike happened = good PUT entry)', () => {
      const result = computeScore(makeIndicators({ rsi: { value: 75 } }), makeConfig());
      expect(result.components.rsi).toBe(4);
    });

    it('scores RSI=3 when RSI 65-70', () => {
      const result = computeScore(makeIndicators({ rsi: { value: 68 } }), makeConfig());
      expect(result.components.rsi).toBe(3);
    });

    it('scores RSI=2 when RSI 55-65', () => {
      const result = computeScore(makeIndicators({ rsi: { value: 60 } }), makeConfig());
      expect(result.components.rsi).toBe(2);
    });

    it('scores RSI=1 when RSI 45-55', () => {
      const result = computeScore(makeIndicators({ rsi: { value: 50 } }), makeConfig());
      expect(result.components.rsi).toBe(1);
    });

    it('scores RSI=-1 when RSI 35-45', () => {
      const result = computeScore(makeIndicators({ rsi: { value: 40 } }), makeConfig());
      expect(result.components.rsi).toBe(-1);
    });

    it('scores RSI=-3 when RSI < 35 (oversold = at bottom = bounce risk)', () => {
      const result = computeScore(makeIndicators({ rsi: { value: 25 } }), makeConfig());
      expect(result.components.rsi).toBe(-3);
    });

    it('scores RSI=0 when RSI is null', () => {
      const result = computeScore(makeIndicators({ rsi: null }), makeConfig());
      expect(result.components.rsi).toBe(0);
    });
  });

  describe('RSI scoring for CALL (reversed logic)', () => {
    it('scores RSI=3 when RSI 30-35 (oversold = crash = good CALL entry)', () => {
      const result = computeScore(makeIndicators({ rsi: { value: 32 } }), makeConfig({ direction: 'CALL' }));
      expect(result.components.rsi).toBe(3);
    });

    it('scores RSI=2 when RSI 35-45', () => {
      const result = computeScore(makeIndicators({ rsi: { value: 40 } }), makeConfig({ direction: 'CALL' }));
      expect(result.components.rsi).toBe(2);
    });

    it('scores RSI=1 when RSI 45-55', () => {
      const result = computeScore(makeIndicators({ rsi: { value: 50 } }), makeConfig({ direction: 'CALL' }));
      expect(result.components.rsi).toBe(1);
    });

    it('scores RSI=-1 when RSI 55-65', () => {
      const result = computeScore(makeIndicators({ rsi: { value: 60 } }), makeConfig({ direction: 'CALL' }));
      expect(result.components.rsi).toBe(-1);
    });

    it('scores RSI=-3 when RSI > 65 (overbought = top = crash risk)', () => {
      const result = computeScore(makeIndicators({ rsi: { value: 75 } }), makeConfig({ direction: 'CALL' }));
      expect(result.components.rsi).toBe(-3);
    });

    it('scores RSI=4 when RSI < 30 (extreme oversold = good CALL)', () => {
      const result = computeScore(makeIndicators({ rsi: { value: 25 } }), makeConfig({ direction: 'CALL' }));
      expect(result.components.rsi).toBe(4);
    });
  });

  describe('Momentum (delta alignment) scoring', () => {
    it('scores momentum=3 when deltaAlignment = 5', () => {
      const result = computeScore(makeIndicators({ deltaAlignment: 5 }), makeConfig());
      expect(result.components.momentum).toBe(3);
    });

    it('scores momentum=2 when deltaAlignment = 4', () => {
      const result = computeScore(makeIndicators({ deltaAlignment: 4 }), makeConfig());
      expect(result.components.momentum).toBe(2);
    });

    it('scores momentum=1 when deltaAlignment = 3', () => {
      const result = computeScore(makeIndicators({ deltaAlignment: 3 }), makeConfig());
      expect(result.components.momentum).toBe(1);
    });

    it('scores momentum=0 when deltaAlignment = 2 (neutral)', () => {
      const result = computeScore(makeIndicators({ deltaAlignment: 2 }), makeConfig());
      expect(result.components.momentum).toBe(0);
    });

    it('scores momentum=-1 when deltaAlignment <= 1 (prices going up)', () => {
      const result = computeScore(makeIndicators({ deltaAlignment: 1 }), makeConfig());
      expect(result.components.momentum).toBe(-1);
    });

    it('scores momentum=0 when deltaAlignment is null', () => {
      const result = computeScore(makeIndicators({ deltaAlignment: null }), makeConfig());
      expect(result.components.momentum).toBe(0);
    });
  });

  describe('Local-low spike protection', () => {
    it('applies postSpike=-3 when price near bottom of 50-tick range', () => {
      const prices = [];
      for (let i = 0; i < 50; i++) prices.push(10000 + i);
      prices.push(10000); // price at exact bottom
      const result = computeScore(makeIndicators({ _rawPrices: prices }), makeConfig());
      expect(result.components.postSpike).toBe(-3);
    });

    it('does not apply penalty when price is mid-range', () => {
      const prices = [];
      for (let i = 0; i < 50; i++) prices.push(10000 + i);
      prices.push(10025); // price mid-range (25/50 = 0.5 > 0.15)
      const result = computeScore(makeIndicators({ _rawPrices: prices }), makeConfig());
      expect(result.components.postSpike).toBe(0);
    });

    it('does not apply penalty with fewer than 50 prices', () => {
      const prices = [100, 99, 98];
      const result = computeScore(makeIndicators({ _rawPrices: prices }), makeConfig());
      expect(result.components.postSpike).toBe(0);
    });
  });

  describe('CALL crash protection (reversed)', () => {
    it('applies postSpike=+2 near bottom of 50-tick range (good CALL entry)', () => {
      const prices = [];
      for (let i = 0; i < 50; i++) prices.push(10000 + i);
      prices.push(10000);
      const result = computeScore(makeIndicators({ _rawPrices: prices }), makeConfig({ direction: 'CALL' }));
      expect(result.components.postSpike).toBe(2);
    });

    it('applies postSpike=-3 near top of 50-tick range (bad CALL entry)', () => {
      const prices = [];
      for (let i = 0; i < 50; i++) prices.push(10000 + i);
      prices.push(10050);
      const result = computeScore(makeIndicators({ _rawPrices: prices }), makeConfig({ direction: 'CALL' }));
      expect(result.components.postSpike).toBe(-3);
    });

    it('does not apply penalty mid-range for CALL', () => {
      const prices = [];
      for (let i = 0; i < 50; i++) prices.push(10000 + i);
      prices.push(10025);
      const result = computeScore(makeIndicators({ _rawPrices: prices }), makeConfig({ direction: 'CALL' }));
      expect(result.components.postSpike).toBe(0);
    });
  });

  describe('Enter decision', () => {
    it('returns enter=true when score >= threshold', () => {
      const result = computeScore(
        makeIndicators({ rsi: { value: 75 }, deltaAlignment: 5 }),
        makeConfig({ scoreThreshold: 4 })
      );
      expect(result.score).toBe(7); // rsi=4 + mom=3
      expect(result.enter).toBe(true);
    });

    it('enters with overbought + moderate momentum', () => {
      const result = computeScore(
        makeIndicators({ rsi: { value: 71 }, deltaAlignment: 3 }),
        makeConfig({ scoreThreshold: 4 })
      );
      expect(result.score).toBe(5); // rsi=4 + mom=1
      expect(result.enter).toBe(true);
    });

    it('blocks entry when oversold even with strong momentum', () => {
      const result = computeScore(
        makeIndicators({ rsi: { value: 25 }, deltaAlignment: 5 }),
        makeConfig({ scoreThreshold: 4 })
      );
      expect(result.score).toBe(0); // rsi=-3 + mom=3
      expect(result.enter).toBe(false);
    });

    it('returns enter=false when score < threshold', () => {
      const result = computeScore(makeIndicators(), makeConfig({ scoreThreshold: 99 }));
      expect(result.enter).toBe(false);
    });

    it('blocks entry when at local low with strong momentum', () => {
      const prices = [];
      for (let i = 0; i < 50; i++) prices.push(10000 + i * 2);
      prices.push(10001);
      const result = computeScore(
        makeIndicators({ rsi: { value: 71 }, deltaAlignment: 5, _rawPrices: prices }),
        makeConfig({ scoreThreshold: 4 })
      );
      expect(result.components.postSpike).toBe(-3);
      expect(result.score).toBe(4); // rsi=4 + mom=3 + postSpike=-3 = 4
      expect(result.enter).toBe(true); // still enters, penalty not enough to block
    });

    it('blocks entry when at local low with no momentum cushion', () => {
      const prices = [];
      for (let i = 0; i < 50; i++) prices.push(10000 + i * 2);
      prices.push(10001);
      const result = computeScore(
        makeIndicators({ rsi: { value: 60 }, deltaAlignment: 3, _rawPrices: prices }),
        makeConfig({ scoreThreshold: 4 })
      );
      expect(result.components.rsi).toBe(2);
      expect(result.components.momentum).toBe(1);
      expect(result.components.postSpike).toBe(-3);
      expect(result.score).toBe(0); // 2 + 1 + -3 = 0
      expect(result.enter).toBe(false);
    });

    it('CALL: enters with oversold + strong momentum', () => {
      const result = computeScore(
        makeIndicators({ rsi: { value: 25 }, deltaAlignment: 5 }),
        makeConfig({ direction: 'CALL', scoreThreshold: 4 })
      );
      expect(result.score).toBe(7); // rsi=4 + mom=3
      expect(result.enter).toBe(true);
    });

    it('CALL: enters with oversold + near bottom', () => {
      const prices = [];
      for (let i = 0; i < 50; i++) prices.push(10000 + i * 2);
      prices.push(10001);
      const result = computeScore(
        makeIndicators({ rsi: { value: 25 }, deltaAlignment: 4, _rawPrices: prices }),
        makeConfig({ direction: 'CALL', scoreThreshold: 4 })
      );
      expect(result.components.rsi).toBe(4);
      expect(result.components.momentum).toBe(2);
      expect(result.components.postSpike).toBe(2); // near bottom = bonus
      expect(result.score).toBe(8); // 4 + 2 + 2 = 8
      expect(result.enter).toBe(true);
    });

    it('CALL: blocks entry when overbought', () => {
      const result = computeScore(
        makeIndicators({ rsi: { value: 75 }, deltaAlignment: 5 }),
        makeConfig({ direction: 'CALL', scoreThreshold: 4 })
      );
      expect(result.score).toBe(0); // rsi=-3 + mom=3
      expect(result.enter).toBe(false);
    });
  });
});
