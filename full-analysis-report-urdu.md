# مکمل پروجیکٹ تجزیہ رپورٹ — Boom/Crash Trading Bot

> **تاریخ:** 24 جون 2026  
> **تجازیہ کار:** خودکار نظام  
> **دائرہ کار:** مکمل پروجیکٹ (Backend, Frontend, Database, WebSocket, Trade Management, Synchronization)

---

## فہرستِ اقسام

1. **بنیادی مسائل (Critical Bugs)**  
2. **کمزوریاں (Weaknesses)**  
3. **بنیادی وجوہات (Root Causes)**  
4. **ضروری اصلاحات (Required Fixes)**  
5. **ترجیحات اور ایکشن پلان (Priorities & Action Plan)**  

---

## 📍 حصہ 1: بنیادی مسائل (Critical Bugs)

### 🚨 بگ #1: SL/TP لگنے پر Bot میں ٹریڈ بند نہیں ہوتی

**مسئلہ:**  
Deriv اصلی اکاؤنٹ پر جب Take Profit یا Stop Loss لگتا ہے تو ٹریڈ صحیح بند ہو جاتی ہے، لیکن Bot کے ڈیش بورڈ پر وہ still active دکھائی دیتی ہے۔

**وجہ:**  
جب Deriv SL/TP بند کرتا ہے تو وہ WebSocket stream پر `is_sold` event بھیجتا ہے۔ لیکن:

1. `trade-executor.js:242-291` میں `proposal_open_contract` subscription ہے  
2. کبھی کبھار یہ stream event **miss** ہو جاتا ہے (Deriv API کی وجہ سے)  
3. جب stream miss ہوتا ہے تو `_resolveContract()` کبھی کال نہیں ہوتا  
4. `_cleanupSub()` بھی کبھی نہیں چلتا  
5. `_contractStreams` map میں entry forever stuck رہتی ہے  
6. Bot کو لگتا ہے کہ ٹریڈ ابھی بھی active ہے  

```
trade-executor.js:242  →  stream.subscribe()
trade-executor.js:247  →  if (poc.is_sold)  ← YEH KABHI MISS HO JATA HAI
trade-executor.js:328  →  _resolveContract()  ← KABHI CALL NAHI HOTA
```

**Proof:**  
آج کی لاگز (24 جون) میں دیکھیں:  
- `BC-0002` کو `ALREADY_SOLD` کے طور پر resolve کیا گیا — یعنی Deriv نے بند کر دیا لیکن Bot کو پتہ نہیں چلا  
- `sellContract()` call کرنے کے بعد پتہ چلا کہ پہلے سے بند ہے  

---

### 🚨 بگ #2: Refreshing کرنے پر Active ٹریڈ ڈیش بورڈ سے غائب

**مسئلہ:**  
جب آپ ایپلیکیشن کو ریفریش کرتے ہیں، تو جو ٹریڈ ابھی بھی Deriv پر چل رہی ہے، وہ Bot ڈیش بورڈ سے غائب ہو جاتی ہے۔

**وجہ:**  
یہ تین اہم مسائل کی وجہ سے ہے:

1. **Active Contract In-Memory ہے، Database میں نہیں**  
   - `tradeExecutor._contractStreams` صرف RAM میں ہے  
   - `contractMonitor.activeContracts` صرف RAM میں ہے  
   - `_contractIdToLocalId` map صرف RAM میں ہے  
   - Refreshing پر سارا درمیانی ڈیٹا ختم ہو جاتا ہے  

2. **Frontend کو Reconnect پر Active Contract نہیں ملتا**  
   - `ws-server.js:149-173` میں `_handleConnection()` صرف status, config, ticks, indicators, recent trades بھیجتا ہے  
   - **Active contract details نہیں بھیجتا**  
   - `use-ws.ts` میں `fetchHistoricalData()` صرف `getAllTrades` اور `getTodayStats` بھیجتا ہے  

3. **Frontend میں Active Contract Set ہی نہیں ہوتا**  
   - `activeContract` صرف `tradeExecuted` event پر set ہوتا ہے (`use-ws.ts:96-107`)  
   - Refresh کرنے پر یہ event دوبارہ نہیں آتا  
   - نتیجہ: ڈیش بورڈ "Awaiting signal..." دکھاتا ہے  

```
Frontend Refresh Flow:
  ws.connect()
  → fetchHistoricalData()
    → getAllTrades()  ← DB سے ماضی کی trades آتی ہیں
    → getTodayStats()
  ← activeContract کبھی set نہیں ہوتا (tradeExecuted event نہیں آیا)
```

