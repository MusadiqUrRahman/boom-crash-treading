function simulateTrade(entryIndex, entryPrice, direction, durationTicks, payoutRate, stake, allowEquals, prices) {
  const exitIndex = entryIndex + durationTicks;

  if (exitIndex >= prices.length) return null;

  const exitPrice = prices[exitIndex];

  let win;
  if (direction === 'CALL') {
    win = allowEquals ? exitPrice >= entryPrice : exitPrice > entryPrice;
  } else {
    win = allowEquals ? exitPrice <= entryPrice : exitPrice < entryPrice;
  }

  const pnl = win ? stake * payoutRate : -stake;

  return { win, pnl, exitPrice, exitIndex };
}

function simulateMultiplierTrade(entryIndex, entryPrice, direction, prices, stake, multiplier, stopLoss, takeProfit, maxDurationTicks, trailDistance) {
  const dir = direction === 'PUT' ? 1 : -1;
  let peakPnl = -Infinity;
  let currentSL = -stopLoss;
  for (let i = entryIndex + 1; i < prices.length && (i - entryIndex) <= maxDurationTicks; i++) {
    const currentPrice = prices[i];
    const pnl = dir * stake * multiplier * (entryPrice - currentPrice) / entryPrice;
    if (pnl > peakPnl) peakPnl = pnl;
    if (trailDistance > 0 && peakPnl > 0) {
      currentSL = Math.max(currentSL, peakPnl - trailDistance);
    }
    if (pnl >= takeProfit) {
      return { win: true, pnl: takeProfit, exitPrice: currentPrice, exitIndex: i, exitReason: 'TP' };
    }
    if (pnl <= currentSL) {
      const isTrailed = trailDistance > 0 && currentSL > -stopLoss;
      if (isTrailed) {
        return { win: currentSL > 0, pnl: currentSL > 0 ? currentSL : pnl, exitPrice: currentPrice, exitIndex: i, exitReason: 'TRAIL_SL' };
      }
      return { win: false, pnl: -stopLoss, exitPrice: currentPrice, exitIndex: i, exitReason: 'SL' };
    }
  }

  const lastIdx = Math.min(entryIndex + maxDurationTicks, prices.length - 1);
  const exitPrice = prices[lastIdx];
  const finalPnl = dir * stake * multiplier * (entryPrice - exitPrice) / entryPrice;
  return { win: finalPnl > 0, pnl: finalPnl, exitPrice, exitIndex: lastIdx, exitReason: 'TIMEOUT' };
}

module.exports = { simulateTrade, simulateMultiplierTrade };
