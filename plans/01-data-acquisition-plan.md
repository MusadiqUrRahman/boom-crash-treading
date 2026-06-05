# Implementation Plan: Data Acquisition

**Specification:** `specifications/01-data-acquisition.md`
**Phase:** 1 of 7
**Status:** Implementation Ready

## Overview

This plan covers acquiring tick-level historical data for Deriv's Boom 1000 and Crash 1000 synthetic indices via the Deriv WebSocket API. The data is stored in SQLite and will be used for statistical analysis, backtesting, and strategy optimization in subsequent phases.

## File Structure to Create

```
data/
  boom_crash_ticks.db         # SQLite database (created at runtime)
scripts/
  download-ticks.js           # Historical download script
  list-symbols.js             # Symbol discovery utility
lib/
  storage.js                  # SQLite storage layer
  config-loader.js            # Configuration file loader
  progress-bar.js             # Console progress display
config.js                     # Configuration file (user-editable)
.env                          # Secrets (API token, app_id) — gitignored
```

## Step-by-Step Implementation

### Step 1: Project Setup

**Files to create:**
- `package.json`
- `.env.example`
- `.gitignore`

**Actions:**
1. Run `npm init -y` in project root
2. Install dependencies: `npm install @deriv/deriv-api ws better-sqlite3 dotenv`
3. Create `.gitignore` with `node_modules/`, `.env`, `data/`, `*.db`
4. Create `.env.example` with placeholders:
   ```
   DERIV_APP_ID=1089
   DERIV_API_TOKEN=your_token_here
   DERIV_ENDPOINT=ws.derivws.com
   ```
5. Create `.env` file (user fills in actual values)

**Acceptance:** `npm ls @deriv/deriv-api ws better-sqlite3 dotenv` shows all installed.

---

### Step 2: Configuration Loader

**File:** `lib/config-loader.js`

**Purpose:** Loads configuration from `config.js` and `.env`, merges them, validates required fields.

**Implementation:**
```javascript
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  appId: parseInt(process.env.DERIV_APP_ID || '1089', 10),
  apiToken: process.env.DERIV_API_TOKEN || '',
  endpoint: process.env.DERIV_ENDPOINT || 'ws.derivws.com',
  symbols: (process.env.TARGET_SYMBOLS || 'BOOM1000,CRASH1000').split(','),
  minTicksPerSymbol: parseInt(process.env.MIN_TICKS_PER_SYMBOL || '100000', 10),
  dbPath: path.join(__dirname, '..', 'data', 'boom_crash_ticks.db'),
  requestDelay: 200,
};

function validate(config) {
  const errors = [];
  if (!config.apiToken) errors.push('DERIV_API_TOKEN is required');
  if (!config.appId || isNaN(config.appId)) errors.push('DERIV_APP_ID must be a number');
  if (config.symbols.length === 0) errors.push('At least one symbol required');
  if (errors.length > 0) throw new Error('Config validation failed:\n' + errors.join('\n'));
  return config;
}

module.exports = { loadConfig: () => validate(config) };
```

**Acceptance:** Running `node -e "require('./lib/config-loader').loadConfig()"` either succeeds or shows clear validation errors.

---

### Step 3: Storage Layer

**File:** `lib/storage.js`

**Purpose:** SQLite database management — schema creation, tick insertion, duplicate prevention, acquisition logging.

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS ticks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  quote REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticks_symbol_epoch ON ticks(symbol, epoch);
CREATE INDEX IF NOT EXISTS idx_ticks_symbol ON ticks(symbol);

CREATE TABLE IF NOT EXISTS acquisition_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  start_epoch INTEGER,
  end_epoch INTEGER,
  tick_count INTEGER,
  acquired_at TEXT DEFAULT (datetime('now'))
);
```

**Methods to implement:**

| Method | Signature | Description |
|---|---|---|
| `init()` | `async init(dbPath)` | Open database, create tables/schema |
| `insertTicks(symbol, times, prices)` | `async insertTicks(symbol, times[], prices[])` | Batch insert using `INSERT OR IGNORE`. Takes parallel arrays from API response. |
| `getTickCount(symbol)` | `async getTickCount(symbol)` | `SELECT COUNT(*) FROM ticks WHERE symbol = ?` |
| `getOldestEpoch(symbol)` | `async getOldestEpoch(symbol)` | `SELECT MIN(epoch) FROM ticks WHERE symbol = ?` |
| `logAcquisition(symbol, startEpoch, endEpoch, count)` | `async logAcquisition(...)` | Insert into acquisition_log |
| `hasData(symbol)` | `async hasData(symbol)` | Returns true if tick count >= minimum |
| `close()` | `async close()` | Close database connection |

**Performance note:** Use `better-sqlite3` (synchronous) — simpler code, fast enough. Insert ticks in batches of 5000 (whole API response at once) using a transaction:

```javascript
const insertStmt = db.prepare(
  'INSERT OR IGNORE INTO ticks (symbol, epoch, quote) VALUES (?, ?, ?)'
);

