# Deployment Architecture

## Reusing the Existing DIGITEVEN Bot

The current bot has a well-designed architecture that is mostly generic. Here's what to reuse vs. what to change.

## Component Reuse Analysis

| Component | Reuse? | Changes needed |
|---|---|---|
| WebSocketManager | ✅ Full reuse | None (abstract WS layer) |
| TradeExecutor | ✅ Full reuse | None (generic trade workflow) |
| ContractMonitor | ✅ Full reuse | None (generic contract tracking) |
| RiskManager | ✅ Full reuse | May need spike-specific limits |
| StakeManager | ✅ Full reuse | None (generic sizing) |
| SessionReporter | ✅ Full reuse | None (generic reporting) |
| HourlyTracker | ✅ Full reuse | None (generic tracking) |
| TradeAnalyzer | ✅ Full reuse | None (generic analysis) |
| index.js (REST API) | ✅ Full reuse | None (generic endpoints) |
| Frontend components | ✅ Full reuse | None (generic dashboard) |
| DigitAnalyzer | ❌ Replace | New Boom/Crash analyzer needed |
| Entry filter logic | ❌ New component | Strategy-specific entry rules |
| contract type config | ⚠️ Update | Change to Rise/Fall |
| duration config | ⚠️ Update | Change to 10-20 ticks |

## New Component: BoomCrashStrategy.js

```
// New file: backend/src/strategies/BoomCrashStrategy.js

Responsibilities:
- Receive tick stream from WebSocketManager
- Maintain rolling tick buffer (e.g., 200 ticks)
- Calculate technical indicators (RSI, Bollinger Bands, EMA, ROC)
- Score entry conditions using multi-filter scoring system
- Track drift direction and magnitude
- Generate trade signals (entry/exit)
- Manage position timing and cooldown
```

### Scoring Engine

Rather than relying on single signals (spike detected → enter), the strategy uses a **multi-filter scoring system**:

```
For each tick:
  1. Append to rolling buffer
  2. If buffer < minimum (30 ticks) → skip
  3. If in cooldown → skip
  4. Calculate: RSI(14), BB(20,2), EMA(5), EMA(20), ROC(5)
  5. Score drift-direction conditions:
     - RSI in favorable range
     - Price relative to Bollinger Bands
     - Short-term momentum (last 3 ticks)
     - Time since last spike
     - Price relative to EMAs
     - Rate of Change
  6. If score >= minThreshold AND score > opposing score → enter
  7. Place trade with fixed duration (5-20 ticks)
  8. Enter cooldown after trade resolves
```

### Input:
- Live ticks from subscribed index (BOOM1000 or CRASH1000)
- Current strategy state (collecting, scoring, in trade, cooldown)

### Output:
- Signal object: { action: 'enter' | 'skip', direction: 'CALL' | 'PUT', duration: 10, confidence: score }

## Architecture Diagram (New)

```
WebSocketManager
    ↕ (ticks)
BoomCrashStrategy  ←── Config (duration, threshold, indicator params)
    ├─ Rolling tick buffer (200 ticks)
    ├─ Indicator engine (RSI, BB, EMA, ROC)
    ├─ Scoring engine (multi-filter scoring)
    └─ Decision engine (threshold comparison, risk checks)
    ↕ (signals)
TradeExecutor  ←── RiskManager, StakeManager
    ↕ (contracts)
ContractMonitor → SQLite (trades.db)
    ↕ (results)
TradeAnalyzer, SessionReporter, HourlyTracker
    ↕ (data)
index.js (REST API) → Frontend
```

## Configuration Changes

```
# Existing, unchanged
API_TOKEN=...
WS_URL=...

# New Boom/Crash settings
ACTIVE_SYMBOL=CRASH1000        # or BOOM1000
CONTRACT_TYPE=RISE_FALL        # Rise/Fall (binary options only)
DIRECTION=CALL                 # CALL for Crash, PUT for Boom
DURATION_TICKS=10              # Contract duration in ticks
STAKE_MODE=fixed               # or percent
STAKE_AMOUNT=0.50

# Multi-filter scoring system (replaces simple spike threshold)
SCORE_THRESHOLD=5              # Minimum score to enter (0-10)
RSI_OVERSOLD=35                # RSI threshold for oversold
RSI_OVERBOUGHT=65              # RSI threshold for overbought
BB_PERIOD=20                   # Bollinger Band period
BB_STD_DEV=2                   # Bollinger Band standard deviations
EMA_SHORT=5                    # Short EMA period
EMA_LONG=20                    # Long EMA period
ROC_PERIOD=5                   # Rate of Change period
TICK_BUFFER_SIZE=200           # Rolling tick buffer

# Legacy settings (retained for backward compat)
SPIKE_THRESHOLD=50             # Points to identify a spike (informational)
POST_SPIKE_WAIT_TICKS=2        # Wait after spike before entering
TRADE_COOLDOWN_TICKS=10        # Wait after loss
DAILY_LOSS_LIMIT=0.10          # 10% of account
CONSECUTIVE_LOSS_LIMIT=3       # Stop after this many losses
```

## Risk Management Overrides

Boom/Crash introduces new risk parameters:

| Parameter | Default | Purpose |
|---|---|---|
| maxSpikeLossPerDay | 5 | Stop if spike losses exceed this count |
| postSpikePauseTicks | 50 | Pause after a spike in opposite direction |
| driftDegradationLimit | 25% | Stop if drift drops below historical baseline |
| emergencyDrawdownPercent | 15% | EMERGENCY_STOP trigger |

## Deployment Strategy

### Phase 1: Dry Run (1-2 weeks)
- Run on demo account
- Collect drift statistics
- Validate strategy logic
- No real money

### Phase 2: Paper Trading (2-4 weeks)
- Run on real market (small stakes)
- Track WR, variance, drawdown
- Compare to backtest expectations
- Fine-tune parameters

### Phase 3: Live with Training Wheels (4-8 weeks)
- $1.00 max stake
- 10% daily loss limit
- Close monitoring
- Weekend reviews

### Phase 4: Full Automation
- 24/7 operation
- Stake up to 0.5% of account
- Automated risk management
- Weekly performance reviews

## Monitoring & Alerts

| Alert | Trigger | Action |
|---|---|---|
| Spike cluster | 3+ spikes in 500 ticks | Reduce stake by 50% |
| Drift degradation | WR < 51% over 200 trades | Pause, investigate |
| Excessive drawdown | > 10% in a day | EMERGENCY_STOP |
| Connection loss | > 60s offline | Auto-reconnect |
| Strategy error | > 5 consecutive errors | Stop, notify |
