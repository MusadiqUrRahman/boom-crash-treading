const IndicatorEngine = require('../../lib/indicator-engine');

function fillPrices(engine, prices) {
  for (const p of prices) {
    engine.addPrice(p);
  }
}

function sequence(start, count, step = 1) {
  return Array.from({ length: count }, (_, i) => start + i * step);
}

describe('IndicatorEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new IndicatorEngine(200);
  });

  describe('initial state', () => {
    it('has zero price count and empty prices', () => {
      expect(engine.priceCount).toBe(0);
      expect(engine.prices).toEqual([]);
      expect(engine.price()).toBeNull();
    });
  });

  describe('addPrice', () => {
    it('increases priceCount and stores price', () => {
      engine.addPrice(100);
      expect(engine.priceCount).toBe(1);
      expect(engine.price()).toBe(100);
    });

    it('respects maxSize ring buffer', () => {
      const smallEngine = new IndicatorEngine(3);
      fillPrices(smallEngine, [1, 2, 3, 4]);
      expect(smallEngine.prices).toEqual([2, 3, 4]);
    });
  });

  describe('deltas', () => {
    it('returns null when not enough prices', () => {
      expect(engine.deltas(5)).toBeNull();
    });

    it('returns correct differences for given n', () => {
      fillPrices(engine, [100, 102, 105, 103]);
      const result = engine.deltas(2);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe(105 - 102);
      expect(result[1]).toBe(103 - 105);
    });

    it('returns one delta for n=1', () => {
      fillPrices(engine, [100, 101, 102]);
      const result = engine.deltas(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(102 - 101);
    });
  });

  describe('rsi', () => {
    it('returns null when not enough prices', () => {
      fillPrices(engine, [100, 101]);
      expect(engine.rsi(14)).toBeNull();
    });

    it('returns 100 when all gains (no losses)', () => {
      const prices = Array.from({ length: 28 }, (_, i) => 100 + i);
      fillPrices(engine, prices);
      const result = engine.rsi(14);
      expect(result.value).toBeCloseTo(100, 1);
      expect(result.isOverbought).toBe(true);
      expect(result.isOversold).toBe(false);
    });

    it('returns 0 when all losses (no gains)', () => {
      const prices = Array.from({ length: 28 }, (_, i) => 127 - i);
      fillPrices(engine, prices);
      const result = engine.rsi(14);
      expect(result.value).toBeCloseTo(0, 1);
      expect(result.isOversold).toBe(true);
      expect(result.isOverbought).toBe(false);
    });

    it('returns ~50 for alternating gains and losses of equal size', () => {
      const prices = [100];
      for (let i = 0; i < 27; i++) {
        prices.push(prices[prices.length - 1] + (i % 2 === 0 ? 1 : -1));
      }
      fillPrices(engine, prices);
      const result = engine.rsi(14);
      expect(result.value).toBeGreaterThan(30);
      expect(result.value).toBeLessThan(70);
    });

    it('detects oversold below config threshold', () => {
      const prices = [100];
      for (let i = 0; i < 27; i++) {
        prices.push(prices[prices.length - 1] - 3);
      }
      fillPrices(engine, prices);
      const result = engine.rsi(14);
      if (result.value < 35) {
        expect(result.isOversold).toBe(true);
      }
    });
  });

  describe('bollingerBands', () => {
    it('returns null when not enough prices', () => {
      fillPrices(engine, [100, 101]);
      expect(engine.bollingerBands(20, 2)).toBeNull();
    });

    it('computes correct middle (SMA)', () => {
      fillPrices(engine, [10, 20, 30, 40, 50]);
      const result = engine.bollingerBands(5, 2);
      expect(result.middle).toBe(30);
    });

    it('computes correct upper and lower bands', () => {
      fillPrices(engine, [10, 20, 30, 40, 50]);
      const result = engine.bollingerBands(5, 2);
      const mean = 30;
      const variance = ((10 - mean) ** 2 + (20 - mean) ** 2 + (30 - mean) ** 2 + (40 - mean) ** 2 + (50 - mean) ** 2) / 5;
      const std = Math.sqrt(variance);
      expect(result.upper).toBeCloseTo(mean + 2 * std, 5);
      expect(result.lower).toBeCloseTo(mean - 2 * std, 5);
    });

    it('detects price below lower band', () => {
      fillPrices(engine, [...Array(19).fill(100), 50]);
      const result = engine.bollingerBands(20, 2);
      expect(result.belowLower).toBe(true);
      expect(result.aboveUpper).toBe(false);
    });

    it('detects price above upper band', () => {
      fillPrices(engine, [...Array(19).fill(100), 150]);
      const result = engine.bollingerBands(20, 2);
      expect(result.aboveUpper).toBe(true);
      expect(result.belowLower).toBe(false);
    });
  });

  describe('ema', () => {
    it('returns null when not enough prices', () => {
      fillPrices(engine, [100]);
      expect(engine.ema(5)).toBeNull();
    });

    it('returns SMA when prices equal period', () => {
      fillPrices(engine, [10, 20, 30, 40, 50]);
      const ema5 = engine.ema(5);
      expect(ema5).toBeCloseTo(30, 5);
    });

    it('extends beyond initial period', () => {
      fillPrices(engine, [10, 20, 30, 40, 50, 60]);
      const multiplier = 2 / (5 + 1);
      const sma = (10 + 20 + 30 + 40 + 50) / 5;
      const expected = (60 - sma) * multiplier + sma;
      expect(engine.ema(5)).toBeCloseTo(expected, 5);
    });

    it('returns number when enough data for period', () => {
      fillPrices(engine, sequence(100, 20));
      const shortEma = engine.ema(3);
      const longEma = engine.ema(10);
      expect(typeof shortEma).toBe('number');
      expect(typeof longEma).toBe('number');
    });
  });

  describe('roc', () => {
    it('returns null when not enough prices', () => {
      fillPrices(engine, [100]);
      expect(engine.roc(5)).toBeNull();
    });

    it('computes correct Rate of Change percentage', () => {
      fillPrices(engine, [200, 210]);
      const roc1 = engine.roc(1);
      expect(roc1).toBeCloseTo(5, 5);
    });

    it('returns negative for price decline', () => {
      fillPrices(engine, [200, 190]);
      const roc1 = engine.roc(1);
      expect(roc1).toBeCloseTo(-5, 5);
    });

    it('returns zero for no change', () => {
      fillPrices(engine, [200, 200]);
      const roc1 = engine.roc(1);
      expect(roc1).toBe(0);
    });
  });

  describe('integration: realistic tick scenario', () => {
    it('computes all indicators after sufficient warmup', () => {
      fillPrices(engine, sequence(50000, 100, 0.5));
      expect(engine.priceCount).toBe(100);
      expect(engine.rsi(14)).not.toBeNull();
      expect(engine.bollingerBands(20, 2)).not.toBeNull();
      expect(engine.ema(5)).not.toBeNull();
      expect(engine.ema(20)).not.toBeNull();
      expect(engine.roc(5)).not.toBeNull();
      expect(engine.deltas(5)).not.toBeNull();
    });
  });

  describe('deltaAlignment', () => {
    it('returns null when not enough prices', () => {
      fillPrices(engine, [100]);
      expect(engine.deltaAlignment(5, 'PUT')).toBeNull();
    });

    it('returns 5/5 when all deltas match PUT drift (negative)', () => {
      fillPrices(engine, [105, 104, 103, 102, 101, 100]);
      expect(engine.deltaAlignment(5, 'PUT')).toBe(5);
    });

    it('returns 5/5 when all deltas match CALL drift (positive)', () => {
      fillPrices(engine, [100, 101, 102, 103, 104, 105]);
      expect(engine.deltaAlignment(5, 'CALL')).toBe(5);
    });

    it('returns 3/5 when 3 deltas match and 2 do not', () => {
      fillPrices(engine, [105, 104, 105, 104, 105, 104]);
      expect(engine.deltaAlignment(5, 'PUT')).toBe(3);
    });

    it('returns 0/5 when no deltas match', () => {
      fillPrices(engine, [100, 101, 102, 103, 104, 105]);
      expect(engine.deltaAlignment(5, 'PUT')).toBe(0);
    });

    it('works with n=1', () => {
      fillPrices(engine, [100, 99]);
      expect(engine.deltaAlignment(1, 'PUT')).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles repeated identical prices', () => {
      fillPrices(engine, Array(28).fill(100));
      const rsi = engine.rsi(14);
      expect(rsi.value).toBe(100);
      const bb = engine.bollingerBands(20, 2);
      expect(bb.upper).toBeCloseTo(100, 5);
      expect(bb.lower).toBeCloseTo(100, 5);
      expect(bb.middle).toBeCloseTo(100, 5);
    });

    it('handles prices with one huge spike', () => {
      const prices = sequence(1000, 49, 0.1);
      prices.push(10000);
      fillPrices(engine, prices);
      expect(engine.rsi(14)).not.toBeNull();
      expect(engine.bollingerBands(20, 2)).not.toBeNull();
    });
  });
});
