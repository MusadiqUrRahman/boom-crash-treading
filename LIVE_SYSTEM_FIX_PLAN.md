# Live System Fix Plan — Backfill & Reconciliation

> **Date:** 2026-06-23
> **Scope:** the running/live system and its historical data in `backend/data/live_trades.db` + `backend/reports/daily/`
> **Companion:** `BACKEND_FIX_PLAN.md` (the code fixes that stop new bad data being written)

---

## Context — why this work is being done

The bot's local trade database disagrees with the Deriv account in two ways:
1. **Wrong P/L** on ~8 of today's 25 trades (fabricated losses on `TICK_RESOLVED` / `FORCE_RESOLVE*` / `ALREADY_SOLD` paths). Deriv says **+$5.51 profit today**; the DB says **−$5.51**.
2. **Missing trades** — Deriv shows **33** closed positions today, the DB has **25**. ~8 real trades (including a +$0.94 winner) were never recorded because the bot stopped writing after 06:42 GMT while it kept trading.

The backend code fixes prevent *future* bad data. This plan repairs the *existing* data and the live account view so the historical record matches Deriv, and gives the user a repeatable reconciliation tool.

Deriv exposes the authoritative history via the **`profit_table`** API call (closed positions with `buy_price`, `sell_price`, and **`sell_profit`/`profit`**) and **`statement`** (ledger of balance changes). The bot already has an authenticated WebSocket client (`deriv-client.js`, new API/OTP mode) capable of issuing these calls. We will reuse it.

---

## Goals

1. **Pull** the true closed-position history from Deriv for the affected dates.
2. **Reconcile** every DB trade against Deriv's `profit` by `contract_id`; correct wrong `pnl`/`win`/`balance_after`.
3. **Backfill** trades that exist on Deriv but are missing from the DB.
4. **Regenerate** the daily report JSON/TXT files from corrected data.
5. **Verify** `Σ DB pnl` per day == Deriv `profit_table` totals.
6. Make this a **repeatable script** the user can run any time (`npm run reconcile`).

---

## Approach

### Step 1 — New script: `backend/scripts/reconcile-deriv.js`
A standalone Node script that:
1. Loads config (`config.js`), opens `live_trades.db` (read-write).
2. Connects via the existing `ConnectionManager`/`DerivClient` (new API mode, OTP) — same auth path the bot uses, so no new credentials.
3. Calls Deriv `profit_table`:
   ```js
   api.send({ profit_table: 1, description: 1, limit: 500,
              date_from: <epoch start>, date_to: <epoch end>, sort: 'ASC' })
   ```
   Response rows include: `contract_id`, `buy_price`, `sell_price`, `sell_time`, `purchase_time`, `payout`, and **`profit` / `sell_profit`** (Deriv's net P/L), plus `shortcode`/`contract_type`.
4. Calls Deriv `statement` (optional cross-check) for balance ledger:
   ```js
   api.send({ statement: 1, limit: 500, date_from, date_to })
   ```
5. Builds a map `contractId → { profit, buyPrice, sellPrice, sellTime, contractType }`.

### Step 2 — Reconcile existing rows
For each DB trade with a `contract_id` in the affected window:
- If found in Deriv map: set `pnl = deriv.profit`, `win = deriv.profit > 0`, `exit_price = deriv.sell_price`, `entry_price = deriv.buy_price` (if missing), and `exit_reason = 'RECONCILED'` (preserve original in a new `original_exit_reason` column). Set `deriv_profit = deriv.profit`.
- If NOT found (e.g. local-only phantom): flag `reconcile_status = 'NOT_ON_DERIV'` for manual review — do not delete automatically (safety).

### Step 3 — Backfill missing trades
For each Deriv `profit_table` row whose `contract_id` is NOT in the DB:
- Insert a new `trades` row using `trade-logger`'s schema, populated entirely from Deriv data: `pnl = profit`, `win = profit>0`, `stake = buy_price`, `entry_price = buy_price`, `exit_price = sell_price`, `entry_epoch = purchase_time`, `exit_epoch = sell_time`, `contract_type` from shortcode, `exit_reason = 'BACKFILLED'`, `dry_run = 0`.
- `balance_after`: recompute the running balance for the day from the Deriv statement (or leave null and recompute in Step 4).

### Step 4 — Recompute `balance_after` chain
After reconcile + backfill, recompute each day's `balance_after` as a running total anchored to the day's opening balance from Deriv's `statement` (or the prior day's close), so the column is internally consistent and matches Deriv's end-of-day balance.

### Step 5 — Regenerate reports
Run the (Part D-fixed) `scripts/daily-report.js --all` to rewrite `reports/daily/*.json` and `*.txt` from corrected data, with real start/end balances.

### Step 6 — Verify
- Assert per-day `Σ pnl == Σ deriv_profit` (within $0.01).
- Assert no row has `|pnl| > stake` for a multiplier.
- Print a reconciliation summary: rows corrected, rows backfilled, rows flagged, per-day before/after totals.
- Specifically confirm **today: DB total flips from −$5.51 to ≈ +$5.51, count 25 → 33.**

---

## Safety

- **Backup first:** copy `live_trades.db` → `live_trades.db.bak-<date>` before any write (script does this automatically; refuses to run if backup fails). There is already a precedent file `live_trades_bak_before_rework.db`.
- **Dry-run mode:** `node scripts/reconcile-deriv.js --dry-run` prints the diff (what it WOULD change) without writing. Default is dry-run; `--apply` required to write.
- **Idempotent:** re-running yields no further changes once reconciled (matches by `contract_id`).
- **Never auto-delete** local rows not found on Deriv — only flag.
- **Schema additions** (`deriv_profit`, `original_exit_reason`, `reconcile_status`, `flagged_pnl`) are added via the existing migration pattern in `trade-logger.js:_runMigrations`.

---

## New files / changes

| File | Purpose |
|------|---------|
| `backend/scripts/reconcile-deriv.js` | **new** — pull `profit_table`/`statement`, reconcile, backfill, verify |
| `backend/src/trade-logger.js` | migration: add `deriv_profit`, `original_exit_reason`, `reconcile_status`, `flagged_pnl` |
| `backend/scripts/daily-report.js` | use real balances (also in BACKEND plan D1) |
| `backend/package.json` | add `"reconcile": "node scripts/reconcile-deriv.js"` script |
| `backend/reports/daily/*.json,*.txt` | regenerated outputs |

---

## Verification (end-to-end)

1. `node scripts/reconcile-deriv.js --dry-run` → review printed diff; confirm today shows ~8 corrections + ~8 backfills and a sign flip to +$5.51.
2. `node scripts/reconcile-deriv.js --apply` → writes after auto-backup.
3. `node -e` spot check: `SELECT SUM(pnl) FROM trades WHERE DATE(created_at,'localtime')='2026-06-22'` → ≈ **+5.51**; `COUNT(*)` → **33**.
4. `npm run report -- --all` (or `node scripts/daily-report.js --all`) → open `reports/daily/2026-06-22-*.json`, confirm totals match Deriv and start/end balances are real.
5. Cross-check against the Deriv platform "Closed positions / Today / Total P/L".

---

## Order of operations (relative to backend plan)
Backend **Part A** must land first (so the migration columns exist and no new bad rows are written). Then run this reconciliation. Then regenerate reports. Then resume live trading with the fixed code.
