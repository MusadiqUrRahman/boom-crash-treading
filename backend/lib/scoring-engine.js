function computeScore(indicators, config) {
  const rsiVal = indicators.rsi ? indicators.rsi.value : null;
  const bb = indicators.bb || null;
  const emaDistance = indicators.emaDistance;
  const emaTrend = indicators.emaTrend;
  const rocVal = indicators.roc;
  const deltaAlign = indicators.deltaAlignment;
  const prices = indicators._rawPrices || [];
  const direction = config.direction || 'PUT';

  const components = { rsi: 0, momentum: 0, postSpike: 0, bb: 0, ema: 0, roc: 0 };

  const scoreThreshold = config.scoreThreshold || 6;

  // ---- RSI Component ----
  const rsiOversold = config.rsiOversold || 35;
  const rsiOverbought = config.rsiOverbought || 65;
  const rsiMid = (rsiOversold + rsiOverbought) / 2;

  if (direction === 'CALL') {
    if (rsiVal !== null) {
      if (rsiVal < rsiOversold - 5) {
        components.rsi = 4;
      } else if (rsiVal < rsiOversold) {
        components.rsi = 3;
      } else if (rsiVal < rsiMid) {
        components.rsi = 2;
      } else if (rsiVal < rsiMid + 5) {
        components.rsi = 1;
      } else if (rsiVal < rsiOverbought) {
        components.rsi = -1;
      } else {
        components.rsi = -3;
      }
    }
  } else {
    if (rsiVal !== null) {
      if (rsiVal > rsiOverbought + 5) {
        components.rsi = 4;
      } else if (rsiVal > rsiOverbought) {
        components.rsi = 3;
      } else if (rsiVal > rsiMid) {
        components.rsi = 2;
      } else if (rsiVal > rsiMid - 5) {
        components.rsi = 1;
      } else if (rsiVal > rsiOversold) {
        components.rsi = -1;
      } else {
        components.rsi = -3;
      }
    }
  }

  // ---- Spike Protection (postSpike) ----
  const POST_SPIKE_LOOKBACK = 50;
  if (prices.length >= POST_SPIKE_LOOKBACK) {
    const recentPrices = prices.slice(-POST_SPIKE_LOOKBACK);
    const currentPrice = prices[prices.length - 1];
    const minPrice = Math.min(...recentPrices);
    const maxPrice = Math.max(...recentPrices);
    const range = maxPrice - minPrice;
    if (range > 0) {
      const position = (currentPrice - minPrice) / range;
      if (direction === 'CALL') {
        if (position < 0.15) components.postSpike = 2;
        else if (position > 0.85) components.postSpike = -3;
      } else {
        if (position < 0.15) components.postSpike = -3;
        else if (position > 0.85) components.postSpike = 2;
      }
    }
  }

  // ---- Momentum ----
  if (deltaAlign !== null && deltaAlign !== undefined) {
    if (deltaAlign >= 5) components.momentum = 3;
    else if (deltaAlign >= 4) components.momentum = 2;
    else if (deltaAlign >= 3) components.momentum = 1;
    else if (deltaAlign <= 1) components.momentum = -1;
  }

  // ---- Bollinger Bands Component ----
  if (bb !== null && bb !== undefined) {
    if (direction === 'CALL') {
      if (bb.belowLower) components.bb = 3;
      else if (bb.aboveUpper) components.bb = -2;
      else if (bb.middle !== null && prices.length >= 2) {
        const currentPrice = prices[prices.length - 1];
        const prevPrice = prices[prices.length - 2];
        if (currentPrice < bb.middle && currentPrice > prevPrice) components.bb = 1;
      }
    } else {
      if (bb.aboveUpper) components.bb = 3;
      else if (bb.belowLower) components.bb = -2;
      else if (bb.middle !== null && prices.length >= 2) {
        const currentPrice = prices[prices.length - 1];
        const prevPrice = prices[prices.length - 2];
        if (currentPrice > bb.middle && currentPrice < prevPrice) components.bb = 1;
      }
    }
  }

  // ---- EMA Component ----
  if (emaTrend !== null && emaTrend !== undefined) {
    if (direction === 'CALL') {
      if (emaTrend < -0.001) components.ema = 2;
      else if (emaTrend > 0.001) components.ema = -2;
      else components.ema = 1;
    } else {
      if (emaTrend > 0.001) components.ema = 2;
      else if (emaTrend < -0.001) components.ema = -2;
      else components.ema = 1;
    }
  }

  // ---- ROC Component ----
  const rocThreshold = config.rocMagnitudeThreshold || 0.5;
  if (rocVal !== null && rocVal !== undefined) {
    const absRoc = Math.abs(rocVal);
    if (direction === 'CALL') {
      if (rocVal < -rocThreshold) components.roc = 2;
      else if (rocVal > rocThreshold) components.roc = -1;
      else if (absRoc < rocThreshold * 0.2) components.roc = -1;
    } else {
      if (rocVal > rocThreshold) components.roc = 2;
      else if (rocVal < -rocThreshold) components.roc = -1;
      else if (absRoc < rocThreshold * 0.2) components.roc = -1;
    }
  }

  // ---- Symbol Bias Component ----
  // BOOM1000 tends to spike UP → favor PUT; CRASH1000 tends to crash DOWN → favor CALL
  const symbol = (config.symbol || '').toUpperCase();
  if (symbol.startsWith('BOOM')) {
    components.symbolBias = direction === 'PUT' ? 1 : -1;
  } else if (symbol.startsWith('CRASH')) {
    components.symbolBias = direction === 'CALL' ? 1 : -1;
  }

  let total = 0;
  for (const key of Object.keys(components)) {
    total += components[key];
  }

  const score = total;
  const enter = score >= scoreThreshold;

  return {
    score,
    components,
    direction,
    enter,
  };
}

module.exports = { computeScore };
