# Why Your Account Balance and the Bot's P/L Disagree

> **Date:** 2026-06-22
> **Scope:** Live demo account, BOOM1000, stake $1, multiplier 500, `DRY_RUN=false`
> **Ground truth:** Deriv platform → **balance $9,991.83**, **Today Total P/L = +$5.51 profit**, **33 closed positions**.
> **Bot database:** 25 trades, sum = **−$5.51 loss**, last recorded balance $9,981.38.
>
> **Verdict:** Deriv is right. **You ARE in profit today (+$5.51).** The bot is **fabricating losses that never happened** and is **missing 8 trades** entirely. The bot's P/L is fiction; the account balance is fact.

---

## ⚠️ Correction to my first version of this report

My first pass concluded "trust the balance — the account is really *down* ~$5." **That was wrong**, and your Deriv screenshot proves it. The account is **UP +$5.51**. I had assumed the `balance_after` column was a faithful live feed from Deriv; in fact the bot stopped logging trades at 06:42 GMT while continuing to trade, so even that column is stale and incomplete. The corrected analysis is below. The *mechanism* I found (bot computes its own P/L instead of reading Deriv's) was correct — but its effect is the **opposite** of what I first said: it invents **losses**, not phantom gains.

---

## 1. The one-sentence answer

**Deriv pays you the real profit on each contract (your balance goes UP). The bot, whenever it loses track of a contract, throws away Deriv's real number and writes a made-up loss into its own database. So the dashboard shows "today's loss ≈ −$5" while your actual account is up +$5.51. The bot's loss is imaginary.**

---

## 2. The decisive proof: an impossible number

Trade **#228** in the bot's database:

```
stake = $1.00   |   recorded pnl = −$2.00   |   exit_reason = FORCE_RESOLVE_LOCAL
```

On a multiplier contract **you cannot lose more than your stake.** A −$2.00 loss on a $1 stake is **mathematically impossible** on Deriv. This number did not come from Deriv — it was **fabricated by the bot's code**. Specifically `trade-executor.js:471`, which hard-codes `pnl: -this.config.stake` and (because the config stake is $2 while the trade actually used $1) writes −$2 as a "total loss" for a trade that, on Deriv, was a real position with a real — and likely positive — outcome.

That single line is the clearest evidence that the bot's P/L is invented, not measured.

---

## 3. Where the −$5.51 vs +$5.51 comes from

I split today's 25 logged trades into two groups by how they closed:

| Group | How it closed | # | Bot's recorded P/L |
|-------|---------------|--:|-------------------:|
| **Real** (`MANUAL_SELL_SOLD` — bot actually read Deriv's `sold_for`) | genuine sell price | 17 | **−$0.51** |
| **Fabricated** (`TICK_RESOLVED`, `FORCE_RESOLVE`, `FORCE_RESOLVE_LOCAL`, `ALREADY_SOLD`) | bot guessed | 8 | **−$5.00** |
| | | | **−$5.51 total** |

**The entire "loss" is concentrated in the 8 fabricated trades (−$5.00).** These are the trades where the bot never got a clean confirmation from Deriv and so **made up a number** — almost always a loss, often a full-stake loss:

- `FORCE_RESOLVE_LOCAL` → hard-codes `−stake` (the impossible −$2 above)
- `TICK_RESOLVED` → binary-options math (`−stake` on "loss"), wrong model for a multiplier — recorded **two −$1.00 full losses**
- `FORCE_RESOLVE` → uses `bid_price or 0` as sell price → near-total fake loss
- `ALREADY_SOLD` → Deriv closed it, bot missed the event, guessed **−$0.25 each**

On Deriv, those same 8 contracts settled at their **real** prices and, combined with the rest, the day nets to **+$5.51 profit**. The bot booked them as −$5.00 of losses. That sign flip is your entire mystery.

---

## 4. The bot is also missing 8 trades

- Deriv: **33** closed positions today.
- Bot DB: **25** trades (last one 06:42 GMT).
- The bot kept running until ~07:25 GMT (logs confirm) but **stopped writing trades to the database after 06:42**.

So 8 real trades — including winners like the **+$0.94** position visible at the top of your screenshot — **never made it into the bot's records at all**. The bot's "today" view is both *wrong-signed* and *incomplete*.

---

## 5. Root cause — two P/L pipelines, never reconciled

### Pipeline A — Deriv (TRUTH)
Deriv settles every multiplier contract and credits/debits your balance with the **real** profit. Your balance — $9,991.83, up +$5.51 today — is this number. It already includes every fee and the true outcome of all 33 contracts. **Always correct.**

### Pipeline B — the bot's local guess (FICTION)
When a contract closes, the bot tries to compute P/L itself instead of trusting Deriv. It has **four** formulas and picks one based on *how* the close was detected:

| Close path | File:line | Formula | Failure mode |
|-----------|-----------|---------|--------------|
| Clean Deriv sell | `trade-executor.js:330` | `sell_price − buy_price` | fine — but only when `sold_for` is parsed |
| Force-resolve | `trade-executor.js:455` | `bid_price ‖ 0` | uses `0` → fake full loss |
| Local force-resolve | `trade-executor.js:471` | **hard-coded `−stake`** | **always a fake total loss** (the impossible −$2) |
| Tick expiry | `contract-monitor.js:107` | `win ? stake×rate : −stake` | binary math on a multiplier — meaningless |

The dashboard's "today's P/L" is `Σ pnl` over Pipeline B (`ws-server.js:488`). So whenever a contract slips into a fallback path, the dashboard absorbs a **fabricated loss** while your real balance rises from Deriv's **real** settlement. The two are never cross-checked.

### Why the resolution keeps failing into fallback paths
The bot only computes a *correct* P/L when it cleanly reads Deriv's `is_sold` / `sold_for`. Today it failed to on 8 of 25 trades because the `proposal_open_contract` subscription misses close events and `sellContract()` doesn't reliably parse the sell response (`trade-executor.js:414–484`). Every miss → a guessed (usually losing) number.

---

## 6. Which number do you trust?

**Trust Deriv. You are up +$5.51 today, balance $9,991.83.**

Ignore the bot's dashboard P/L and the daily report JSONs entirely for now — they are built from Pipeline B and are both wrong-signed and missing trades. (The `2026-06-22-summary.json` showing −$2.87 and the all-time −$16.97 are the same fabrication compounded over days.)

| Source | Today's P/L | Trustworthy? |
|--------|------------:|:---:|
| **Deriv platform / account balance** | **+$5.51** | ✅ yes |
| Bot dashboard / `live_trades.db` | −$5.51 | ❌ no (fabricated + incomplete) |
| `reports/daily/2026-06-22-summary.json` | −$2.87 | ❌ no (derived from the bad DB) |

---

## 7. The fix — make the bot record Deriv's number, never its own

1. **Single source of P/L = Deriv's `profit` field.** `proposal_open_contract` and the `sell` response both return `profit` (and `sell_price`/`buy_price`). Record *that* as `pnl`. Delete the local formulas for resolution. (`trade-executor.js:_resolveContract`)
2. **Delete the fabricated-loss fallbacks.** `FORCE_RESOLVE_LOCAL`'s `pnl:-stake` (`:471`) and `TICK_RESOLVED`'s binary math (`contract-monitor.js:107`) must never run for multipliers. If the outcome is unknown, mark the trade `PENDING/UNKNOWN` and reconcile from Deriv's `profit_table`/`statement` API — **never guess**.
3. **Backfill the missing trades.** Pull today's `profit_table` from Deriv and reconcile all 33 positions into the DB so records match the platform.
4. **Fix resolution reliability** so trades stop dropping into fallbacks: reliably parse `sold_for`/`sold_contract`, and confirm `is_sold` before resolving.
5. **Add a sanity assert:** reject/flag any recorded `|pnl| > stake` for a multiplier — it's impossible and signals fabrication. (Would have caught #228 instantly.)
6. **Rebuild historical reports** from Deriv's statement, not the local DB.

Until that's done: **watch your Deriv balance, not the bot.** The good news is the real picture is *better* than the bot claims — you're in profit today, not in loss.

---

## 8. Relationship to `ROOT_CAUSE_ANALYSIS.md`

That earlier doc covers *strategy* problems (broken stop-loss, win rate). It does **not** explain this accounting mismatch. This is a separate **accounting-layer bug**: the bot fabricates P/L whenever it loses contract confirmation, so its ledger diverges — by sign and by count — from Deriv's authoritative balance.
