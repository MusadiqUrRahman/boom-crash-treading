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

module.exports = { simulateTrade };
