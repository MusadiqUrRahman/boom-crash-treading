class IndicatorEngine {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.prices = [];
  }

  addPrice(price) {
    this.prices.push(price);
    if (this.prices.length > this.maxSize) {
      this.prices.shift();
    }
  }

  get priceCount() {
    return this.prices.length;
  }

  price() {
    return this.prices.length > 0 ? this.prices[this.prices.length - 1] : null;
  }

  deltas(n) {
    if (this.prices.length < n + 1) return null;
    const result = [];
    for (let i = this.prices.length - n; i < this.prices.length; i++) {
      result.push(this.prices[i] - this.prices[i - 1]);
    }
    return result;
  }

  rsi(period) {
    const needed = period + 1;
    if (this.prices.length < needed) return null;

    let gainSum = 0, lossSum = 0;
    for (let i = this.prices.length - period; i < this.prices.length; i++) {
      const delta = this.prices[i] - this.prices[i - 1];
      if (delta > 0) gainSum += delta;
      else lossSum -= delta;
    }

    const avgGain = gainSum / period;
    const avgLoss = lossSum / period;

    let rs;
    if (avgLoss === 0) {
      rs = Infinity;
    } else {
      rs = avgGain / avgLoss;
    }

    const rsiValue = 100 - 100 / (1 + rs);
    return { value: rsiValue, isOversold: rsiValue < 35, isOverbought: rsiValue > 65 };
  }

  bollingerBands(period, stdDev) {
    if (this.prices.length < period) return null;

    const slice = this.prices.slice(this.prices.length - period);
    let sum = 0;
    for (let i = 0; i < slice.length; i++) sum += slice[i];
    const middle = sum / period;

    let sumSq = 0;
    for (let i = 0; i < slice.length; i++) sumSq += (slice[i] - middle) ** 2;
    const std = Math.sqrt(sumSq / period);

    const upper = middle + stdDev * std;
    const lower = middle - stdDev * std;
    const current = this.prices[this.prices.length - 1];

    return {
      upper,
      middle,
      lower,
      belowLower: current < lower,
      aboveUpper: current > upper,
    };
  }

  ema(period) {
    if (this.prices.length < period) return null;

    const slice = this.prices.slice(this.prices.length - period);
    let ema = 0;
    for (let i = 0; i < slice.length; i++) ema += slice[i];
    ema /= period;

    const multiplier = 2 / (period + 1);
    for (let i = this.prices.length - period + 1; i < this.prices.length; i++) {
      ema = (this.prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  roc(period) {
    if (this.prices.length < period + 1) return null;

    const current = this.prices[this.prices.length - 1];
    const prev = this.prices[this.prices.length - 1 - period];
    return ((current - prev) / prev) * 100;
  }
}

module.exports = IndicatorEngine;
