# Entry & Exit Strategies

## Strategy Classification

| Strategy | Type | Complexity | Est. WR | Risk |
|---|---|---|---|---|
| Drift-only | Simple direction bet | Low | 51-53% | Low |
| Post-spike entry | Enter after confirmed spike | Low | 53-55% | Low |
| Drift-confirmation | Enter only after N ticks of drift | Medium | 54-56% | Medium |
| Time-gated exit | Fixed duration exit | Medium | 53-57% | Medium |
| Barrier-based | Higher/Lower with optimized barriers | High | 45-50% (×1.2-1.6x) | High |
| Multi-stage | Scale in/out during drift | High | 55-58% | High |

## Strategy 1: Drift-Only (Baseline)

**Entry:** Immediately enter a drift-aligned contract after any spike
**Exit:** Fixed duration (10-20 ticks)
**Frequency:** ~50-70 trades/day
**Expected WR:** 51-53%
**Edge:** Pure drift exploitation, minimal filtering

**Pros:** Simple, low cognitive overhead, easy to automate
**Cons:** Low win rate, negative variance periods hurt

## Strategy 2: Post-Spike Entry (Starting Point — With Caveats)

**Entry:** Wait for a confirmed spike (>50 point move in 1-2 ticks), then enter drift-aligned contract
**Exit:** Fixed duration (10-20 ticks)
**Frequency:** ~30-50 trades/day
**Expected WR:** 52-54%

**Rationale:**
- After a spike, the drift has maximum "room" to operate
- The next spike is statistically far away (cumulative probability)
- The drift is often strongest right after a spike

**Caveat — Recent Research (Berko, 2026):**
A 15M tick study found that post-spike windows are **statistically indistinguishable from random windows**. This means post-spike entry alone may NOT provide the expected edge. The drift is real at the tick level but too small to detect at single measurement points.

**Revised view:** Use post-spike entry as a STARTING POINT, not a primary edge source. The real edge comes from statistical accumulation over hundreds of trades, not from timing individual spikes.

**Rules:**
1. Wait for a spike (price moves >spikeThreshold in 1-2 ticks)
2. Confirm it's a true spike (not a normal fluctuation)
3. Wait 1-2 ticks for spike to complete
4. Enter drift-aligned contract (CALL on Crash, PUT on Boom)
5. Exit after fixed duration (10-20 ticks)

## Strategy 3: Drift Confirmation (Higher WR)

**Entry:** Don't enter immediately after spike. Wait for 3-5 ticks of confirmed drift in the expected direction.
**Exit:** Fixed duration (10-20 ticks) OR stop loss if drift reverses
**Frequency:** ~20-40 trades/day
**Expected WR:** 54-56%

**Rules:**
1. After a spike, wait
2. Monitor tick direction for 3-5 ticks
3. If majority of ticks are in drift direction → enter
4. If price goes flat or reverses → skip this cycle
5. Exit after fixed duration

**Trade-off:** Fewer trades, higher win rate, but may miss some drift periods.

## Strategy 4: Time-Gated Exit (Risk Management)

**Entry:** Post-spike or drift-confirmation entry
**Exit:** Fixed tick duration OR early exit if profit target reached
**Frequency:** ~30-50 trades/day
**Expected WR:** 53-57%

**Early exit (scalping variant):**
- If price moves in drift direction by >exitThreshold in < halfDuration → exit early
- Otherwise hold to full duration

**Rationale:** Captures the strongest part of the drift and avoids the tail risk.

## Strategy 5: Higher/Lower Barrier (Enhanced Payout)

**Entry:** Post-spike, set barrier at current price + offset in drift direction
**Contract:** Higher (for Crash) or Lower (for Boom)
**Duration:** 10-20 ticks

**Barrier optimization:**
- Barrier too close → low payout (~80%)
- Barrier too far → low win rate
- Optimal barrier: where historical drift reaches ~60% of the time

**Pros:** Better payout (120-160%) can offset lower win rate
**Cons:** Complex calibration, higher variance

## Strategy 6: Multi-Stage

**Entry:** Scale into multiple contracts over the drift period
**Exit:** Separate exits per contract at different durations