---

### 🚨 بگ #3: P/L کا غلط حساب (Fabricated Losses)

**مسئلہ:**  
Bot نے خود سے P/L بنا لیا جب Deriv سے صحیح جواب نہیں ملا۔ اس کی وجہ سے کچھ ٹریڈز میں impossible P/L ریکارڈ ہوا۔  

**مثال:**  
- Trade #228: stake $1.00, recorded pnl = -$2.00  
- Multiplier پر آپ $1 سے زیادہ نہیں کھو سکتے  
- یہ ثابت کرتا ہے کہ Bot نے خود P/L بنا لیا  

**وجہ:**  
پرانے کوڈ میں `trade-executor.js` میں یہ تھا:
```javascript
// پرانا کوڈ (اب fix ہو گیا)
pnl = sellPrice - buyPrice
sellPrice = parseFloat(poc.sell_price) || 0  // ← 0 ہونے پر full loss
```

نیا کوڈ (اب fix شدہ):
```javascript
// نیا کوڈ
const derivProfitRaw = parseFloat(poc.profit);
if (Number.isFinite(derivProfitRaw)) {
  pnl = derivProfitRaw;
} else if (sellPrice !== null) {
  pnl = sellPrice - buyPrice;
} else {
  pnl = null;  // UNRESOLVED — guess نہیں کرتے
}
```

یہ fix 23 جون کو لگایا گیا، لیکن ابھی بھی دیگر مسائل ہیں (نیچے دیکھیں)۔

---

### 🚨 بگ #4: SL/TP 1-Sec Grace Period — خطرناک ونڈو

**مسئلہ:**  
SL/TP چیک کرنے سے پہلے 1 سیکنڈ کا grace period ہے جس میں کچھ نہیں ہو سکتا۔

**جگہ:**  
`trade-executor.js:264` (stream SL check):
```javascript
if (entry.openedAt && Date.now() - entry.openedAt < 1000) return;
```

`trade-executor.js:405` (per-tick SL check):
```javascript
if (entry.openedAt && now - entry.openedAt < 1000) continue;
```

BOOM1000 پر x500 multiplier کے ساتھ 1 سیکنڈ میں قیمت سینکڑوں پوائنٹس حرکت کر سکتی ہے۔ 1 سیکنڈ کی تاخیر سے SL بہت زیادہ loss پر بند ہو سکتا ہے۔

---

### 🚨 بگ #5: MIN_HOLD_MS اب بھی 500ms ہے

**جگہ:**  
`trade-executor.js:432-436`:
```javascript
const MIN_HOLD_MS = 500; // 0.5 seconds
if (entry && entry.openedAt && (Date.now() - entry.openedAt) < MIN_HOLD_MS) {
    this.logger.warn('TradeExecutor', `Contract ${contractId} too young...`);
    return;
}
```

500ms میں بھی BOOM1000 پر بہت کچھ بدل سکتا ہے۔ جب SL/TP لگتا ہے اور sell فوراً کرنا ہے، تو یہ 500ms sell کو روک دیتا ہے۔

---

## 📍 حصہ 2: کمزوریاں (Weaknesses)

### 🔶 کمزوری #1: WebSocket Stream غیر مستحکم ہے

**تفصیل:**  
`proposal_open_contract` subscription Deriv کے stream پر انحصار کرتی ہے۔ یہ stream کبھی کبھار events miss کر دیتا ہے۔  

- جب stream `is_sold` miss کرتا ہے تو fallback استعمال ہوتا ہے  
- Fallback میں `sellContract()` کال ہوتی ہے  
- اگر وہ بھی fail ہو تو `FORCE_RESOLVE` یا `UNRESOLVED`  

**اثر:**  
- SL/TP لگنے میں تاخیر  
- ALREADY_SOLD cases  
- P/L کا غلط حساب  

### 🔶 کمزوری #2: In-Memory State کسی بھی جگہ Persist نہیں ہے

**تفصیل:**  
مندرجہ ذیل ڈیٹا صرف RAM میں ہے، Database میں نہیں:  

| ڈیٹا | جگہ | مسئلہ |
|------|------|--------|
| `_contractStreams` | trade-executor.js | Restart/refresh پر ختم |
| `_contractIdToLocalId` | bot.js | Restart/refresh پر ختم |
| `activeContracts` | contract-monitor.js | Restart/refresh پر ختم |
| `_slTpSet` | trade-executor.js | Restart/refresh پر ختم |

