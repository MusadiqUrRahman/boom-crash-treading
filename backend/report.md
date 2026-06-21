# Boom Crash Trading Bot - Live Session Report
## Date: 2026-06-21

---

## Session Summary

| Metric | Value |
|--------|-------|
| Session Duration | ~50 minutes |
| Start Time | 07:03 IST |
| End Time | 07:53 IST |
| Starting Balance | $9982.91 |
| Final Balance | $9983.49 |
| Total Trades | 10 |
| Wins | 3 |
| Losses | 7 |
| Win Rate | 30% |
| Net PnL | +$0.73 |

---

## Trade Log

| # | Trade ID | Signal | Entry Price | Score | Direction | Exit Price | Exit Reason | PnL |
|---|----------|--------|------------|-------|-----------|------------|-------------|-----|
| 0 | (orphan) | stale | 14267.148 | 6 | CALL | — | STALE | -$0.05 |
| 1 | BC-0001 | signal | 14266.980 | 3 | CALL | 14262.646 | TIMEOUT | -$0.10 |
| 2 | BC-0002 | signal | 14262.412 | 5 | CALL | 14258.082 | TIMEOUT | -$0.10 |
| 3 | BC-0003 | signal | 14257.866 | 5 | CALL | 14266.886 | TIMEOUT | +$0.27 |
| 4 | BC-0004 | signal | 14266.864 | 5 | CALL | 14262.564 | TIMEOUT | -$0.10 |
| 5 | BC-0005 | signal | 14262.500 | 5 | CALL | 14258.385 | TIMEOUT | -$0.10 |
| 6 | BC-0006 | signal | 14258.135 | 5 | CALL | 14263.861 | TIMEOUT | -$0.10 |
| 7 | BC-0007 | signal | 14283.154 | 12 | PUT | 14278.817 | TIMEOUT | +$0.11 |
| 8 | BC-0008 | signal | 14278.706 | 5 | CALL | 14307.129 | TIMEOUT | +$0.95 |
| 9 | BC-0009 | signal | 14307.092 | 5 | CALL | 14302.628 | TIMEOUT | -$0.10 |

---

## Issues Identified

### 1. Score Threshold Too Low
- **Problem:** `SCORE_THRESHOLD=2` was used instead of optimized value `9`
- **Impact:** Low-quality signals (score 3-5) triggered trades
- **Fix:** Changed to `SCORE_THRESHOLD=9`

### 2. Stop Loss Too Tight
- **Problem:** `STOP_LOSS=0.10` was too tight
- **Impact:** Trades exited prematurely on small dips
- **Fix:** Changed to `STOP_LOSS=0.25`

### 3. Position Timeout Too Long
- **Problem:** `MAX_POSITION_TICKS=300` (5 minutes)
- **Impact:** Trades held too long, missing optimal exit
- **Fix:** Changed to `MAX_POSITION_TICKS=110`

### 4. Direction Mismatch
- **Problem:** Bot entered CALL trades while price was dropping
- **Impact:** 8 out of 10 trades were CALL in a downtrend
- **Root Cause:** Dynamic direction detection needs optimization

---

## Configuration Changes Applied

```diff
# .env changes
- SCORE_THRESHOLD=2
+ SCORE_THRESHOLD=9

- STOP_LOSS=0.10
+ STOP_LOSS=0.25

- MAX_POSITION_TICKS=300
+ MAX_POSITION_TICKS=110
```

---

## Optimized Parameters (from best-params.json)

| Parameter | Optimized Value | Live Test Value |
|-----------|-----------------|-----------------|
| scoreThreshold | 9 | 2 (fixed to 9) |
| stopLoss | 0.05 | 0.10 (fixed to 0.25) |
| maxMlDurationTicks | 110 | 300 (fixed to 110) |
| multiplier | 500 | 500 |
| stake | 1.00 | 1.00 |
| durationTicks | 5 | 5 |
| cooldownTicks | 3 | 3 |
| payoutRate | 0.85 | 0.85 |

---

## Recommendations

### Immediate
1. **Restart bot** with updated `.env` values
2. **Monitor first 20 trades** for score distribution
3. **Verify** score threshold is now 9 in logs

### Short-term
1. Optimize dynamic direction detection
2. Add trailing stop-loss activation
3. Reduce trade frequency

### Long-term
1. Re-run optimization with live data
2. Add risk limits (max drawdown)
3. Implement Telegram alerts

---

## Database Analysis

| Metric | Value |
|--------|-------|
| Historical Trades | ~70 |
| Date Range | 2026-06-13 to 2026-06-19 |
| Old Multiplier | 200 |
| New Multiplier | 500 |
| Old Stake | $2 |
| New Stake | $1 |

---

## Next Steps

1. Run live test with fixed configuration
2. Verify score threshold = 9 in logs
3. Monitor win rate improvement
4. Consider direction detection optimization

---

## File Changes

- **Modified:** `backend/.env`
- **Lines Changed:** 3
- **Values Updated:** SCORE_THRESHOLD, STOP_LOSS, MAX_POSITION_TICKS

---

*Report generated: 2026-06-21*
