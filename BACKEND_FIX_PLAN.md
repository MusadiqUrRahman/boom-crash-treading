# Backend Fix Plan — Boom/Crash Trading Bot

> **Date:** 2026-06-23
> **Author:** System audit + implementation
> **Scope:** `backend/` source, config, reporting, tests
> **Companion docs:** `PNL_MISMATCH_REPORT.md` (the bug that triggered this), `LIVE_SYSTEM_FIX_PLAN.md` (data backfill/reconciliation)

---

## Context — why this work is being done

The user observed their Deriv account balance rising (+$5.51 today) while the bot's dashboard reported a loss (−$5.51). Investigation (see `PNL_MISMATCH_REPORT.md`) proved the bot **fabricates P/L** whenever it loses clean confirmation of a contract's outcome from Deriv, instead of reading Deriv's authoritative `profit` field. The DB even contains a **mathematically impossible** record (trade #228: −$2.00 loss on a $1 stake on a multiplier, where max loss = stake). The bot also stopped logging trades partway through the session (25 logged vs 33 on Deriv).

This plan fixes the **accounting layer** (single source of P/L truth = Deriv), then sweeps the rest of the backend for every correctness, reliability, config, and reporting bug found during the audit. The goal: the bot's numbers must always equal Deriv's, and unprotected/fabricated code paths must be removed.

The authoritative data source is confirmed: the bot runs Deriv's **new API mode** (`DERIV_API_MODE=new`, `deriv-client.js`), an OTP-authenticated WebSocket. `proposal_open_contract` and `sell` responses both carry `profit`, `sell_price`, `buy_price`, `is_sold`, and `bid_price`. We will use `profit` as the single source of P/L.

---

## Principles

1. **Deriv is the only source of P/L and balance.** The bot must never compute a P/L number for the trade ledger. It records what Deriv reports (`profit`). Local formulas (`_computePnL`) are allowed ONLY for live in-flight SL/TP display, never for the recorded outcome.
2. **Never fabricate an outcome.** If the real outcome is unknown, the trade is `PENDING`/`UNKNOWN` and reconciled later from Deriv — not guessed as a loss.
3. **Impossible numbers are rejected.** `|pnl| > stake` for a multiplier is impossible → assert/flag.
4. **Fail loud, not silent.** Swallowed errors (SL/TP set failures, sell failures) must surface.

---

## Part A — P/L accounting (CRITICAL, root cause)