**اثر:**  
- Bot restart پر تمام active contracts کا پتہ نہیں چلتا  
- Frontend refresh پر active contract غائب  
- SL/TP دوبارہ set نہیں ہوتا  

### 🔶 کمزوری #3: Frontend Dedup System Trades کو اپڈیٹ نہیں ہونے دیتا

**جگہ:**  
`bot-store.ts:addTradeFromDb`:
```typescript
const existingIds = new Set(state.trades.map(t => t.localId || t.contractId));
const newTrades = incoming.filter(t => {
  const id = t.localId || t.contractId;
  return id && !existingIds.has(id);
});
```

اگر کوئی ٹریڈ پہلے سے موجود ہے (localId یا contractId match ہو)، تو اسے `filter` کر دیا جاتا ہے۔  
اگر `win` یا `pnl` بعد میں بدل جائے (reconciliation کے بعد)، تو Frontend کبھی اپڈیٹ نہیں ہوتا۔  

### 🔶 کمزوری #4: `_onContractResolved` میں `activeContract` غلط طریقے سے null ہوتا ہے

**جگہ:**  
`bot-store.ts:addTradeResolved`:
```typescript
const id = result.localId || result.contractId;
if (!id || state.trades.some(t => (t.localId === id || t.contractId === id))) return;
// ↑ YEH CHECK KARTA HAI: AGAR PEHLE SE HAI TO RETURN
// IS KI WAJAH SE activeContract kabhi null nahi hota
```

جب `tradeResolved` event آتا ہے، تو یہ چیک کرتا ہے کہ کیا یہ ٹریڈ پہلے سے موجود ہے (initial load سے)۔ اگر ہے تو return کر دیتا ہے اور `activeContract: null` set نہیں ہوتا۔

### 🔶 کمزوری #5: `resolved` Flag کبھی کبھی sell کو روکتا ہے

**جگہ:**  
`trade-executor.js:425-429`:
```javascript
const entry = this._contractStreams.get(contractId);
if (entry && entry.resolved) {
    this.logger.info('TradeExecutor', `Contract ${contractId} already resolved — skipping sell`);
    return;
}
```

اگر stream نے `is_sold` دیکھا اور `_resolveContract` کال کیا، تو `entry.resolved = true` ہو جاتا ہے۔ لیکن اگر `_resolveContract` میں کچھ غلط ہوا (مثلاً `entry` undefined ہے)، تو `resolved` true ہے لیکن اصل میں کچھ نہیں ہوا۔  

### 🔶 کمزوری #6: `balanceAfter` حساب درست نہیں

**جگہ:**  
`bot.js:668`:
```javascript
balanceAfter: this.riskManager.currentBalance,
```

یہ `riskManager.currentBalance` استعمال کرتا ہے۔ لیکن `risk-manager.js:101` میں:
```javascript
const liveBalanceOwnsBalance = this._liveBalanceActive && !(this.config.virtualBalance > 0);
if (!liveBalanceOwnsBalance) {
    this.currentBalance += result.pnl;
}
```

LIVE mode میں بیلنس ڈبل کاؤنٹ ہو سکتا ہے: ایک بار `recordTrade` سے اور ایک بار `updateLiveBalance` سے۔  

### 🔶 کمزوری #7: Config Update تمام Components تک نہیں پہنچتا

**جگہ:**  
`bot.js:803-831` میں اب `tradeExecutor.config` اور `contractMonitor.config` اپڈیٹ ہوتا ہے۔ لیکن:

- پہلے سے چل رہے contract streams میں وہی پرانی values ہیں  
- `_subscribeContract` (line 231) میں `stopLoss: this.config.stopLoss` ایک بار capture ہوتا ہے  
- Config بدلنے سے موجودہ trade کا SL/TP نہیں بدلتا  
- Deriv server-side SL/TP (جو `contract_update` سے set ہوا) صرف وہی مؤثر ہے  

### 🔶 کمزوری #8: Frontend پر "Today" Trades کا تعین غلط ہے

**جگہ:**  
`trade-history.tsx:isToday`:
```typescript
function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const tradeTime = parseLocal(dateStr);
  const now = new Date();
  return now.getFullYear() === new Date(tradeTime).getFullYear()
    && now.getMonth() === new Date(tradeTime).getMonth()
    && now.getDate() === new Date(tradeTime).getDate();
}
```

یہ `created_at` string کو local time سمجھ کر parse کرتا ہے۔ لیکن `createdAt` (camelCase) Frontend میں ISO format میں store ہے۔ فرق کی وجہ سے `isToday` غلط ہو سکتا ہے۔

