const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class Storage {
  constructor() {
    this.db = null;
    this.insertStmt = null;
    this.insertMany = null;
  }

  init(dbPath) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this._createSchema();
    this._prepareStatements();
  }

  _createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ticks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        epoch INTEGER NOT NULL,
        quote REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_ticks_symbol_epoch ON ticks(symbol, epoch);
      CREATE INDEX IF NOT EXISTS idx_ticks_symbol ON ticks(symbol);

      CREATE TABLE IF NOT EXISTS acquisition_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        start_epoch INTEGER,
        end_epoch INTEGER,
        tick_count INTEGER,
        batch_label TEXT DEFAULT 'manual',
        acquired_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  _prepareStatements() {
    this.insertStmt = this.db.prepare(
      'INSERT OR IGNORE INTO ticks (symbol, epoch, quote) VALUES (?, ?, ?)'
    );

    this.insertMany = this.db.transaction((symbol, ticks) => {
      let inserted = 0;
      for (let i = 0; i < ticks.length; i++) {
        const info = this.insertStmt.run(symbol, ticks[i].epoch, ticks[i].quote);
        if (info.changes > 0) inserted++;
      }
      return inserted;
    });
  }

  insertTicks(symbol, times, prices) {
    if (!times || !prices || times.length !== prices.length) {
      throw new Error('times and prices must be non-null arrays of equal length');
    }
    if (times.length === 0) return { inserted: 0, duplicates: 0, total: 0 };

    const ticks = [];
    for (let i = 0; i < times.length; i++) {
      ticks.push({ epoch: times[i], quote: prices[i] });
    }

    ticks.sort((a, b) => a.epoch - b.epoch);

    const inserted = this.insertMany(symbol, ticks);
    return {
      inserted,
      duplicates: times.length - inserted,
      total: times.length,
    };
  }

  getTickCount(symbol) {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM ticks WHERE symbol = ?').get(symbol);
    return row.count;
  }

  getOldestEpoch(symbol) {
    const row = this.db.prepare('SELECT MIN(epoch) AS epoch FROM ticks WHERE symbol = ?').get(symbol);
    return row.epoch;
  }

  getNewestEpoch(symbol) {
    const row = this.db.prepare('SELECT MAX(epoch) AS epoch FROM ticks WHERE symbol = ?').get(symbol);
    return row.epoch;
  }

  hasData(symbol, minTicks) {
    const count = this.getTickCount(symbol);
    return count >= minTicks;
  }

  logAcquisition(symbol, startEpoch, endEpoch, count, batchLabel) {
    const stmt = this.db.prepare(
      'INSERT INTO acquisition_log (symbol, start_epoch, end_epoch, tick_count, batch_label) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(symbol, startEpoch, endEpoch, count, batchLabel || 'manual');
  }

  getAcquisitionLog(symbol) {
    return this.db.prepare(
      'SELECT * FROM acquisition_log WHERE symbol = ? ORDER BY acquired_at DESC'
    ).all(symbol);
  }

  getDuplicateCount(symbol) {
    const row = this.db.prepare(
      "SELECT COUNT(*) - COUNT(DISTINCT symbol || '-' || epoch) AS dupes FROM ticks WHERE symbol = ?"
    ).get(symbol);
    return row.dupes;
  }

  getGapCount(symbol, maxGapSeconds) {
    const rows = this.db.prepare(
      'SELECT epoch FROM ticks WHERE symbol = ? ORDER BY epoch ASC'
    ).all(symbol);

    if (rows.length < 2) return 0;

    let gaps = 0;
    for (let i = 1; i < rows.length; i++) {
      const delta = rows[i].epoch - rows[i - 1].epoch;
      if (delta > maxGapSeconds) gaps++;
    }
    return gaps;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = Storage;
