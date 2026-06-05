# 24/7 Automation

## Feasibility for Boom/Crash

Boom/Crash indices trade 24/7/365 — perfect for automation. However, the spike-based structure introduces challenges compared to DIGITEVEN.

## Key Differences from DIGITEVEN Automation

| Aspect | DIGITEVEN Bot | Boom/Crash Bot |
|---|---|---|
| Index | R_100 (volatility) | BOOM1000/CRASH1000 |
| Strategy | Continuous (every tick) | Post-spike (periodic) |
| Trade frequency | 50-150/day | 30-70/day |
| Entry trigger | Digit outcome | Spike detection |
| Risk event | None (50/50) | Spike in wrong direction |
| Cooldown handling | Simple | More complex (post-spike) |

## Automation Pipeline

### Data Flow
```
Deriv WS (ticks) → BoomCrashStrategy → TradeExecutor → Contract Monitor
                          ↓
                    RiskManager (spike detection, drift monitoring)
                          ↓
                    StakeManager (post-spike adjustment)
```

### State Machine

```
COLLECTING → SCORING → SCORE_READY → DECISION → ENTERING → IN_POSITION
                                                              ↓
                                                        (win/loss)
                                                              ↓
                                                        COOLDOWN
                                                              ↓
                                                    COLLECTING (loop)
```

The state machine focuses on **continuous data collection and scoring** rather than spike detection, because research shows spike timing provides no detectable edge.

### States Detail

| State | Duration | Action | Spike handling |
|---|---|---|---|
| COLLECTING | Continuous | Buffer ticks, calculate indicators | Monitor for spikes (informational) |
| SCORING | Every N ticks | Calculate RSI, BB, ROC, EMA, drift | Include spike proximity in score |
| SCORE_READY | 1 tick | Compare score to threshold | If score >= minThreshold → proceed |
| DECISION | 1 tick | Check risk limits, cooldown, daily cap | Block trade if limits hit |
| ENTERING | 1 tick | Submit binary option contract | Monitor submission |
| IN_POSITION | 5-20 ticks | Hold trade | Monitor for opposite spike |
| RESOLVING | 1 tick | Record result | Update statistics |
| COOLDOWN | 5-20 ticks | Wait between trades | Let index stabilize |

## 24/7 Reliability Requirements

### Connection Resilience
- WebSocket auto-reconnect (existing: ✅)
- Re-subscribe to index on reconnect (existing: ✅)
- Tick gap detection and handling (new: need to handle missed ticks)

### Data Integrity
- Tick sequence validation (ensure no gaps)
- Price sanity checks (reject out-of-range values)
- Spike confirmation (require 2 consecutive ticks for spike verification)

### Error Recovery

| Error | Recovery | Spike impact |
|---|---|---|
| WS disconnect | Auto-reconnect + re-subscribe | Missed ticks → wait for next spike |
| Trade submission failure | Retry once, then skip | No trade this cycle |
| Contract confirmation timeout | Mark as unknown, continue | One trade at risk |
| Invalid response | Log, skip trade, continue | No action |

### Sleep/Wake Behavior
- Bot runs 24/7
- No scheduled pauses (Boom/Crash doesn't sleep)
- If paused manually: resume subscribes, waits for next spike

## Resource Requirements

### Infrastructure
- **Server:** $5-10/month VPS (2GB RAM, 1 vCPU)
- **Storage:** ~50MB/month for trade records
- **Bandwidth:** Minimal (WS data is small)

### Monitoring
- Health check endpoint (every 5 minutes)
- Trade execution confirmations (per trade)
- Daily summary email/SMS/Telegram
- Alert on 3+ consecutive losses

## Trade Frequency Estimation

| Parameter | Conservative | Moderate | Aggressive |
|---|---|---|---|
| Avg spikes per day | 86 (24h × 3600s / 1000ticks × 2s) | 86 | 86 |
| Post-spike wait | 3 ticks | 2 ticks | 1 tick |
| Cooldown | 20 ticks | 10 ticks | 5 ticks |
| Duration | 20 ticks | 15 ticks | 10 ticks |
| Total cycle per trade | ~43 ticks | ~27 ticks | ~16 ticks |
| **Est. trades/day** | **~30-40** | **~50-60** | **~60-80** |

Conservative estimate: ~35 trades/day at 54% WR on $500 account with $2.50 stake.

## Daily P&L Projection

| WR | Stake | Trades | Expected P&L | 95% range |
|---|---|---|---|---|
| 53% | $2.50 | 35 | +$1.75 | -$5.25 to +$10.50 |
| 54% | $2.50 | 35 | +$3.50 | -$3.50 to +$12.25 |
| 55% | $2.50 | 35 | +$5.25 | -$1.75 to +$14.00 |
| 56% | $2.50 | 35 | +$7.00 | +$0.00 to +$15.75 |

## Operational Notes

- **Boom/Crash spike timing is independent of time of day** — unlike forex or stocks
- **No news events** — synthetic indices are isolated from real-world events
- **Deriv maintenance** — occasional scheduled downtime (rare, ~2-4 hours/year)
- **Updates to index parameters** — Deriv reserves the right to change index behavior
