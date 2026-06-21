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
    const needed = period * 2;
    if (this.prices.length < needed) return null;

    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const delta = this.prices[i] - this.prices[i - 1];
      if (delta > 0) avgGain += delta;
      else avgLoss -= delta;
    }
    avgGain /= period;
    avgLoss /= period;

    for (let i = period + 1; i < this.prices.length; i++) {
      const delta = this.prices[i] - this.prices[i - 1];
      const gain = delta > 0 ? delta : 0;
      const loss = delta < 0 ? -delta : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
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

    let ema = 0;
    for (let i = 0; i < period; i++) ema += this.prices[i];
    ema /= period;

    const multiplier = 2 / (period + 1);
    for (let i = period; i < this.prices.length; i++) {
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

  deltaAlignment(n, driftDirection) {
    if (this.prices.length < n + 1) return null;
    let count = 0;
    for (let i = this.prices.length - n; i < this.prices.length; i++) {
      const delta = this.prices[i] - this.prices[i - 1];
      if (driftDirection === 'CALL' && delta > 0) count++;
      else if (driftDirection === 'PUT' && delta < 0) count++;
    }
    return count;
  }

  upDownCount(n) {
    if (this.prices.length < n + 1) return null;
    let up = 0, down = 0;
    for (let i = this.prices.length - n; i < this.prices.length; i++) {
      const delta = this.prices[i] - this.prices[i - 1];
      if (delta > 0) up++;
      else if (delta < 0) down++;
    }
    return { up, down, total: n };
  }
}

module.exports = IndicatorEngine;
