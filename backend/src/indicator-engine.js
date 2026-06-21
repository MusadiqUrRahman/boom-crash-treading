const BaseIndicatorEngine = require('../lib/indicator-engine');

class IndicatorEngine {
  constructor(config) {
    this.config = config;
    this._engine = new BaseIndicatorEngine(config.tickBufferSize || 200);
    this._ready = false;
    this._warmupNeeded = Math.max(
      (config.rsiPeriod || 14) * 2,
      config.bbPeriod || 20,
      config.emaLongPeriod || 20,
      (config.rocPeriod || 5) + 1,
      config.minTicksBeforeTrade || 40
    );
    this._cached = {};
  }

  update(tickPrice) {
    this._engine.addPrice(tickPrice);

    if (!this._ready && this._engine.priceCount >= this._warmupNeeded) {
      this._ready = true;
    }

    if (this._ready) {
      const price = tickPrice;
      const emaShort = this._engine.ema(this.config.emaShortPeriod || 5);
      const emaLong = this._engine.ema(this.config.emaLongPeriod || 20);
      this._cached = {
        rsi: this._engine.rsi(this.config.rsiPeriod || 14),
        bb: this._engine.bollingerBands(this.config.bbPeriod || 20, this.config.bbStdDev || 2),
        emaShort,
        emaDistance: emaShort !== null ? (price - emaShort) / price : null,
        emaTrend: (emaShort !== null && emaLong !== null) ? (emaShort - emaLong) / emaLong : null,
        roc: this._engine.roc(this.config.rocPeriod || 5),
        deltaAlignment: this._engine.deltaAlignment(5, this.config.direction || 'PUT'),
        _rawPrices: this._engine.prices,
      };
    }
  }

  get rsi() { return this._cached.rsi || null; }
  get bb() { return this._cached.bb || null; }
  get roc() { return this._cached.hasOwnProperty('roc') ? this._cached.roc : null; }
  get emaDistance() { return this._cached.hasOwnProperty('emaDistance') ? this._cached.emaDistance : null; }
  get emaTrend() { return this._cached.hasOwnProperty('emaTrend') ? this._cached.emaTrend : null; }

  getAll() {
    return {
      rsi: this.rsi,
      bb: this.bb,
      emaDistance: this.emaDistance,
      emaTrend: this.emaTrend,
      roc: this.roc,
      deltaAlignment: this._cached.deltaAlignment !== undefined ? this._cached.deltaAlignment : null,
      _rawPrices: this._engine.prices || [],
    };
  }

  isReady() { return this._ready; }
  get priceCount() { return this._engine.priceCount; }
}

module.exports = IndicatorEngine;