Example for Crash 1000:
- Contract 1: CALL, 5 ticks, $0.25 (quick drift capture)
- Contract 2: CALL, 15 ticks, $0.50 (main drift)
- Contract 3: CALL, 30 ticks, $0.25 (extended drift, higher spike risk)

**Pros:** Diversifies entry timing, smooths P&L
**Cons:** Complex, more capital required

## Recommended Starting Strategy

**Start with Strategy 2 (Post-Spike Entry):**

| Parameter | Value |
|---|---|
| Spike threshold | 50 points (adjustable) |
| Contract type | Rise/Fall (drift-aligned) |
| Duration | 10 ticks |
| Stake | 0.5% of account |
| Post-spike wait | 1-2 ticks |
| Trade cooldown | 10 ticks after loss |
| Daily stop | 10% drawdown |

**Why start here:**
- Simplest to implement
- Low complexity = fewer bugs
- The drift signal is strongest here
- Easy to measure and verify
- Baseline for comparing strategy improvements

## Recommended Strategy: Multi-Filter Scoring System

Given the research finding that post-spike timing alone provides no detectable edge (Berko, 2026), the recommended approach is a **multi-filter scoring system** that combines multiple weak signals into a stronger entry decision.

This approach is inspired by successful strategies on volatility indices that achieve 70%+ WR through combined indicators, but adapted for the smaller Boom/Crash drift edge.

### Scoring System Concept

Assign points for each condition favoring the drift direction:

| Condition | Points | Rationale |
|---|---|---|
| Price in bottom 30% of Bollinger Band | +2 | Mean reversion potential |
| RSI < 40 (for CALL on Crash) | +3 | Oversold in uptrend |
| RSI > 60 (for PUT on Boom) | -1 | Overbought — avoid |
| Last 3 ticks in drift direction | +2 | Short-term momentum |
| Spike occurred in last 50 ticks | +1 | Post-spike window |
| Price below 5-tick EMA (for Crash CALL) | +2 | Pullback entry |
| Rate of Change positive (for Crash) | +1 | Confirming momentum |
| Time since last spike > 100 ticks | -1 | Spike risk increasing |

**Threshold:** Only enter if score >= minimumThreshold (e.g., 5-6)

This provides a **statistical edge** rather than a timing edge — you're not predicting spikes, you're stacking probabilities.

### Strategy 1: Drift-Only (Baseline)

**Entry:** Immediately enter a drift-aligned contract after any spike
**Exit:** Fixed duration (10-20 ticks)
**Frequency:** ~50-70 trades/day
**Expected WR:** 51-53%
**Edge:** Pure drift exploitation, minimal filtering

**Pros:** Simple, low cognitive overhead, easy to automate
**Cons:** Low win rate, negative variance periods hurt

### Strategy 2: Post-Spike Entry (Starting Point — With Caveats)

**Entry:** Wait for a confirmed spike (>50 point move in 1-2 ticks), then enter drift-aligned contract
**Exit:** Fixed duration (10-20 ticks)
**Frequency:** ~30-50 trades/day
**Expected WR:** 52-54%

**Rationale:**
- After a spike, the drift has maximum "room" to operate
- The next spike is statistically far away (cumulative probability)
- The drift is often strongest right after a spike

**Caveat — Recent Research (Berko, 2026):**
A 15M tick study found that post-spike windows are **statistically indistinguishable from random windows**. This means post-spike entry alone may NOT provide the expected edge. The drift is real at the tick level but too small to detect at single measurement points.

**Revised view:** Use post-spike entry as a STARTING POINT, not a primary edge source. The real edge comes from statistical accumulation over hundreds of trades, not from timing individual spikes.

**Rules:**
1. Wait for a spike (price moves >spikeThreshold in 1-2 ticks)
2. Confirm it's a true spike (not a normal fluctuation)
3. Wait 1-2 ticks for spike to complete
4. Enter drift-aligned contract (CALL on Crash, PUT on Boom)
5. Exit after fixed duration (10-20 ticks)

## Strategy Improvement Path

```
Start → Strategy 2 (Post-Spike, baseline only)
  ├─ Not enough WR? → Add multi-filter scoring (Recommended)
  ├─ Win rate OK but payout low? → Try barriers (Strategy 5)
  ├─ Variance too high? → Add multi-stage (Strategy 6)
  └─ Working well? → Increase stake slowly
```
