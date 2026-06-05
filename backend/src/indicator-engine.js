const BaseIndicatorEngine = require('../lib/indicator-engine');

class IndicatorEngine {
  constructor(config) {
    this.config = config;
    this._engine = new BaseIndicatorEngine(config.tickBufferSize || 200);
    this._ready = false;
    this._warmupNeeded = Math.max(
      config.rsiPeriod || 14,
      config.bbPeriod || config.bbPeriod || 20,
      config.emaLongPeriod || 20,
      (config.rocPeriod || 5) + 1
    );
    this._cached = {};
  }

  update(tickPrice) {
    this._engine.addPrice(tickPrice);

    if (!this._ready && this._engine.priceCount >= this._warmupNeeded) {
      this._ready = true;
    }

    if (this._ready) {
      this._cached = {
        rsi: this._engine.rsi(this.config.rsiPeriod || 14),
        bb: this._engine.bollingerBands(this.config.bbPeriod || 20, this.config.bbStdDev || 2),
        emaShort: this._engine.ema(this.config.emaShortPeriod || 5),
        emaLong: this._engine.ema(this.config.emaLongPeriod || 20),
        roc: this._engine.roc(this.config.rocPeriod || 5),
        deltas: this._engine.deltas(5),
        _rawPrices: this._engine.prices,
      };
    }
  }

  get rsi() { return this._cached.rsi || null; }
  get bollingerBands() { return this._cached.bb || null; }
  get emaShort() { return this._cached.hasOwnProperty('emaShort') ? this._cached.emaShort : null; }
  get emaLong() { return this._cached.hasOwnProperty('emaLong') ? this._cached.emaLong : null; }
  get roc() { return this._cached.hasOwnProperty('roc') ? this._cached.roc : null; }

  getAll() {
    return {
      rsi: this.rsi,
      bb: this.bollingerBands,
      emaShort: this.emaShort,
      emaLong: this.emaLong,
      roc: this.roc,
      deltas: this._cached.deltas || null,
      _rawPrices: this._engine.prices || [],
    };
  }

  isReady() { return this._ready; }
  get priceCount() { return this._engine.priceCount; }
}

module.exports = IndicatorEngine;
