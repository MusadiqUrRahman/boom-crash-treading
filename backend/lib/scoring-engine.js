function detectSpikeInLastN(prices, n, threshold) {
  if (prices.length < 2) return false;
  const start = Math.max(0, prices.length - n);
  for (let i = start + 1; i < prices.length; i++) {
    const delta = Math.abs(prices[i] - prices[i - 1]);
    if (delta >= threshold) return true;
  }
  return false;
}

function computeScore(indicators, config) {
  const rsiVal = indicators.rsi ? indicators.rsi.value : null;
  const bb = indicators.bb;
  const emaShort = indicators.emaShort;
  const emaLong = indicators.emaLong;
  const rocVal = indicators.roc;
  const deltas = indicators.deltas;
  const prices = indicators._rawPrices || [];

  const spikePresent = detectSpikeInLastN(prices, 50, config.spikeThreshold);

  function scoreForDirection(dir) {
    let total = 0;
    const components = { rsi: 0, bb: 0, ema: 0, roc: 0, momentum: 0, postSpike: 0 };

    if (dir === 'CALL') {
      if (rsiVal !== null && rsiVal < config.rsiOversold) {
        components.rsi = 3;
      } else if (rsiVal !== null && rsiVal < 50) {
        components.rsi = 1;
      }

      if (bb && bb.belowLower) components.bb = 2;

      if (emaShort !== null && emaLong !== null && emaShort > emaLong) components.ema = 1;

      if (rocVal !== null && rocVal > 0) components.roc = 1;

      if (deltas && deltas.length >= 3) {
        const last3 = deltas.slice(-3);
        if (last3.every(d => d > 0)) components.momentum = 2;
      }
    } else {
      if (rsiVal !== null && rsiVal > config.rsiOverbought) {
        components.rsi = 3;
      } else if (rsiVal !== null && rsiVal > 50) {
        components.rsi = 1;
      }

      if (bb && bb.aboveUpper) components.bb = 2;

      if (emaShort !== null && emaLong !== null && emaShort < emaLong) components.ema = 1;

      if (rocVal !== null && rocVal < 0) components.roc = 1;

      if (deltas && deltas.length >= 3) {
        const last3 = deltas.slice(-3);
        if (last3.every(d => d < 0)) components.momentum = 2;
      }
    }

    if (spikePresent) {
      components.postSpike = -1;
    }

    for (const key of Object.keys(components)) {
      total += components[key];
    }

    return { total, components };
  }

  const call = scoreForDirection('CALL');
  const put = scoreForDirection('PUT');
  const spread = Math.abs(call.total - put.total);

  let direction = null;
  let enter = false;

  if (call.total >= config.scoreThreshold && call.total > put.total && spread >= config.minScoreSpread) {
    direction = 'CALL';
    enter = true;
  } else if (put.total >= config.scoreThreshold && put.total > call.total && spread >= config.minScoreSpread) {
    direction = 'PUT';
    enter = true;
  }

  return {
    call,
    put,
    spread,
    decision: { direction, enter },
  };
}

module.exports = { computeScore, detectSpikeInLastN };