### 🔶 کمزوری #9: Signal Stats Fetching میں Race Condition

**جگہ:**  
`signal-history.tsx` میں `fetchSignalStats()` ہر بار component mount ہونے پر چلتا ہے۔ یہ `getSignals` اور `getSignalStats` دونوں بھیجتا ہے۔  
- جواب آنے میں وقت لگ سکتا ہے  
- `setSignals` اور `setSignalStats` ایک ساتھ نہیں آتے  
- Frontend میں کچھ دیر inconsistent data ہو سکتا ہے  

### 🔶 کمزوری #10: `_getTodayStatsFull()` ہر 2 سیکنڈ میں DB پڑھتا ہے

**جگہ:**  
`ws-server.js:502-518`:
```javascript
this._statusInterval = setInterval(() => {
    ...
    this._broadcast('todayStats', this._getTodayStatsFull());
    ...
}, 2000);
```

ہر 2 سیکنڈ میں SQLite database پڑھنا — بہت بڑے ڈیٹا پر کارکردگی متاثر کر سکتا ہے۔ اس کے علاوہ، `_getTodayStatsFull()` میں `todayTotal` اور `todayPnl` `rows.filter(r => r.win)` سے compute ہوتے ہیں — یہ تمام rows کو RAM میں لاتا ہے۔  

### 🔶 کمزوری #11: Error Handling میں خامیاں

**جگہ:**  
- `trade-executor.js:322` — `_startPolling` میں catch block خالی ہے `catch {}`  
- `trade-executor.js:449` — sell کرتے وقت catch خالی ہے `catch {}`  
- `ws-server.js:234` — DB query میں `catch {}` خالی ہے  
- خالی catch blocks مسائل کو چھپا دیتے ہیں  

### 🔶 کمزوری #12: `blacklisted_hours` ہارڈ کوڈڈ ہے

**جگہ:**  
`risk-manager.js:31`:
```javascript
this._blacklistedHours = [18];
```

یہ UTC 18:00 (پاکستان میں رات 11 بجے) کو بلاک کرتا ہے۔ یہ صرف ایک مخصوص وقت کو بلاک کرتا ہے — اور اگر اس وقت بھی اچھی trade ہو تو موقع ضائع ہوتا ہے۔  

### 🔶 کمزوری #13: Spike Cluster Detection کا منطق کمزور ہے

**جگہ:**  
`risk-manager.js:119-139`:
```javascript
if (move > 0.02) { ... spikeCount++; ... }
```

صرف 2% حرکت پر spike detect ہوتا ہے۔ BOOM1000 پر یہ عام ہے۔ 3 spikes آنے پر stake کم ہو جاتا ہے، لیکن 500ms کے cluster window میں۔ یہ بہت حساس ہے اور غلط مثبت (false positive) بہت ہوں گے۔  

---

## 📍 حصہ 3: بنیادی وجوہات (Root Causes)

### 🎯 روٹ کاز #1: Active Contract کا In-Memory Only ہونا

**یہ سب سے بڑی وجہ ہے** کہ:
- Trade refresh پر غائب ہو جاتی ہے  
- Bot restart پر پچھلی trades کا پتہ نہیں چلتا  
- SL/TP دوبارہ set نہیں ہوتا  

**حل:**  
ایک نیا DB table بنائیں `active_contracts` جہاں:
- contractId
- localId
- entryPrice
- stake
- multiplier
- stopLoss
- takeProfit
- entryEpoch
- contractType

ہر trade open ہونے پر یہاں save کریں، close ہونے پر delete کریں۔ Bot start ہونے پر اس ٹیبل سے active contracts پڑھیں۔  

### 🎯 روٹ کاز #2: WebSocket Stream غیر مستحکم

**Deriv API کا stream بعض اوقات events miss کر دیتا ہے۔**  
- کوئی retry mechanism نہیں  
- Fallback میں بھی کوئی guarantee نہیں  
- `proposal_open_contract` polling بھی 1 سیکنڈ کے وقفے سے ہے  

**حل:**  
- Stream کے ساتھ ساتھ polling بھی چلائیں  
- Stream miss ہونے پر فوراً fallback polling start کریں  
- Polling کا وقفہ 200ms تک کم کریں (SL/TP کے لیے)  

### 🎯 روٹ کاز #3: Frontend-Backend Disconnect

جب آپ Frontend refresh کرتے ہیں:
1. نیا WebSocket connection بنتا ہے  
2. Backend نئے client کو موجودہ ڈیٹا بھیجتا ہے  
3. لیکن active contract کا ڈیٹا نہیں بھیجتا  
4. Frontend کو لگتا ہے کہ کوئی active trade نہیں  