const insertMany = db.transaction((symbol, times, prices) => {
  for (let i = 0; i < times.length; i++) {
    insertStmt.run(symbol, times[i], prices[i]);
  }
});
```

**Acceptance:**
- `init()` creates the database file at the configured path
- `insertTicks()` inserts data correctly
- Re-inserting same data does not create duplicates
- `getTickCount()` returns correct count

---

### Step 4: Symbol Discovery

**File:** `scripts/list-symbols.js`

**Purpose:** Connects to Deriv API, calls `active_symbols`, and displays available synthetic indices.

**Implementation flow:**
```javascript
const DerivAPIBasic = require('@deriv/deriv-api/dist/DerivAPIBasic');
const { loadConfig } = require('../lib/config-loader');

async function main() {
  const config = loadConfig();
  const api = new DerivAPIBasic({ endpoint: config.endpoint, app_id: config.appId });
  
  const response = await api.activeSymbols({ active_symbols: 'brief' });
  
  const syntheticIndices = response.active_symbols.filter(
    s => s.market === 'synthetic_index'
  );
  
  console.log('Synthetic indices available:');
  syntheticIndices.forEach(s => {
    const match = config.symbols.includes(s.symbol) ? ' ← TARGET' : '';
    console.log(`  ${s.symbol.padEnd(15)} ${s.display_name}${match}`);
  });
  
  // Check if target symbols exist
  config.symbols.forEach(target => {
    const found = syntheticIndices.find(s => s.symbol === target);
    if (found) {
      console.log(`\n✓ ${target} confirmed: ${found.display_name}`);
    } else {
      console.log(`\n✗ ${target} NOT FOUND in active symbols`);
    }
  });
  
  await api.disconnect();
}

main().catch(console.error);
```

**Acceptance:** Running `node scripts/list-symbols.js` prints a table of synthetic indices with `BOOM1000` and `CRASH1000` marked as targets. If symbol names differ, it shows what the actual symbol names are.

---

### Step 5: Historical Download Script

**File:** `scripts/download-ticks.js`

**Purpose:** Downloads historical ticks for all configured symbols using paginated API calls.

**Implementation:**

```javascript
const DerivAPIBasic = require('@deriv/deriv-api/dist/DerivAPIBasic');
const { loadConfig } = require('../lib/config-loader');
const Storage = require('../lib/storage');
const ProgressBar = require('../lib/progress-bar');

async function downloadSymbol(api, storage, symbol, minTicks, delay) {
  let totalTicks = await storage.getTickCount(symbol);
  let oldestEpoch = await storage.getOldestEpoch(symbol);
  let end = oldestEpoch ? oldestEpoch - 1 : 'latest';
  let batchCount = 0;
  
  const progress = new ProgressBar(`Downloading ${symbol}`);
  progress.show(totalTicks, minTicks);
  
  while (totalTicks < minTicks) {
    if (batchCount > 0) await sleep(delay); // Rate limiting
    
    const response = await api.ticksHistory({
      ticks_history: symbol,
      end: end,
      count: 5000,
      style: 'ticks',
    });
    
    const times = response.history.times;
    const prices = response.history.prices;
    
    if (!times || times.length === 0) break; // No more data available
    
    await storage.insertTicks(symbol, times, prices);
    
    totalTicks += times.length;
    oldestEpoch = Math.min(...times);
    end = oldestEpoch - 1;
    batchCount++;
    
    progress.show(totalTicks, minTicks);
  }
  
  progress.done();
  await storage.logAcquisition(symbol, oldestEpoch, Math.max(...times), totalTicks);
  console.log(`  ✓ ${symbol}: ${totalTicks} ticks downloaded (${batchCount} batches)`);
}

