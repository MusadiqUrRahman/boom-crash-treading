# Failure Modes

## Complete Catalog of What Can Go Wrong

This document catalogs every failure mode for the Boom/Crash automated trading system, with probability, impact, and mitigation.

## Category 1: Strategy Failure

### FM-01: Drift Weakens or Disappears
**Probability:** Medium (20-30% chance over 12 months)
**Impact:** Critical (strategy becomes unprofitable)
**Detection:** Rolling 200-trade WR < 51%
**Response:** EMERGENCY_STOP, manual review
**Mitigation:** Monitor drift quality weekly, use conservative WR expectations

### FM-02: Spike Frequency Increases
**Probability:** Low (5-10%)
**Impact:** High (more trades hit by spikes)
**Detection:** Spikes/day > 130 (50% above expected)
**Response:** Reduce duration from 20 to 10 ticks
**Mitigation:** Use short durations by default, expect variance

### FM-03: Spike Magnitude Increases
**Probability:** Low (5-10%)
**Impact:** High (larger adverse moves)
**Detection:** Average spike size > 2× historical
**Response:** Reduce stake 50%, shorter durations
**Mitigation:** Fixed stake (never percentage if magnitude increases)

### FM-04: Contract Payout Changes
**Probability:** Low (Deriv changes payout rates)
**Impact:** Medium (lower expectancy)
**Detection:** Payout < 80% on Rise/Fall
**Response:** Recalculate viability; may need to stop
**Mitigation:** Use conservative payout estimates (80-85%)

## Category 2: Execution Failure

### FM-05: Tick Gap (Missed Ticks)
**Probability:** Medium (common in WS reconnections)
**Impact:** Medium (may miss spike detection)
**Detection:** Tick sequence number gap
**Response:** Fill from recent history if available; skip trade if gap > 3 ticks
**Mitigation:** Multiple tick sources, gap detection

### FM-06: Trade Submission Failure
**Probability:** Low (< 1% of trades)
**Impact:** Low (miss one trade)
**Detection:** API response error
**Response:** Retry once; if still fails, skip and log
**Mitigation:** Timeout and retry logic

### FM-07: Contract Confirmation Timeout
**Probability:** Low (< 1%)
**Impact:** Medium (contract in flight, status unknown)
**Detection:** No confirmation within 10s
**Response:** Mark as unknown, check via API after timeout
**Mitigation:** Poll contract status after submission

### FM-08: WebSocket Disconnection
**Probability:** Medium (varies by network)
**Impact:** Low-Medium (missed ticks during downtime)
**Detection:** WS close/error event
**Response:** Auto-reconnect, re-subscribe, check for missed ticks
**Mitigation:** Exponential backoff reconnection (existing)

## Category 3: System Failure

### FM-09: Server Down
**Probability:** Low (depends on hosting)
**Impact:** High (complete trading halt)
**Detection:** Health check fails
**Response:** Restart server, verify state
**Mitigation:** Cloud hosting with auto-restart, monitoring

### FM-10: Process Crash
**Probability:** Low (< 1/month in stable code)
**Impact:** Medium (trading stops until restart)
**Detection:** Process exit
**Response:** Auto-restart via PM2/systemd
**Mitigation:** PM2 process management, crash logging

### FM-11: Memory Leak
**Probability:** Low (well-tested bot)
**Impact:** Medium (gradual performance degradation)
**Detection:** Memory monitoring, process restart threshold
**Response:** Restart process
**Mitigation:** Regular restart (daily), memory monitoring

### FM-12: Database Corruption
**Probability:** Very low (SQLite is robust)
**Impact:** Medium (loss of trade history)
**Detection:** SQLite error on write
**Response:** Back up and restore from last good copy
**Mitigation:** Daily database backups, WAL mode

## Category 4: External Failure

### FM-13: Deriv API Changes
**Probability:** Low (rare, but breaking changes possible)
**Impact:** Critical (bot stops working)
**Detection:** Unexpected API response format
**Response:** Stop trading, update integration
**Mitigation:** Version-pinned API, monitor Deriv changelog

### FM-14: Deriv Server Issues
**Probability:** Very low (Deriv is reliable)
**Impact:** High (trading impossible)
**Detection:** Connection refused, timeout
**Response:** Exponential backoff, alert operator
**Mitigation:** No local mitigation; Deriv SLAs

### FM-15: Account Issues (Invalid Token, Insufficient Balance)
**Probability:** Low (operator error)
**Impact:** High (no trading)
**Detection:** API error on auth or insufficient funds
**Response:** EMERGENCY_STOP, notify operator
**Mitigation:** Balance monitoring, token validation on startup

### FM-16: Network Issues
**Probability:** Low (depends on hosting)
**Impact:** Medium (intermittent connectivity)
**Detection:** High latency, connection drops
**Response:** Increase timeout, reconnect
**Mitigation**: Reliable hosting provider

## Failure Mode Matrix

| ID | Name | Prob | Impact | RPN | Mitigation cost |
|---|---|---|---|---|---|
| FM-01 | Drift weakens | Medium | Critical | 8 | Monitoring only |
| FM-02 | Spike freq up | Low | High | 6 | Reduce duration |
| FM-03 | Spike size up | Low | High | 6 | Fixed stake |
| FM-04 | Payout changes | Low | Medium | 4 | Conservative estimates |
| FM-05 | Tick gap | Medium | Medium | 5 | Gap detection |
| FM-06 | Trade submit fail | Low | Low | 2 | Retry logic |
| FM-07 | Confirm timeout | Low | Medium | 3 | Poll contract |
| FM-08 | WS disconnect | Medium | Low | 4 | Auto-reconnect |
| FM-09 | Server down | Low | High | 5 | Cloud hosting |
| FM-10 | Process crash | Low | Medium | 3 | PM2 |
| FM-11 | Memory leak | Low | Medium | 3 | Monitoring |
| FM-12 | DB corruption | Very low | Medium | 2 | Backups |
| FM-13 | API changes | Low | Critical | 6 | Version pinning |
| FM-14 | Deriv down | Very low | High | 4 | No mitigation |
| FM-15 | Account issues | Low | High | 5 | Validation |
| FM-16 | Network issues | Low | Medium | 3 | Reliable hosting |

RPN = Risk Priority Number (1-10, higher = worse)

## Automated Recovery Summary

### Can auto-recover:
- WS disconnection (FM-08)
- Process crash (FM-10)
- Trade submission failure (FM-06)
- Contract confirmation timeout (FM-07)
- Tick gap (FM-05)

### Manual intervention needed:
- Drift degradation (FM-01)
- API changes (FM-13)
- Account issues (FM-15)
- Database corruption (FM-12)
- Spike frequency/magnitude changes (FM-02, FM-03)