**حل:**  
- Backend سے ایک نیا action بنائیں `getActiveContracts`  
- Frontend `fetchHistoricalData` میں اسے شامل کریں  
- `_handleConnection` میں active contract details بھیجیں  

### 🎯 روٹ کاز #4: Frontend Dedup System

Trade resolved ہونے پر:
1. Backend `tradeResolved` event بھیجتا ہے  
2. Frontend `addTradeResolved` میں چیک کرتا ہے کہ یہ trade پہلے سے موجود ہے  
3. اگر ہاں (initial load سے)، تو return — `activeContract: null` کبھی set نہیں ہوتا  

**حل:**  
- Dedup چیک میں صرف `localId` اور `contractId` استعمال کریں  
- Trade resolved ہونے پر `activeContract` فوراً null کریں  
- `addTradeResolved` میں resolved trade کو اپڈیٹ کریں (نہ صرف نئی شامل کریں)  

### 🎯 روٹ کاز #5: Database اور In-Memory میں فرق

Backend میں ڈیٹا دو جگہ ہے:
1. `riskManager` — in-memory (موجودہ بیلنس، daily trades)  
2. `live_trades.db` — persistent (تاریخی trades)  

یہ دونوں کبھی sync نہیں ہوتے جب تک نئی trade log نہ ہو۔  
- Bot restart پر `restoreFromDb` سے in-memory restore ہوتا ہے  
- لیکن session کے دوران کوئی cross-check نہیں  

---

## 📍 حصہ 4: ضروری اصلاحات (Required Fixes)

### 🔴 انتہائی ضروری (Critical) — فوری اصلاح

| # | اصلاح | فائل | تفصیل |
|---|-------|------|--------|
| F1 | Active Contract کو DB میں store کریں | نیا: `data/schema.js` | نیا `active_contracts` ٹیبل |
| F2 | Frontend کو reconnect پر active contract بھیجیں | `ws-server.js:149-173` | `_handleConnection` میں `getActiveContracts` شامل کریں |
| F3 | SL/TP Grace Period کو 0 کریں | `trade-executor.js:264,405` | 1000ms → 0ms |
| F4 | MIN_HOLD_MS کو 0 کریں | `trade-executor.js:432` | 500ms → 0ms |
| F5 | `addTradeResolved` میں `activeContract` فوراً null کریں | `bot-store.ts` | Dedup چیک کو ہٹائیں |
| F6 | Sell کے لیے 3 بار retry | `trade-executor.js:438-541` | `sellContract` میں retry loop |

### 🟠 اہم (High Priority)

| # | اصلاح | فائل | تفصیل |
|---|-------|------|--------|
| F7 | Stream + Polling دونوں ایک ساتھ چلائیں | `trade-executor.js:230-326` | SL/TP کے لیے 200ms polling |
| F8 | Frontend Dedup Fix — اپڈیٹ کی اجازت | `bot-store.ts:addTradeFromDb` | موجودہ trades کو اپڈیٹ کر سکے |
| F9 | Backend سے `activeContract` action | `ws-server.js` | `getActiveContracts` handler |
| F10 | Per-tick SL کو فوری بنائیں | `bot.js:294` | `checkPerTickStopLoss` ہر tick پر call کریں |
| F11 | Stream miss ہونے پر فوری polling | `trade-executor.js` | Stream error handler |
| F12 | Risk Manager ڈبل کاؤنٹنگ fix | `risk-manager.js:86-117` | `recordTrade` میں بیلنس ڈبل نہ کریں |

### 🟡 درمیانی (Medium Priority)

| # | اصلاح | فائل | تفصیل |
|---|-------|------|--------|
| F13 | تمام خالی catch blocks میں logging | تمام `.js` فائلیں | `catch {}` → `catch (err) { logger.error(...) }` |
| F14 | `_getTodayStatsFull` کوキャش کریں | `ws-server.js:460-500` | Resultキャش کریں، ہر 2s DB نہ پڑھیں |
| F15 | Spike cluster detection کو بہتر کریں | `risk-manager.js:119-139` | بڑا window, مختلف threshold |
| F16 | `blacklistedHours` کو config میں ڈالیں | `risk-manager.js`, `.env` | صارف خود set کر سکے |
| F17 | `isToday` کو درست کریں | `trade-history.tsx` | UTC vs Local time mismatch |
| F18 | SignalRaceCondition fix | `signal-history.tsx` | Sequential fetches |
| F19 | Manual Sell کا بہتر response | `ws-server.js:369-391` | اصل PnL بھیجیں |