async function main() {
  const config = loadConfig();
  const storage = new Storage();
  await storage.init(config.dbPath);
  
  const api = new DerivAPIBasic({
    endpoint: config.endpoint,
    app_id: config.appId,
  });
  await api.authorize({ authorize: config.apiToken });
  
  for (const symbol of config.symbols) {
    console.log(`\nProcessing ${symbol}...`);
    await downloadSymbol(api, storage, symbol, config.minTicksPerSymbol, config.requestDelay);
  }
  
  await api.disconnect();
  await storage.close();
  console.log('\n✓ Data acquisition complete');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
main().catch(console.error);
```

**Key implementation details:**

1. **Pagination logic:** After each 5000-tick batch, use `oldestEpoch - 1` as the next `end` value to get the next oldest batch without overlap.

2. **Rate limiting:** 200ms delay between requests by default (configurable). Well within most API limits.

3. **Resume capability:** Check `getTickCount()` at start. If data exists, pick up from where we left off.

4. **Progress display:** Update progress bar after each batch.

5. **Stop condition:** If API returns empty `times` array, no more historical data is available — stop even if below target count.

**Acceptance:**
- Running `node scripts/download-ticks.js` downloads ticks for all configured symbols
- Progress bar shows: `Downloading BOOM1000: 45,000 / 100,000 ticks (45%)`
- Database contains 100K+ ticks per symbol
- Re-running the script shows `0 ticks downloaded` (all exists) or picks up where it left off
- No duplicate rows in database

---

### Step 6: Progress Bar

**File:** `lib/progress-bar.js`

**Purpose:** Simple console-based progress bar for download progress.

```javascript
class ProgressBar {
  constructor(label, width = 30) {
    this.label = label;
    this.width = width;
    this.lastOutput = '';
  }
  
  show(current, total) {
    const pct = Math.min(1, current / total);
    const filled = Math.round(this.width * pct);
    const empty = this.width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const line = `\r${this.label}: ${current.toLocaleString()} / ${total.toLocaleString()} ticks (${(pct * 100).toFixed(0)}%) ${bar}`;
    process.stdout.write(line);
    this.lastOutput = line;
  }
  
  done() {
    process.stdout.write('\n');
  }
}

module.exports = ProgressBar;
```

---

### Step 7: Configuration File

**File:** `config.js`

```javascript
module.exports = {
  // Deriv API settings
  appId: parseInt(process.env.DERIV_APP_ID || '1089', 10),
  apiToken: process.env.DERIV_API_TOKEN || '',
  endpoint: process.env.DERIV_ENDPOINT || 'ws.derivws.com',
  
  // Data acquisition settings
  symbols: ['BOOM1000', 'CRASH1000'],
  minTicksPerSymbol: 100000,
  requestDelay: 200,          // ms between API requests
  
  // Storage
  dbPath: './data/boom_crash_ticks.db',
};
```

---

### Step 8: Package.json Script

Add to `package.json`:

```json
{
  "scripts": {
    "list-symbols": "node scripts/list-symbols.js",
    "download": "node scripts/download-ticks.js"
  }
}
```

---

### Step 9: Verification Script (Optional but Recommended)

**File:** `scripts/verify-data.js`

Quick verification that the downloaded data is valid:

```javascript
const { loadConfig } = require('../lib/config-loader');
const Storage = require('../lib/storage');

async function main() {
  const config = loadConfig();
  const storage = new Storage();
  await storage.init(config.dbPath);
  
  for (const symbol of config.symbols) {
    const count = await storage.getTickCount(symbol);
    const oldest = await storage.getOldestEpoch(symbol);
    const newest = await storage.getNewestEpoch(symbol); // Needs implementation
    
    console.log(`\n${symbol}:`);
    console.log(`  Ticks:       ${count.toLocaleString()}`);
    console.log(`  Date range:  ${new Date(oldest * 1000).toISOString()} → ${new Date(newest * 1000).toISOString()}`);
    console.log(`  Duration:    ${((newest - oldest) / 3600 / 24).toFixed(1)} days`);
    console.log(`  Status:      ${count >= config.minTicksPerSymbol ? '✓ SUFFICIENT' : '✗ INSUFFICIENT'}`);
  }
  
  await storage.close();
}

main().catch(console.error);
```

## Edge Cases to Handle

| Edge case | How to handle |
|---|---|
| API returns empty history | Stop downloading for that symbol, log warning |
| Network disconnection mid-download | Catch error, retry with backoff (1s, 2s, 5s), resume from last batch |
| Symbol not found | From active_symbols check — log error, skip symbol |
| Duplicate timestamps | `INSERT OR IGNORE` handles this at DB level |
| Database file locked | Only one process writes at a time. Use `better-sqlite3` which handles this natively. |
| Very old data (API limit) | API may return less than 5000 for old ranges. Accept whatever is returned. |
| API rate limit (too many requests) | 200ms delay keeps us well under typical rate limits. If hit, increase delay. |

## Acceptance Criteria Verification

| # | Criterion | How to verify |
|---|---|---|
| 1 | Symbols confirmed | `npm run list-symbols` shows BOOM1000/CRASH1000 with ✓ confirmation |
| 2 | 100K+ ticks per symbol | `npm run verify-data` shows count >= 100,000 |
| 3 | No duplicates | Run SQL: `SELECT COUNT(*) = COUNT(DISTINCT symbol || '-' || epoch) FROM ticks` should return 1 (true) |
| 4 | Contiguous data | Verify date range covers expected period with no large gaps |
| 5 | Acquisition logged | `SELECT COUNT(*), symbol FROM acquisition_log GROUP BY symbol` shows entries |
| 6 | Resume works | Run download twice — second run shows 0 new ticks and exits quickly |

## Files Summary

| File | Type | Lines (est.) | Purpose |
|---|---|---|---|
| `package.json` | new | 20 | Dependencies and scripts |
| `.gitignore` | new | 5 | Ignore node_modules, .env, data |
| `.env.example` | new | 3 | Template for secrets |
| `config.js` | new | 15 | User-editable configuration |
| `lib/config-loader.js` | new | 30 | Config validation and loading |
| `lib/storage.js` | new | 80 | SQLite storage layer |
| `lib/progress-bar.js` | new | 20 | Console progress display |
| `scripts/list-symbols.js` | new | 40 | Symbol discovery |
| `scripts/download-ticks.js` | new | 70 | Main download script |
| `scripts/verify-data.js` | new | 30 | Data verification |
| **Total** | | **~313 lines** | |

## Next Steps

After this plan is approved and implemented, proceed to Phase 2 (Statistical Analysis) to analyze the collected tick data for drift magnitude, spike distribution, and edge quantification.
