# Specification 01: Data Acquisition

- **Version:** 1.0
- **Research basis:** `research-boom-crash/01-tick-data-analysis.md`, `research-boom-crash/02-mathematical-structure.md`, `research-boom-crash/18-research-roadmap.md`
- **Status:** Draft

## 1. Objective

Acquire and store tick-level historical price data for Deriv's Boom 1000 and Crash 1000 synthetic indices. The data must be sufficient in volume and quality to support statistical analysis, backtesting, and strategy optimization in subsequent phases.

**Target:** Minimum 100,000 ticks per instrument (200,000+ total). 500,000+ preferred for robust optimization.

## 2. Input Requirements

### Before Starting This Phase

| Requirement | Detail |
|---|---|
| Deriv API app_id | Register at `app.deriv.com` to obtain an app_id. Use `1089` for testing only (limited). |
| Deriv API token | Generate an API token from the Deriv website (Settings → API Token). Needed for `authorize()` call. |
| Account type | Demo account recommended for data acquisition and testing. |
| Node.js | Version 18+ installed. |
| npm | Latest version. |

### Dependencies

None. This is the first phase of the project.

## 3. Technical Specification

### 3.1 Technology Stack

- **Runtime:** Node.js 18+
- **API Library:** `@deriv/deriv-api` (npm package) + `ws` for WebSocket transport
- **Database:** SQLite via `better-sqlite3` (fast, synchronous, no external process)
- **Language:** JavaScript (CommonJS modules)

### 3.2 Deriv API Connection

Connect to the Deriv WebSocket API:

```javascript
const DerivAPIBasic = require('@deriv/deriv-api/dist/DerivAPIBasic');

const api = new DerivAPIBasic({
  endpoint: 'ws.derivws.com',
  app_id: YOUR_APP_ID,
  lang: 'EN'
});
```

After connection, authorize with the API token:

```javascript
await api.authorize({ authorize: 'YOUR_API_TOKEN' });
```

### 3.3 Symbol Discovery

Before assuming symbol names, call the `active_symbols` API to discover the exact symbol names for Boom 1000 and Crash 1000. Research indicates they should be `BOOM1000` and `CRASH1000`, but these must be confirmed.

Expected response fields to check:
- `symbol.symbol` — e.g., `BOOM1000`, `CRASH1000`
- `symbol.display_name` — human-readable name
- `symbol.market` — should be `synthetic_index`
- `symbol.submarket` — should indicate boom/crash

The planner should design a symbol discovery utility that:
1. Calls `active_symbols` with no parameters
2. Filters results to `market === 'synthetic_index'`
3. Matches `display_name` for "Boom" and "Crash" patterns
4. Returns the confirmed symbol strings for use throughout the project

### 3.4 Historical Data Acquisition

#### API: `ticksHistory`

Use the `DerivAPIBasic.ticksHistory()` method to download historical ticks.

**Request format:**
```javascript
const response = await api.ticksHistory({
  ticks_history: 'BOOM1000',  // or CRASH1000 — confirm via active_symbols
  end: 'latest',               // work backwards from latest
  count: 5000,                 // max per request
  style: 'ticks'               // tick-level data, not candles
});
```

**Response format:**
```json
{
  "history": {
    "times": [1678886400, 1678886401, ...],
    "prices": [1234.56, 1234.78, ...]
  }
}
```

Each tick has:
- `epoch` — Unix timestamp (seconds)
- `quote` — price at that tick

#### Pagination Strategy

The API limits each request to 5000 ticks. To accumulate 100,000+ ticks:

1. Send first request with `end: 'latest'`, `count: 5000`
2. Find the oldest timestamp in the response
3. Send next request with `end: oldestTimestamp - 1`, `count: 5000`
4. Repeat until sufficient data collected

**Important:** The `end` parameter uses the tick's `epoch` value. Subtract 1 from the oldest tick's epoch to avoid duplicates.

#### De-duplication

The `times` and `prices` arrays are parallel arrays of the same length. Some ticks may have the same epoch (rare but possible). Handle this by:
- Using `(epoch, quote)` pairs as unique keys
- Discarding exact duplicates before storage
- Keeping the first occurrence if timestamps match but prices differ (first tick wins)

### 3.5 Data Storage Schema

#### Database: `boom_crash_ticks.db`

**Table: `ticks`**

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique row ID |
| symbol | TEXT | NOT NULL | `BOOM1000` or `CRASH1000` |
| epoch | INTEGER | NOT NULL | Unix timestamp (seconds) |
| quote | REAL | NOT NULL | Tick price |
| created_at | TEXT | DEFAULT CURRENT_TIMESTAMP | When this row was inserted |

**Indexes:**
- `idx_ticks_symbol_epoch` on `(symbol, epoch)` — for fast lookups by instrument and time
- `idx_ticks_symbol` on `(symbol)` — for instrument filtering

