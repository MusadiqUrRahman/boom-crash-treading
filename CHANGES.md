# Change Log — P/L Accounting & Bot Reliability Fixes

> Started 2026-06-23. Tracks every code change made while fixing the balance-vs-bot
> P/L mismatch and the broader bug sweep. See `PNL_MISMATCH_REPORT.md`,
> `BACKEND_FIX_PLAN.md`, and `LIVE_SYSTEM_FIX_PLAN.md` for the why.

---

## 1. P/L is now sourced from Deriv, never fabricated

**`backend/src/trade-executor.js`**
- `_resolveContract()` now uses Deriv's authoritative `poc.profit` as the single
  source of P/L. Falls back to `sell_price - buy_price` only if `profit` is absent.
  If BOTH are absent it emits `exitReason:'UNRESOLVED'` with `pnl:null` instead of
  fabricating a loss. (Was: `sellPrice = parseFloat(poc.sell_price) || 0` → a missing
  sell price silently became a full-stake loss — the core bug.)
- `FORCE_RESOLVE_LOCAL` catch path no longer emits `pnl:-this.config.stake`. It now
  emits `UNRESOLVED` (null pnl) for the reconciliation script to settle. (This path
  produced the impossible −$2.00-on-$1-stake record, trade #228.)
- `FORCE_RESOLVE` no longer substitutes `sell_price: bid_price || 0`. It prefers
  `profit`, then `bid_price`, else UNRESOLVED — never 0.
- `_subscribeContract()` now receives and stores the ACTUAL trade stake & multiplier
  (was hardcoded to `this.config.stake`), so local SL math and fallbacks are correct.
- SL/TP setting is awaited; success/failure is logged loudly and emitted as an
  `slTpStatus` event (was silently discarded).

**`backend/src/contract-monitor.js`**
- `_resolveContract()` (tick/force path) no longer applies binary `win?+payout:-stake`
  P/L to MULTIPLIER contracts. Multipliers now emit `UNRESOLVED` (null pnl); only
  genuine fixed-duration BINARY (CALL/PUT) contracts keep binary resolution.
- `resolveContract()` preserves `derivProfit` and tolerates null pnl in logging.

**`backend/src/bot.js`**
- `_onContractResolved()` handles `UNRESOLVED`/null-pnl results: records the trade
  with `pnl:null, reconcileStatus:'PENDING'` and does NOT feed null into risk/stake
  accounting. Passes `derivProfit` through to the DB.
- `_onMultiplierResolved()` forwards `derivProfit`; logs (does not fabricate) when a
  resolved contract has no local mapping.
- Restored correct STALE-result handling in `_onTradeExecuted()`: an orphan buy that
  arrives after the ENTERING window expired is now SOLD, not silently adopted as a
  position. (Regression introduced by commit 29c3d9a.)
- Removed dead `_resolveDirection()` (never called; obsolete RSI logic). Real
  direction selection is `_evaluateTrade()` dual scoring.

## 2. Balance / risk accounting

**`backend/src/risk-manager.js`**
- `recordTrade()` no longer double-counts: when a live Deriv balance feed is active
  (`_liveBalanceActive` true, non-virtual), the live feed owns `currentBalance` and
  pnl is only added to daily stats — not to balance again. Virtual/test mode still
  accumulates locally. Guards against non-finite pnl.
- `setRealBalance()` / `updateLiveBalance()` set `_liveBalanceActive = true`.

## 3. Data integrity

**`backend/src/trade-logger.js`**
- Migration adds columns: `deriv_profit`, `original_exit_reason`, `reconcile_status`,
  `flagged_pnl`.
- `logTrade()` flags `flagged_pnl=1` and logs an error when `|pnl| > stake` on a
  multiplier (mathematically impossible — fabrication detector). Records `deriv_profit`
  and `reconcile_status`.

## 4. Robustness

**`backend/src/bot.js`**
- `updateConfig()` now propagates config to `tradeExecutor` and `contractMonitor`
  (SL/TP/stake changes from the UI previously never reached the executor).
- State watchdog no longer force-restarts during `IN_POSITION`, `DISCONNECTED`,
  `CONNECTING`, or shutdown states (a live multiplier can legitimately run minutes).

## 5. Tests
- Updated `contract-monitor.test.js` to assert UNRESOLVED for multipliers and added
  genuine binary-contract coverage.
- Updated `trade-executor.test.js` reconnect assertion for new `_subscribeContract`
  signature.
- Removed obsolete `_resolveDirection` test block.
- **Full suite: 322 passed, 11 suites.**

---

## Pending (in progress)
- Config/.env default alignment (#12)
- daily-report real balances + frontend P/L display (#13)
- `scripts/reconcile-deriv.js` backfill + reconciliation tool (#11)