### 🟢 کم ترجیح (Low Priority)

| # | اصلاح | فائل | تفصیل |
|---|-------|------|--------|
| F20 | Daily Report میں derivProfit شامل کریں | `scripts/daily-report.js` | Deriv کے اصل profit سے cross-check |
| F21 | Telegram alerts میں active trade info | `alert-manager.js` | موجودہ trade کی تفصیل |
| F22 | `.env` میں comments درست کریں | `.env` | Dead parameters mark کریں |
| F23 | Trade History میں pagination | `trade-history.tsx` | Server-side pagination |
| F24 | Backtest میں multiplier support | `scripts/run-backtest.js` | MULTDOWN/MULTUP support |

---

## 📍 حصہ 5: ایکشن پلان (Action Plan)

### مرحلہ 1: فوری (آج) — Critical Fixes

```
[ ] F1: Active contract DB table بنائیں
[ ] F2: Frontend reconnect پر active contract بھیجیں
[ ] F3: SL/TP grace period 0 کریں
[ ] F4: MIN_HOLD_MS 0 کریں
[ ] F5: addTradeResolved میں activeContract فوراً null
```

### مرحلہ 2: اگلے 24 گھنٹے — High Priority

```
[ ] F6: Sell کے لیے retry mechanism
[ ] F7: Stream + Polling دونوں
[ ] F8: Frontend dedup fix
[ ] F9: getActiveContracts handler
[ ] F10: Per-tick SL فوری
```

### مرحلہ 3: اگلے 3 دن — Medium Priority

```
[ ] F11: Stream error handler
[ ] F12: Risk double-counting fix
[ ] F13: Empty catch blocks logging
[ ] F14: TodayStatsキャش
[ ] F15-F19: باقی medium fixes
```

### مرحلہ 4: اگلے ہفتے — Low Priority

```
[ ] F20-F24: بہتری اور اضافہ
```

---

## 📍 حصہ 6: ڈیٹابیس تجزیہ (Database Analysis)

### Live Trades DB (`backend/data/live_trades.db`)

**Trades Table:** 212 records

| تاریخ | ٹریڈز | Win Rate | PnL | بیلنس |
|-------|-------|----------|-----|-------|
| 2026-06-13 | 3 | 100% | +$0.18 | $9,985.82 |
| 2026-06-14 | 8 | 37.5% | -$0.65 | $9,985.31 |
| 2026-06-16 | 6 | 83.3% | +$0.40 | $9,985.71 |
| 2026-06-17 | 7 | 42.9% | +$0.01 | $9,985.70 |
| 2026-06-19 | 10 | 40% | -$1.71 | $9,983.31 |
| 2026-06-20 | 8 | 25% | -$2.30 | $9,981.91 |
| 2026-06-21 | 88 | 28.4% | -$3.26 | $9,986.22 |
| 2026-06-22 | 25 | 12% | -$5.51 | $9,981.38 |
| 2026-06-23 | 4 | 75% | +$1.33 | $9,993.16 |
| 2026-06-24 | 3 | 0% | -$0.61 | $9,992.30 |

**Warning:** 22 جون کا ڈیٹا غلط PnL ریکارڈ کرنے کی وجہ سے corrupted ہے۔ Reconcilation script چلانے کی ضرورت ہے۔

---

## 📍 حصہ 7: فن تعمیر کے مسائل (Architectural Issues)

### 1. Layered Architecture نہیں

موجودہ فن تعمیر:
```
bot.js (سب کچھ کنٹرول کرتا ہے)
  ├── trade-executor.js (Deriv API, SL/TP, Sell)
  ├── contract-monitor.js (Tick-based monitoring)
  ├── risk-manager.js (Balance, Risk limits)
  ├── trade-logger.js (Database)
  └── ws-server.js (Frontend communication)
```

مسئلہ: `bot.js` پر بہت زیادہ dependency ہے۔ یہ **God object** بن گیا ہے۔ 835 lines کا ایک فائل جو سب کچھ کرتا ہے۔

**حل:**  
- ایک `TradeManager` کلاس بنائیں جو صرف trade lifecycle handle کرے  
- ایک `SyncManager` کلاس بنائیں جو in-memory اور DB کے درمیان sync کرے  
- `bot.js` کو چھوٹے حصوں میں تقسیم کریں  

### 2. Event-Driven Architecture نامکمل

Events کا استعمال ہے لیکن:
- کوئی event bus نہیں  
- Events کا order guarantee نہیں  
- کوئی event replay mechanism نہیں (اسی لیے refresh پر ڈیٹا غائب)  

