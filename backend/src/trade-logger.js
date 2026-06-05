const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class TradeLogger {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.insertStmt = null;
  }

  init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this._createSchema();
    this._prepareStatements();
  }

  _createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id TEXT,
        local_id TEXT,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL,
        stake REAL NOT NULL,
        payout_rate REAL,
        entry_price REAL,
        exit_price REAL,
        entry_epoch INTEGER,
        exit_epoch INTEGER,
        duration_ticks INTEGER,
        score INTEGER,
        score_rsi INTEGER DEFAULT 0,
        score_bb INTEGER DEFAULT 0,
        score_ema INTEGER DEFAULT 0,
        score_roc INTEGER DEFAULT 0,
        score_momentum INTEGER DEFAULT 0,
        win INTEGER,
        pnl REAL,
        balance_after REAL,
        dry_run INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_trades_epoch ON trades(entry_epoch);
      CREATE INDEX IF NOT EXISTS idx_trades_win ON trades(win);
      CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at);
    `);
  }

  _prepareStatements() {
    this.insertStmt = this.db.prepare(`
      INSERT INTO trades (
        contract_id, local_id, symbol, direction, stake, payout_rate,
        entry_price, exit_price, entry_epoch, exit_epoch, duration_ticks,
        score, score_rsi, score_bb, score_ema, score_roc, score_momentum,
        win, pnl, balance_after, dry_run
      ) VALUES (
        @contractId, @localId, @symbol, @direction, @stake, @payoutRate,
        @entryPrice, @exitPrice, @entryEpoch, @exitEpoch, @durationTicks,
        @score, @scoreRsi, @scoreBb, @scoreEma, @scoreRoc, @scoreMomentum,
        @win, @pnl, @balanceAfter, @dryRun
      )
    `);
  }

  logTrade(record) {
    if (!this.db) this.init();
    const info = this.insertStmt.run({
      contractId: record.contractId || null,
      localId: record.localId || null,
      symbol: record.symbol,
      direction: record.direction,
      stake: record.stake,
      payoutRate: record.payoutRate || null,
      entryPrice: record.entryPrice,
      exitPrice: record.exitPrice,
      entryEpoch: record.entryEpoch || Math.floor(Date.now() / 1000),
      exitEpoch: record.exitEpoch || Math.floor(Date.now() / 1000),
      durationTicks: record.durationTicks || null,
      score: record.score || null,
      scoreRsi: (record.scoreComponents && record.scoreComponents.rsi) || 0,
      scoreBb: (record.scoreComponents && record.scoreComponents.bb) || 0,
      scoreEma: (record.scoreComponents && record.scoreComponents.ema) || 0,
      scoreRoc: (record.scoreComponents && record.scoreComponents.roc) || 0,
      scoreMomentum: (record.scoreComponents && record.scoreComponents.momentum) || 0,
      win: record.win ? 1 : 0,
      pnl: record.pnl,
      balanceAfter: record.balanceAfter || null,
      dryRun: record.dryRun ? 1 : 0,
    });
    return info.lastInsertRowid;
  }

  getTradesToday() {
    const today = new Date().toISOString().slice(0, 10);
    return this.db.prepare(
      "SELECT * FROM trades WHERE DATE(created_at) = ? ORDER BY id"
    ).all(today);
  }

  getDailyStats() {
    const today = new Date().toISOString().slice(0, 10);
    const row = this.db.prepare(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN win = 0 THEN 1 ELSE 0 END) AS losses,
        COALESCE(SUM(CASE WHEN win = 1 THEN pnl ELSE 0 END), 0) AS profit,
        COALESCE(SUM(CASE WHEN win = 0 THEN pnl ELSE 0 END), 0) AS loss,
        COALESCE(SUM(pnl), 0) AS netPnl,
        COALESCE(SUM(CASE WHEN win = 0 THEN 1 ELSE 0 END), 0) AS consecutiveLosses
      FROM trades WHERE DATE(created_at) = ?
    `).get(today);
    return row;
  }

  getTodayStats() {
    const today = new Date().toISOString().slice(0, 10);
    const row = this.db.prepare(`
      SELECT 
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END), 0) AS wins,
        COALESCE(SUM(CASE WHEN win = 0 THEN 1 ELSE 0 END), 0) AS losses,
        COALESCE(SUM(CASE WHEN win = 1 THEN pnl ELSE 0 END), 0) AS profit,
        COALESCE(SUM(CASE WHEN win = 0 THEN pnl ELSE 0 END), 0) AS loss,
        COALESCE(SUM(pnl), 0) AS netPnl
      FROM trades WHERE DATE(created_at) = ?
    `).get(today);

    const recent = this.db.prepare(
      'SELECT win FROM trades WHERE DATE(created_at) = ? ORDER BY id DESC LIMIT 50'
    ).all(today);

    let consecutiveLosses = 0;
    for (const t of recent) {
      if (t.win === 0) consecutiveLosses++;
      else break;
    }

    return { ...row, consecutiveLosses };
  }

  getRecentTrades(limit) {
    return this.db.prepare(
      'SELECT * FROM trades ORDER BY id DESC LIMIT ?'
    ).all(limit || 20);
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = TradeLogger;