**Table: `acquisition_log`**

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique row ID |
| symbol | TEXT | NOT NULL | Instrument symbol |
| start_epoch | INTEGER | | Start of acquisition range |
| end_epoch | INTEGER | | End of acquisition range |
| tick_count | INTEGER | | Number of ticks acquired |
| acquired_at | TEXT | DEFAULT CURRENT_TIMESTAMP | When acquisition ran |

This log tracks what data has been collected and prevents re-downloading overlapping ranges.

### 3.6 Tick Buffer for Live Collection

In addition to historical download, implement a **live tick buffer** for ongoing collection:

```javascript
const ticks = await api.ticks('BOOM1000');
ticks.onUpdate().subscribe(tick => {
  // tick: { epoch, quote }
  storeTick('BOOM1000', tick.epoch, tick.quote);
});
```

This allows:
- Continuous data accumulation during operation
- Verifying live prices match historical patterns
- Building a growing dataset over time

### 3.7 Progress Tracking

Since a single request gets 5000 ticks and we need 100,000+, implement:

- **Console progress bar** — show "Downloading BOOM1000: 45,000 / 100,000 ticks (45%)"
- **Resume capability** — check `acquisition_log` to skip already-downloaded ranges
- **Rate limiting** — respect the API by adding a small delay between requests (100-200ms)

### 3.8 Configuration File

Create a `config.js` or `.env` file with:

```env
DERIV_APP_ID=your_app_id
DERIV_API_TOKEN=your_api_token
DERIV_ENDPOINT=ws.derivws.com
ACCOUNT_TYPE=demo
TARGET_SYMBOLS=BOOM1000,CRASH1000
MIN_TICKS_PER_SYMBOL=100000
DB_PATH=./data/boom_crash_ticks.db
```

### 3.9 Error Handling

| Error | Handling |
|---|---|
| WebSocket connection failure | Retry with exponential backoff (1s, 2s, 4s, 8s, max 30s) |
| API rate limit | Increase delay between requests |
| Invalid symbol | Fall back to `active_symbols` discovery and log warning |
| Network timeout | Retry request up to 3 times |
| Duplicate epoch on insert | Use `INSERT OR IGNORE` or check before insert |

### 3.10 Output File Structure

```
data/
  boom_crash_ticks.db   # SQLite database with all tick data
config.js               # Configuration file
scripts/
  download-ticks.js     # Historical download script
  live-collector.js     # Live tick collection (optional for this phase)
```

## 4. Deliverables

| Deliverable | Description |
|---|---|
| `data/boom_crash_ticks.db` | SQLite database with 100K+ ticks per symbol |
| `scripts/download-ticks.js` | Script to download historical ticks with pagination |
| `scripts/list-symbols.js` | Symbol discovery utility |
| `config.js` | Configuration with API credentials |
| Acquisition log entries | Record of what was downloaded and when |

## 5. Acceptance Criteria

| # | Criterion | How to verify |
|---|---|---|
| 1 | Symbols confirmed | `list-symbols.js` outputs exact symbol strings for Boom 1000 and Crash 1000 |
| 2 | 100K+ ticks collected per symbol | `SELECT COUNT(*) FROM ticks WHERE symbol = 'BOOM1000'` >= 100,000 |
| 3 | No duplicate data | `SELECT COUNT(*) = COUNT(DISTINCT symbol || epoch)` for each symbol |
| 4 | Contiguous time range | Oldest epoch < newest epoch, no large gaps (>30 min between consecutive ticks) |
| 5 | Acquisition logged | `acquisition_log` has entries for both symbols with tick counts |
| 6 | Resume works | Re-running download script does not duplicate data or overwrite existing |

## 6. Planner Notes

**For the planning agent:**

1. **Symbol names** — Do NOT hardcode `BOOM1000`/`CRASH1000`. The planner must design the symbol discovery process to call `active_symbols` first and extract the correct symbol strings at runtime.

2. **Database choice** — `better-sqlite3` is recommended because it's synchronous (simpler code) and fast enough for this use case. If the planner prefers an async driver (e.g., `sql.js` with WebAssembly), that's acceptable but adds complexity.

3. **Parallel downloads** — The planner should consider whether to download Boom and Crash in parallel (two separate WebSocket connections) or sequentially. Parallel is faster but needs separate API instances.

4. **Data validation** — The planner should include a quick validation step: after download, log basic stats (min/max/mean price, tick count, date range) for each symbol so the user can verify data looks correct.

5. **Edge cases** — The planner must handle:
   - API disconnection mid-download (resume from last successful batch)
   - Very old data not available (API may reject very old `end` values)
   - Symbol temporarily inactive (retry with delay)

6. **Minimum buffer** — For robust statistical analysis in Phase 2, 50,000 ticks per instrument is the absolute minimum. 100,000+ is strongly recommended. The planner should default to 100,000 and allow override.
