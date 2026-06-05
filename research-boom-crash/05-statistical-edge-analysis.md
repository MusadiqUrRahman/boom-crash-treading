# Statistical Edge Analysis

## The Fundamental Question

Does Boom/Crash 1000 offer a **real, tradeable edge** over random?

**Answer:** Possibly, but it is **very small** and requires **excellent risk management** to capture. Recent independent research (Berko, 15M ticks, 2026) challenges simple post-spike strategies but does not rule out statistical drift betting on binary options.

## Critical Distinction: CFD vs Binary Options

The answer depends entirely on which instrument you trade:

| Aspect | CFD (MT5) | Binary Options (Rise/Fall) |
|---|---|---|
| Round-trip cost | ~1,430 points spread | None (cost baked into payout) |
| Loss amount | Variable (points × lot) | Fixed (full stake) |
| Win amount | Variable (points × lot) | Fixed (payout %) |
| Breakeven WR | Depends on spread captured | 54.05% at 85% payout |
| Berko 2026 verdict | **Not viable** (spread kills edge) | **Not tested** |

**This project targets Binary Options (Rise/Fall)**. The analysis below assumes binary options cost structure unless stated otherwise.

## Quantifying the Edge

### Edge Source 1: Between-Spike Drift

The drift creates a **directional bias** that translates into an above-50% win rate for contracts aligned with the drift.

| Duration | Est. WR (drift-aligned) | Est. WR (against drift) |
|---|---|---|
| 5 ticks | 50.5-51.5% | 48.5-49.5% |
| 10 ticks | 51-53% | 47-49% |
| 20 ticks | 52-55% | 45-48% |
| 50 ticks | 54-58% | 42-46% |
| 100 ticks | 56-62% | 38-44% |

**But** — longer durations increase spike risk, which counters the drift advantage.

### Edge Source 2: Post-Spike Positioning

Immediately after a spike:
- The drift has maximum "room" to operate
- The next spike is statistically far away (cumulative probability)
- The drift is often strongest

**REVISED VIEW:** Berko (2026) found post-spike windows indistinguishable from random windows in CFD data. For binary options, any post-spike timing advantage is unproven and likely very small. Do not rely on this as primary edge.

### Edge Source 3: Contract Selection

Using **Higher/Lower** with barriers slightly in the drift direction can improve payout rate:

| Approach | Est. WR | Payout | Expectancy |
|---|---|---|---|
| Rise/Fall (drift-aligned) | 53% | 85% | +0.53×0.85 − 0.47×1 = +0.45% |
| Higher/Lower (1-barrier drift) | 48% | 120% | +0.48×1.20 − 0.52×1 = +0.56% |
| Higher/Lower (2-barrier drift) | 42% | 160% | +0.42×1.60 − 0.58×1 = +0.92% |

Higher/Lower can produce better expectancy by trading lower win rate for higher payout — **if** you can accurately calibrate the barrier distance.

## Realistic Expectancy Calculation

### Scenario: Crash 1000, Rise (CALL), 10 ticks, Binary Option

```
Edge = (WR × Payout) − (LR × 1)

where Payout = net profit return (e.g., 0.85 = 85%)

Base (no drift, 50% WR):  0.50 × 0.85 − 0.50 × 1 = −7.50% (negative)
Pure drift (51% WR):       0.51 × 0.85 − 0.49 × 1 = −5.65% (still negative)
Filtered entry (53% WR):   0.53 × 0.85 − 0.47 × 1 = +0.45% (positive!)
Good filter (55% WR):      0.55 × 0.85 − 0.45 × 1 = +1.75% (good)
Optimal filter (57% WR):   0.57 × 0.85 − 0.43 × 1 = +5.45% (excellent)
```

**Reality check:** The break-even win rate for Rise/Fall at 85% payout is **54.05%**. Pure drift alone (~51% WR at 10 ticks) is NOT enough. The entry filter must add at least 3% to WR to overcome the negative base expectancy.

### Breakeven WR by Payout

| Payout | Breakeven WR | Feasibility |
|---|---|---|
| 80% | 55.56% | Very challenging |
| 85% | 54.05% | Challenging but possible |
| 90% | 52.63% | Potentially achievable |
| 95% | 51.28% | Achievable with drift alone |

Higher payouts dramatically improve viability. Target contracts with 90%+ payout.

## Comparison to DIGITEVEN

| Metric | DIGITEVEN (R_100) | Rise/Fall (Crash 1000) |
|---|---|---|
| Base WR | 50% | ~50.5-51.5% (drift) |
| Filtered WR | 50% | 53-57% (requires filter) |
| Payout | 96% | 80-95% |
| Edge after filter | 0% (no edge) | −5.65% to +5.45% |
| Spike risk | None | Present (~0.1% per tick) |
| Strategy complexity | Low | Medium |
| Spread cost | None (binary) | None (binary) |

**Crash/Boom has a genuine structural advantage over DIGITEVEN** due to the drift component, BUT the breakeven WR is higher (54% vs 51% for DIGITEVEN at 96% payout).

## Win Rate Requirements

| Target daily profit | Account size | Required WR (at 85% payout, $0.50 stake, 50 trades/day) |
|---|---|---|
| $5 | $500 | ~54% |
| $5 | $1000 | ~52% |
| $10 | $500 | ~57% |
| $10 | $1000 | ~54% |
| $20 | $500 | ~65% (likely unsustainable) |

## Variance Analysis

Expected variance at different win rates (1000 trades):

| WR | Expected net (per $0.50 stake) | Standard deviation | 95% confidence interval |
|---|---|---|---|
| 50% | −$75.00 | ±$15.61 | [−$105.61, −$44.39] |
| 52% | −$29.00 | ±$15.57 | [−$59.57, +$1.57] |
| 54% | +$17.00 | ±$15.53 | [−$13.53, +$47.53] |
| 56% | +$63.00 | ±$15.48 | [+$32.52, +$93.48] |
| 58% | +$109.00 | ±$15.42 | [+$78.58, +$139.42] |

**Key insight:** Even at 54% WR, there's a ~14% chance of being negative after 1000 trades due to variance. You need 56%+ WR for statistical confidence.

## Statistical Significance Required

| Observed WR | N needed (p < 0.01) | Est. time to verify |
|---|---|---|
| 52% | 2,700 | ~54 days at 50 trades/day |
| 53% | 1,200 | ~24 days |
| 54% | 675 | ~14 days |
| 55% | 430 | ~9 days |
| 56% | 300 | ~6 days |
| 57% | 220 | ~4 days |

## Conclusion

A real edge **may** exist on Boom/Crash 1000 binary options, but it is **very small** and easily confused with noise:

1. **Pure drift alone (51-51.5% WR) cannot reach breakeven** on Rise/Fall at 85% payout
2. **Entry filters must add 3%+ to WR** to reach 54%+ breakeven
3. **Recent research (Berko, 2026) casts doubt on post-spike timing filters** — but tested CFD, not binary options
4. **If 54%+ WR is achievable**, edge is real and viable with:
   - Proper position sizing (0.5-1% risk per trade)
   - High trade volume (50-200 trades/day)
   - Strict risk management (stop on drawdown)
   - Realistic profit targets ($5-10/day on $500-1000)
5. **If 54%+ WR cannot be achieved**, the strategy is negative EV and will lose money

**The viability of this project hinges on whether 54%+ WR can be achieved on Rise/Fall binary options for Boom/Crash 1000. This must be verified through rigorous backtesting before any real money is deployed.**