**حل:**  
ایک مرکزی EventBus بنائیں اور تمام events کو اس سے گزاریں۔  

### 3. Database Read/Write Pattern

موجودہ:
- `ws-server.js` ہر 2 سیکنڈ میں DB پڑھتا ہے  
- `trade-logger.js` ہر trade پر DB لکھتا ہے  
- کوئیキャش layer نہیں  

**حل:**  
- Redis یا in-memoryキャش استعمال کریں  
- DB صرف persist کے لیے استعمال کریں  
- Readsキャش سے کریں  

---

## 📍 حصہ 8: SL/TP فلو کا مکمل تجزیہ

جب SL/TP لگتا ہے تو یہ ہوتا ہے:

```
Deriv SL/TP Trigger
  ↓
Deriv contract بند کرتا ہے
  ↓
Deriv WebSocket پر is_sold: true بھیجتا ہے
  ↓
trade-executor.js:247 → if (poc.is_sold) 
  ↓ (اگر stream نے پکڑ لیا)
_resolveContract(contractId, poc, 'AUTO_CLOSE')
  ↓
_emit('contractResolved', result)
  ↓
bot.js:_onMultiplierResolved()
  ↓
contractMonitor.resolveContract(localId, result)
  ↓
contractMonitor emits 'contractResolved'
  ↓
ws-server.js broadcasts 'tradeResolved'
  ↓
Frontend bot-store.ts:addTradeResolved()
  ↓
Trade تاریخ میں شامل، activeContract = null
```

**لیکن جہاں یہ ٹوٹتا ہے:**

```
اگر stream is_sold پکڑنے میں ناکام رہا:
  ↓
sellContract() کال ہوتی ہے (SL/TP check سے)
  ↓
اگر sell API fail ہو:
    ↓
    ALREADY_SOLD یا FORCE_RESOLVE یا UNRESOLVED
    ↓
    (ان میں سے کوئی بھی پورے فلو کو درست طریقے سے مکمل نہیں کرتا)
```

**فکس:**  
Stream + Parallel polling دونوں استعمال کریں۔ Polling کا وقفہ 200ms رکھیں۔ جب SL/TP کی سطح پہنچ جائے، فوراً sell کریں۔

---

## 📍 حصہ 9: تجاویز (Recommendations)

### مختصر مدت (Short-term)

1. **Active Contract کو DB میں store کریں** — سب سے اہم fix  
2. **Frontend کو reconnect پر فعال contract بھیجیں** — refresh کا مسئلہ حل  
3. **SL/TP grace period ختم کریں** — فوری stop loss  
4. **Retry mechanism for sell** — کبھی ناامید نہ ہوں  
5. **Frontend dedup fix** — resolved trades کو اپڈیٹ کریں  

### درمیانی مدت (Medium-term)

1. **キャش layer شامل کریں** — کارکردگی بہتر  
2. **Error handling بہتر کریں** — خالی catch blocks نہ ہوں  
3. **EventBus system** — ordered, replayable events  
4. **Unified logging** — تمام logs ایک format میں  
5. **Reconciliation script** — Deriv سے ڈیٹا match کرے  

### طویل مدت (Long-term)

1. **Architecture refactor** — `bot.js` کو تقسیم کریں  
2. **State machine بہتر بنائیں** — تمام states کا clear diagram  
3. **Full test coverage** — ہر function کا test  
4. **Real-time monitoring** — Grafana/Datadog  
5. **Multi-account support** — ایک سے زیادہ اکاؤنٹ  

---

## 📍 حصہ 10: SL/TP نہ لگنے کا اصل حل — مکمل کوڈ

موجودہ `trade-executor.js` میں `_subscribeContract` کو درج ذیل طریقے سے بہتر بنائیں:  
(Frontend اور Backend دونوں میں sync کرنے کے لیے)

### Backend Side Fix:

```javascript
// trade-executor.js میں شامل کریں:

_subscribeContract(contractId, entryPrice, contractType, stake, multiplier) {
  const entry = {
    entryPrice, contractType, resolved: false, stake, multiplier,
    stopLoss: this.config.stopLoss,
    openedAt: Date.now(),
    highestPnl: 0,
    trailDistance: parseFloat(this.config.trailDistance || '0'),
  };
  this._contractStreams.set(contractId, entry);

  // 1. Stream subscription
  try {
    const stream = this.connectionManager.api.subscribe({
      proposal_open_contract: 1,
      contract_id: contractId,
      subscribe: 1,
    });
    const subscription = stream.subscribe({
      next: (resp) => this._onStreamData(contractId, resp),
      error: (err) => {
        this.logger.error('Stream error', err.message);
        // فوری polling شروع کریں
        this._startFastPolling(contractId);
      },
    });
    entry.subscription = subscription;
  } catch (err) {
    this._startFastPolling(contractId);
  }

  // 2. متوازی polling (200ms)
  this._startFastPolling(contractId);
}

_startFastPolling(contractId) {
  const entry = this._contractStreams.get(contractId);
  if (!entry || entry.resolved || entry._pollingActive) return;
  entry._pollingActive = true;

  const poll = async () => {
    if (entry.resolved || this._stopped) return;
    try {
      const resp = await this.connectionManager.api.send({
        proposal_open_contract: 1,
        contract_id: contractId,
      });
      const poc = resp?.proposal_open_contract;
      if (!poc) { setTimeout(poll, 200); return; }

      // SL/TP Stream-based check (ہر 200ms)
      if (entry.stopLoss && Number.isFinite(parseFloat(poc.profit))) {
        const currentPnl = parseFloat(poc.profit);
        if (currentPnl <= -entry.stopLoss) {
          this.logger.warn('Poll SL hit', `PnL=${currentPnl} <= -${entry.stopLoss}`);
          this.sellContract(contractId);
          return;
        }
      }

      if (poc.is_sold) {
        entry.resolved = true;
        this._resolveContract(contractId, poc, 'AUTO_CLOSE_POLL');
        return;
      }

      setTimeout(poll, 200);
    } catch {
      setTimeout(poll, 500); // Error پر زیادہ انتظار
    }
  };
  setTimeout(poll, 200);
}
```

### Frontend Side Fix:

```typescript
// ws-server.js میں شامل کریں:

_handleConnection(ws) {
  // ... existing code ...

  // Active contract info بھیجیں
  const activeIds = this.bot.tradeExecutor.getActiveContractIds();
  if (activeIds.length > 0) {
    const activeContracts = activeIds.map(id => {
      const entry = this.bot.tradeExecutor._contractStreams.get(id);
      if (!entry) return null;
      return {
        contractId: id,
        entryPrice: entry.entryPrice,
        contractType: entry.contractType,
        stake: entry.stake,
        multiplier: entry.multiplier,
        stopLoss: entry.stopLoss,
        openedAt: entry.openedAt,
      };
    }).filter(Boolean);
    this._send(ws, 'activeContracts', activeContracts);
  }
}
```

```typescript
// use-ws.ts میں شامل کریں:

case 'activeContracts': {
  const contracts = msg.data as ActiveContract[];
  if (contracts.length > 0) {
    const first = contracts[0];
    setActiveContract({
      localId: '',
      contractId: first.contractId,
      direction: first.contractType === 'MULTUP' ? 'CALL' : 'PUT',
      entryPrice: first.entryPrice,
      entryTick: 0,
      expiryTick: 0,
      stake: first.stake,
      contractType: first.contractType,
      multiplier: first.multiplier,
      stopLoss: first.stopLoss,
      takeProfit: first.takeProfit,
      entryEpoch: Math.floor(first.openedAt / 1000),
    });
  } else {
    setActiveContract(null);
  }
  break;
}
```

---

## خلاصہ (Summary)

یہ رپورٹ 15+ اہم مسائل کو ظاہر کرتی ہے۔ **دو سب سے بڑے مسائل:**

1. **SL/TP لگنے پر ٹریڈ بند نہ ہونا** — WebSocket stream کی عدم اعتبار + sell retry کا نہ ہونا  
2. **Refreshing پر ٹریڈ غائب ہو جانا** — Active contract کا in-memory only ہونا + Frontend کو reconnect پر ڈیٹا نہ ملنا  

**فوری اقدامات:**  
1. Active contract کو DB میں store کریں  
2. Frontend reconnect پر active contract بھیجیں  
3. SL/TP grace period ختم کریں  
4. Retry mechanism شامل کریں  

**ان اصلاحات کے بعد Bot Deriv کے ساتھ مکمل sync میں رہے گا، SL/TP فوری طور پر کام کریں گے، اور refresh کرنے پر trade غائب نہیں ہوگی۔**

> **نوٹ:** پچھلے دنوں کا P/L ڈیٹا غلط ہے۔ Deriv سے `profit_table` API کے ذریعے reconciliation کرنے کی ضرورت ہے۔ اس کے لیے `scripts/reconcile-deriv.js` script بنائی گئی ہے۔