### A1. Record Deriv's `profit` as the single P/L — `trade-executor.js:_resolveContract` (~:322)
Currently: `pnl = sellPrice − buyPrice`, where `sellPrice = parseFloat(poc.sell_price) || 0`. The `|| 0` is the bug — a missing `sell_price` becomes a full-stake fake loss.
**Fix:** Prefer `poc.profit` (Deriv's authoritative net P/L). Compute as:
```
const profit = (poc.profit !== undefined && poc.profit !== null) ? parseFloat(poc.profit)
             : (Number.isFinite(parseFloat(poc.sell_price)) ? parseFloat(poc.sell_price) - buyPrice : null);
```
If `profit` is `null` (no Deriv data at all), emit `win:null, pnl:null, exitReason:'UNRESOLVED'` and DO NOT write a fabricated loss. `win = profit > 0`.

### A2. Delete the fabricated-loss fallback — `trade-executor.js:462-483` (`FORCE_RESOLVE_LOCAL`)
Currently emits `win:false, pnl:-this.config.stake`. This is the impossible-number source.
**Fix:** Remove the hard-coded loss. Instead emit an `UNRESOLVED` marker (no pnl) and leave the contract for the reconciliation script to settle from Deriv's `profit_table`. Log an error so it's visible.

### A3. Remove binary-options math from the multiplier monitor — `contract-monitor.js:96-133` (`TICK_RESOLVED`)
`_resolveContract` uses `pnl = win ? stake*payoutRate : -stake` — binary logic on a multiplier. Multiplier contracts never expire by tick count; this path should not resolve P/L at all.
**Fix:** For multiplier contracts (`hasFixedDuration` false), the tick monitor must NOT compute P/L. The real resolution comes only from `tradeExecutor` (Deriv stream/sell). Gate `_resolveContract`'s P/L path so it never fabricates; if forced, mark `UNRESOLVED`.

### A4. `FORCE_RESOLVE` zero-price guard — `trade-executor.js:454-456`
`sell_price: poc.bid_price || 0` → can record 0. **Fix:** use `poc.profit` if present; else if `bid_price` present use it; else `UNRESOLVED`.

### A5. Sanity guard on write — `trade-logger.js:logTrade` (~:174)
**Fix:** if `record.multiplier` set and `Math.abs(record.pnl) > record.stake + epsilon`, clamp to `-stake`/`+`… NO — do not clamp silently. Log an error and store a `flagged_pnl=1` column (new migration) so it's auditable, and store Deriv's value if available. At minimum: `logger.error` + still record, so it's visible in reconciliation.

### A6. `balance_after` provenance — `bot.js:_onContractResolved` (:633)
`balanceAfter: this.riskManager.currentBalance`. After A-series fixes, `riskManager.currentBalance` is overwritten by the live Deriv balance feed (`updateLiveBalance`). Keep that, but ALSO record Deriv's per-trade `profit` so the two can be cross-checked. Add `deriv_profit` column (migration) alongside `pnl`.

---

## Part B — Resolution reliability (stop trades falling into fallback paths)

### B1. Reliably parse the sell response — `trade-executor.js:sellContract` (~:378-485)
The multi-fallback spaghetti misses `sold_for`/`sold_contract`. Simplify to: send sell → if `resp.sell.sold_for` present, resolve from `resp.sell.sold_contract` (which contains `profit`); else query `proposal_open_contract` once and resolve from its `profit` if `is_sold`. Only if both fail → `UNRESOLVED` (not a loss).

### B2. SL/TP must be awaited + retried — `trade-executor.js:166` & `_setStopLossTakeProfit:192`
`executeTrade` calls `_setStopLossTakeProfit` without `await`. The method already has a 3× retry loop (good), but the result is discarded. **Fix:** `await` it, log success/failure clearly, and emit an event so the dashboard can show SL/TP status. (Don't block the buy on it, but confirm and surface.)

### B3. Stop-loss grace window — `trade-executor.js:258` & `:359`
`if (entry.openedAt && Date.now() - entry.openedAt < 1000) return;` — currently 1000ms (already reduced from the 10s the old analysis flagged). Confirm it stays at ≤1000ms. `MIN_HOLD_MS` (:386) is 500ms — acceptable. Document these as intentional.

### B4. `_subscribeContract` uses `this.config.stake`/`multiplier` not the actual trade's — `trade-executor.js:225`
The entry stores `stake: this.config.stake` but the trade may have used `customStake`. This corrupts `_computePnL` SL math and any local fallback. **Fix:** pass the actual `effectiveStake` and multiplier into `_subscribeContract`.

---

## Part C — Config & .env correctness

### C1. `updateConfig` skips tradeExecutor — `bot.js:761-784`
Every subsystem is refreshed except `tradeExecutor`, so SL/TP/stake changes from the UI never reach it. **Fix:** add `if (this.tradeExecutor) this.tradeExecutor.config = this.config;`.

### C2. config.js default mismatches — `config.js`
- `maxAcceptableLoss` default `0.50` (:126) but `.env` MAX_ACCEPTABLE_LOSS=2.00 — env wins, OK, but align the default comment.
- `baseStake` default `0.50` (:107) vs `.env` BASE_STAKE=1.00 — env wins; align default to avoid confusion.
- `maxPositionSize` default `2.00` (:94) vs `.env` MAX_POSITION_SIZE=5.00.
- `durationTicks` default `10` but `.env`=5; and it's passed as `0` into `startContract` (bot.js:574) deliberately (multiplier = open-ended). Document that `DURATION_TICKS` is **dead** for multipliers.
**Fix:** make config.js defaults match the `.env` template; add comments marking multiplier-irrelevant params.

### C3. Dead parameters — `.env`
- `TRAIL_DISTANCE` (:41) — referenced in `trade-executor.js:225` (`entry.trailDistance`) and the trailing-stop block (:276) actually IS wired now. Confirm it's live; if so the old "dead" claim is stale — document as active.
- `PAYOUT_RATE`, `DURATION_TICKS`, `MIN_TICKS_BEFORE_TRADE` vs actual — audit each, mark dead ones in `.env` comments.

### C4. Secrets — `.env` contains a live `API_TOKEN`
Flag (do not commit). Recommend `.env` is git-ignored; verify. Document rotation guidance. (No code change; safety note.)

---

## Part D — Reporting correctness

### D1. daily-report startBalance=0 — `scripts/daily-report.js:53-58`
`account.startBalance: 0`, `endBalance: totalPnL` — mislabels cumulative P/L as "balance". And `totalPnL` is the sum of the (previously fabricated) `pnl`. After Part A, `pnl` is correct, but the report still mislabels. **Fix:** compute `startBalance`/`endBalance` from the first/last `balance_after` of the day; keep `totalPnL` as Σpnl; add a `derivProfit` total for cross-check.

### D2. Regenerate historical reports — covered in `LIVE_SYSTEM_FIX_PLAN.md` (run after backfill).

---

## Part E — Robustness / smaller bugs found

- **`bot.js:_onContractResolved`** runs `riskManager.recordTrade(result)` which *adds* `result.pnl` to `currentBalance` (risk-manager.js:88) — but `currentBalance` is ALSO overwritten by the live balance feed. Double-counting risk. **Fix:** in `recordTrade`, track `dailyPnL`/stats from Deriv profit, but let the live balance feed own `currentBalance` (don't `+= pnl` when a live feed is active / `virtualBalance==0`).
- **`risk-manager.js:restoreFromDb`** sets `currentBalance = startingBalance + netPnl` using the (previously fabricated) DB netPnl. After Part A this is correct; still, prefer the live API balance on `authorized`.
- **`bot.js` state watchdog** (`:264`) force-exits the process on 60s stuck — fine, but ensure it can't fire during a legitimate long `IN_POSITION`. Confirm `IN_POSITION` is excluded (it returns early at :296 before the watchdog? No — watchdog is at top of `_onTick`). **Fix:** exclude `IN_POSITION` from the stuck-state watchdog.
- **`ws-server.js:sellContract` handler** returns `success` based on `!stillOpen`, but after Part B an `UNRESOLVED` contract is removed from streams too. **Fix:** return the actual resolved outcome + pnl.

---

## Files to modify

| File | Changes |
|------|---------|
| `backend/src/trade-executor.js` | A1, A2, A4, B1, B2, B4 — core P/L + resolution rewrite |
| `backend/src/contract-monitor.js` | A3 — no fabricated tick P/L |
| `backend/src/trade-logger.js` | A5, A6 — sanity guard, `deriv_profit`/`flagged_pnl` columns + migration |
| `backend/src/bot.js` | C1, E — updateConfig, double-count, watchdog |
| `backend/src/risk-manager.js` | A6, E — balance ownership |
| `backend/config.js` | C2 — default alignment |
| `backend/.env` | C2, C3, C4 — comments, dead-param marks (no secret change) |
| `backend/scripts/daily-report.js` | D1 — real balance fields |
| `backend/ws-server.js` | E — sell handler returns real outcome |

---

## Verification

1. **Unit tests:** `npm test` (jest). Existing suites cover trade-executor, contract-monitor, risk-manager, etc. Update tests for new resolution semantics; add tests:
   - `_resolveContract` uses `poc.profit` and never returns `pnl=-stake` when `sell_price` missing.
   - `contract-monitor` never fabricates P/L for open-ended (multiplier) contracts.
   - `|pnl| > stake` triggers the sanity guard.
2. **Static sanity:** query the DB after a dry-run session and assert no row has `|pnl| > stake` for a multiplier.
3. **Live smoke (demo):** run `npm run live` against the demo account for a short window; confirm each recorded `pnl` equals Deriv's `profit` for the same contract id (cross-check via the backfill script's `profit_table` pull).
4. **Reconciliation:** after `LIVE_SYSTEM_FIX_PLAN` backfill, `Σ recorded pnl (today)` must equal Deriv's "Today Total P/L" within rounding.

---

## Rollout order
Part A → B → (test) → C → D → E → full `npm test` → live demo smoke → reconcile. Each part is committed separately with notes appended to `CHANGES.md`.
