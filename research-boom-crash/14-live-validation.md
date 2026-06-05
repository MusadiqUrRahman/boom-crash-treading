# Live Validation Protocol

## Before Going Live

### Prerequisites
- [ ] 3+ months of backtest data with > 1000 simulated trades
- [ ] Walk-forward analysis shows consistent results
- [ ] Out-of-sample test passes at p < 0.01
- [ ] Max drawdown in backtest < 15%
- [ ] Profit factor > 1.2
- [ ] Strategy has < 3 tunable parameters

## Phase 1: Paper Trading (2-4 weeks)

### Setup
- Use Deriv demo account
- Run bot in paper mode (track trades without real execution)
- Record every signal and outcome

### Validation Metrics
| Metric | Target | Minimum acceptable |
|---|---|---|
| Trades | > 200 | > 100 |
| Win rate | Within 2% of backtest | Within 5% |
| Max consecutive losses | < 10 | < 15 |
| Average drift per tick | Within 25% of expected | Within 50% |
| Spike frequency | Consistent with expected λ | Within factor of 2 |

### Decision Gate
- **Pass:** All metrics within acceptable range → proceed to Phase 2
- **Fail:** WR > 3% below backtest → investigate, revise, re-backtest
- **Uncertain:** Extend paper trading by 2 weeks

## Phase 2: Micro-Live (2-4 weeks)

### Setup
- Fund account with $50 minimum (real money)
- Stake: $0.10-0.25 (minimum allowed)
- Daily loss limit: $2
- Manual monitoring required

### Focus Areas
1. **Execution quality:** Does the bot get the expected fills?
2. **Latency:** Is tick-to-decision time acceptable?
3. **Deriv API behavior:** Any unexpected responses?
4. **P&L consistency:** Matches paper trading?

### Decision Gate
- **Pass:** After 200+ trades, WR within 3% of backtest, profit positive → proceed to Phase 3
- **Fail:** Significant deviation → return to paper trading or revise strategy
- **Caution:** Profitable but with high variance → extend micro-live

## Phase 3: Reduced-Scale Live (4-8 weeks)

### Setup
- Account: $300 minimum
- Stake: 0.5% of account
- Daily loss limit: 10%
- Weekly loss limit: 15%

### Monitoring Cadence
| Aspect | Frequency | Action on alarm |
|---|---|---|
| Win rate | Daily | Compare to backtest expected range |
| Drawdown | Daily | Stop if > 10% in one day |
| Spike frequency | Daily | Check λ estimate |
| Drift quality | Weekly | Rolling 200-trade WR |
| Overall P&L | Weekly | Review against targets |

### Decision Gate
- **Pass:** 8 weeks profitable, max drawdown < 10%, WR stable → consider full automation
- **Fail:** Multiple stop days, WR trending down → return to research
- **Conditional pass:** Profitable but volatile → increase risk management strictness

## Phase 4: Full Automation

### Requirements
- 3+ months of consistent live profitability
- Automated risk management proven in live conditions
- Emergency stop tested and verified
- Monitoring alerts configured
- Recovery procedures documented

### Final Verification
- Run 24/7 for 2 weeks with full automation
- Check all edge cases (connection loss, API errors, spike clusters)
- Verify performance in different market conditions
- Validate drawdown recovery

## Metrics Dashboard

```
LIVE VALIDATION DASHBOARD
======================
Account:      $500.00
Today:        +$2.34 (+0.47%)
This week:    +$8.12 (+1.62%)
This month:   +$35.80 (+7.16%)
Max DD (30d): -$22.50 (-4.50%)

Win rate:     54.3% (543/1000)
Avg payout:   86.2%
Profit factor: 1.38
Sharpe:       1.15

Status:       ✅ TRADING (Phase 3)
Next review:  2026-06-10
```

## Abort Criteria

Abort and halt all trading if:

1. **WR drops below 50%** over 200 trades — edge lost
2. **Drawdown exceeds 20%** in a single week — risk management failure
3. **3+ consecutive daily loss days** > 5% each — something is wrong
4. **Deriv API changes** break the strategy — need to adapt
5. **More than 10 spikes** in a single trading session — abnormal conditions
