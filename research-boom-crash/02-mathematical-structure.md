# Mathematical Structure of Boom/Crash Indices

## Price Generation Model

Deriv's Boom/Crash indices follow a compound process:

```
P(t+1) = P(t) + μ × Δt + σ × ε × √Δt + S(t)
```

Where:
- **μ** = drift component (negative for Boom, positive for Crash)
- **σ** = base volatility (~30-40% annualized)
- **ε** = standard normal random variable (the random walk component)
- **Δt** = time step (2 seconds for standard indices)
- **S(t)** = spike component (zero most ticks, large value on spike ticks)

## The Drift Component (μ)

This is the **critical parameter** for edge creation:

| Index | Between-spike drift | Typical magnitude |
|---|---|---|
| Boom 1000 | μ < 0 (downward) | ~-0.05 to -0.2 points per tick |
| Crash 1000 | μ > 0 (upward) | ~+0.05 to +0.2 points per tick |
| Volatility indices | μ ≈ 0 | ~0 |

The drift is small but **persistent** — it operates on every tick between spikes.

## The Spike Component (S(t))

Spikes follow a **Poisson-like process**:

```
P(spike at tick t) = λ ≈ 1/1000 ≈ 0.001
```

Spike magnitude follows a distribution (likely log-normal or Pareto):

| Percentile | Magnitude (points) |
|---|---|
| Median | ~50-100 |
| 90th percentile | ~200-300 |
| 99th percentile | ~500+ |

## Spike Timing Distribution

The time between spikes follows an **exponential distribution**:

```
P(T > t) = e^(-λt)
P(spike within next N ticks) = 1 - e^(-λN)
```

| N (ticks) | Probability spike occurred | Implication |
|---|---|---|
| 100 | 9.5% | Early spike — rare but possible |
| 500 | 39.3% | ~40% chance |
| 1000 | 63.2% | ~63% — the average |
| 1500 | 77.7% | ~78% |
| 2000 | 86.5% | ~87% |
| 3000 | 95.0% | ~95% — very likely |
| 5000 | 99.3% | Almost certain |

## Key Mathematical Properties

### 1. Memorylessness
The process is memoryless — the probability of a spike in the next tick is always ~0.1%, regardless of how long you've waited. This means **waiting longer does not increase per-tick spike probability**.

### 2. But cumulative probability does increase
While per-tick probability is constant, the chance of having *already seen* a spike increases with time. After 2000 ticks with no spike, there's an 86.5% chance a spike was "missed" in an alternative universe, but the next tick is still only 0.1%.

### 3. Drift accumulates linearly
The drift μ accumulates over time. Over 1000 ticks at -0.1 points per tick:
- Expected drift = -100 points
- This is significant relative to typical price levels

### 4. Spike risk is always present
At any tick, there's a 0.1% chance of a spike. Over 1000 ticks:
- P(at least one spike) = 63.2%
- P(two or more spikes) = ~26.4%
- This means double-spike events are not rare

## Why This Matters for Trading

The drift creates a small but real edge:

| Contract | Expected WR (drift only) | Timeframe |
|---|---|---|
| CALL on Crash 1000 | ~50.5-51.5% | 5-20 ticks |
| PUT on Boom 1000 | ~50.5-51.5% | 5-20 ticks |
| CALL on R_100 | ~50.0% | Any |

This ~1% edge above 50/50 is small but **real**. Combined with proper filtering (enter only after confirmed drift, exit before expected spike), it can potentially reach 53-58%.

## Independence Verification

Independent tick-data analysis confirms:
- **No autocorrelation** in tick returns (ACF ≈ 0 for all lags)
- **No post-spike drift pattern** (independent research by Orphy123 falsified PSDC)
- **Spike timing is random** (Poisson process confirmed)
- **Digit distribution is uniform** (all digits 0-9 occur ~10%)

## Critical Distinction: Binary Options vs CFD Trading

This research project targets **Deriv Binary Options (Rise/Fall)**, NOT CFD trading. The cost structures are fundamentally different:

| Cost type | Binary Options (Rise/Fall) | CFD (MT5) |
|---|---|---|
| Entry cost | None (no spread) | Spread paid on entry |
| Exit cost | None (no spread) | Spread paid on exit |
| Loss scenario | Fixed (full stake only) | Variable (points × lot size) |
| Win scenario | Fixed (payout: ~85% profit) | Variable (points × lot size) |
| Round-trip spread cost | **$0** (baked into payout) | **~1,430 points** |
| Break-even WR at 85% payout | **54.05%** | N/A (depends on spread) |

### Why This Matters

Recent independent research (Berko, 2026) analyzed 15 million ticks of Boom/Crash 1000 data and concluded "the edge did not survive the costs." **However, that study analyzed CFD trading via MT5 data**, where the round-trip spread of ~1,430 points dominates economics.

For binary options, there is **no spread cost**. The only "cost" is the payout ratio. If a Rise/Fall contract pays 85% profit:
- At 50% WR: Expected value = −7.5% per trade
- At 54% WR: Expected value = +0.45% per trade (break-even is ~54.05%)
- At 56% WR: Expected value = +3.6% per trade

**The drift edge that is too small for CFD trading may still be viable for binary options**, because binary options have no spread to overcome.

### Revised Economics

| Instrument | WR needed for breakeven | WR needed for +EV | Comment |
|---|---|---|---|
| CFD Boom/Crash | ~52.5% (overcoming 1,430pt spread) | ~55% | Berko study: not viable |
| RF Binary Option (85% payout) | 54.05% | 55%+ | Potentially viable |
| RF Binary Option (90% payout) | 52.63% | 54%+ | More viable |
| RF Binary Option (95% payout) | 51.28% | 53%+ | Most viable (if available) |

**Conclusion:** The same drift that fails for CFD trading may succeed for binary options, because binary options strip away the spread cost. However, the 54%+ WR requirement remains challenging and requires effective filtering beyond pure drift.

## Conclusion

The mathematical edge in Boom/Crash comes **solely from the between-spike drift**. It is small (~0.5-1.5% above 50/50 per trade) and must be protected against the occasional spike which can wipe out many accumulated wins. For binary options (Rise/Fall), the absence of spread costs makes this edge potentially viable where CFD trading is not.
