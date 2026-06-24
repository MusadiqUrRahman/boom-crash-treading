const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function getLocalDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

class TradeLogger {
  constructor(dbPath, logger, defaultContractType) {
    this.dbPath = dbPath;
    this.logger = logger || null;
    this.defaultContractType = defaultContractType || 'MULTDOWN';
    this.db = null;
    this.insertStmt = null;
    this.insertSignalStmt = null;
    this.updateSignalStmt = null;
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
        contract_type TEXT DEFAULT 'CALL',
        multiplier INTEGER,
        stop_loss REAL,
        take_profit REAL,
        exit_reason TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_trades_epoch ON trades(entry_epoch);
      CREATE INDEX IF NOT EXISTS idx_trades_win ON trades(win);
      CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at);

      CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT NOT NULL PRIMARY KEY,
        symbol TEXT NOT NULL,
        trades INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        pnl REAL DEFAULT 0,
        balance REAL DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        epoch INTEGER NOT NULL,
        price REAL NOT NULL,
        direction TEXT NOT NULL,
        score INTEGER NOT NULL,
        score_rsi INTEGER DEFAULT 0,
        score_bb INTEGER DEFAULT 0,
        score_ema INTEGER DEFAULT 0,
        score_roc INTEGER DEFAULT 0,
        score_momentum INTEGER DEFAULT 0,
        score_spike_penalty INTEGER DEFAULT 0,
        indicators_json TEXT,
        contract_type TEXT,
        contract_id TEXT,
        trade_id INTEGER,
        resolved INTEGER DEFAULT 0,
        outcome TEXT,
        pnl REAL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_signals_epoch ON signals(epoch);
      CREATE INDEX IF NOT EXISTS idx_signals_resolved ON signals(resolved);
      CREATE INDEX IF NOT EXISTS idx_signals_score ON signals(score);
    `);

    this._runMigrations();
  }

  _runMigrations() {
    const hasContractType = this.db.prepare(
      "SELECT COUNT(*) AS cnt FROM pragma_table_info('trades') WHERE name = 'contract_type'"
    ).get().cnt;
    if (hasContractType === 0) {
      this.logger?.info('TradeLogger', 'Running migration: add contract_type to trades');
      this.db.exec("ALTER TABLE trades ADD COLUMN contract_type TEXT DEFAULT 'CALL'");
      this.db.exec("ALTER TABLE trades ADD COLUMN multiplier INTEGER");
      this.db.exec("ALTER TABLE trades ADD COLUMN stop_loss REAL");
      this.db.exec("ALTER TABLE trades ADD COLUMN take_profit REAL");
      this.db.exec("ALTER TABLE trades ADD COLUMN exit_reason TEXT");
    }

    const hasBalance = this.db.prepare(
      "SELECT COUNT(*) AS cnt FROM pragma_table_info('daily_stats') WHERE name = 'balance'"
    ).get().cnt;
    if (hasBalance === 0) {
      this.logger?.info('TradeLogger', 'Running migration: add balance to daily_stats');
      this.db.exec("ALTER TABLE daily_stats ADD COLUMN balance REAL DEFAULT 0");
    }

    // Reconciliation/audit columns: track Deriv's authoritative profit alongside
    // the recorded pnl, preserve original exit reasons, and flag impossible values.
    const reconcileCols = [
      ['deriv_profit', 'REAL'],            // Deriv's authoritative net P/L for the contract
      ['original_exit_reason', 'TEXT'],    // exit_reason before reconciliation overwrote it
      ['reconcile_status', 'TEXT'],        // RECONCILED | BACKFILLED | NOT_ON_DERIV | null
      ['flagged_pnl', 'INTEGER DEFAULT 0'], // 1 when |pnl| > stake on a multiplier (impossible)
    ];
    for (const [col, type] of reconcileCols) {
      const exists = this.db.prepare(
        "SELECT COUNT(*) AS cnt FROM pragma_table_info('trades') WHERE name = ?"
      ).get(col).cnt;
      if (exists === 0) {
        this.logger?.info('TradeLogger', `Running migration: add ${col} to trades`);
        this.db.exec(`ALTER TABLE trades ADD COLUMN ${col} ${type}`);
      }
    }
  }

  _prepareStatements() {
    this.insertStmt = this.db.prepare(`
      INSERT INTO trades (
        contract_id, local_id, symbol, direction, stake, payout_rate,
        entry_price, exit_price, entry_epoch, exit_epoch, duration_ticks,
        score, score_rsi, score_bb, score_ema, score_roc, score_momentum,
        win, pnl, balance_after, dry_run,
        contract_type, multiplier, stop_loss, take_profit, exit_reason,
        deriv_profit, reconcile_status, flagged_pnl
      ) VALUES (
        @contractId, @localId, @symbol, @direction, @stake, @payoutRate,
        @entryPrice, @exitPrice, @entryEpoch, @exitEpoch, @durationTicks,
        @score, @scoreRsi, @scoreBb, @scoreEma, @scoreRoc, @scoreMomentum,
        @win, @pnl, @balanceAfter, @dryRun,
        @contractType, @multiplier, @stopLoss, @takeProfit, @exitReason,
        @derivProfit, @reconcileStatus, @flaggedPnl
      )
    `);

    this.insertSignalStmt = this.db.prepare(`
      INSERT INTO signals (
        timestamp, epoch, price, direction, score,
        score_rsi, score_bb, score_ema, score_roc, score_momentum,
        score_spike_penalty, indicators_json, contract_type
      ) VALUES (
        @timestamp, @epoch, @price, @direction, @score,
        @scoreRsi, @scoreBb, @scoreEma, @scoreRoc, @scoreMomentum,
        @spikePenalty, @indicatorsJson, @contractType
      )
    `);

    this.updateSignalStmt = this.db.prepare(`
      UPDATE signals SET
        resolved = 1, outcome = @outcome, pnl = @pnl,
        contract_id = @contractId, trade_id = @tradeId
      WHERE id = @signalId
    `);
  }

  logTrade(record) {
    if (!this.db) this.init();

    // Sanity guard: on a multiplier contract you cannot lose more than your stake.
    // |pnl| > stake is mathematically impossible and indicates a fabricated value.
    let flaggedPnl = 0;
    if (record.multiplier && record.pnl != null && record.stake != null) {
      const EPS = 0.01;
      if (Math.abs(record.pnl) > record.stake + EPS) {
        flaggedPnl = 1;
        if (this.logger) {
          this.logger.error('TradeLogger',
            `IMPOSSIBLE P/L: pnl=${record.pnl} exceeds stake=${record.stake} ` +
            `(multiplier=${record.multiplier}, contract=${record.contractId}, exit=${record.exitReason}). ` +
            `Recording as flagged for reconciliation.`);
        }
      }
    }

    const info = this.insertStmt.run({
      contractId: record.contractId || null,
      localId: record.localId || null,
      symbol: record.symbol,
      direction: record.direction,
      stake: record.stake,
      payoutRate: record.payoutRate ?? null,
      entryPrice: record.entryPrice,
      exitPrice: record.exitPrice,
      entryEpoch: record.entryEpoch || Math.floor(Date.now() / 1000),
      exitEpoch: record.exitEpoch || Math.floor(Date.now() / 1000),
      durationTicks: record.durationTicks ?? null,
      score: record.score ?? null,
      scoreRsi: (record.scoreComponents && record.scoreComponents.rsi) || 0,
      scoreBb: (record.scoreComponents && record.scoreComponents.bb) || 0,
      scoreEma: (record.scoreComponents && record.scoreComponents.ema) || 0,
      scoreRoc: (record.scoreComponents && record.scoreComponents.roc) || 0,
      scoreMomentum: (record.scoreComponents && record.scoreComponents.momentum) || 0,
      win: record.win ? 1 : 0,
      pnl: record.pnl ?? null,
      balanceAfter: record.balanceAfter ?? null,
      dryRun: record.dryRun ? 1 : 0,
      contractType: record.contractType || 'CALL',
      multiplier: record.multiplier ?? null,
      stopLoss: record.stopLoss ?? null,
      takeProfit: record.takeProfit ?? null,
      exitReason: record.exitReason || null,
      derivProfit: record.derivProfit ?? null,
      reconcileStatus: record.reconcileStatus ?? null,
      flaggedPnl: flaggedPnl,
    });
    return info.lastInsertRowid;
  }

  logSignal(signalData) {
    if (!this.db) this.init();
    const info = this.insertSignalStmt.run({
      timestamp: signalData.timestamp || new Date().toISOString(),
      epoch: signalData.epoch || Math.floor(Date.now() / 1000),
      price: signalData.price,
      direction: signalData.direction,
      score: signalData.score,
      scoreRsi: (signalData.scoreComponents && signalData.scoreComponents.rsi) || 0,
      scoreBb: (signalData.scoreComponents && signalData.scoreComponents.bb) || 0,
      scoreEma: (signalData.scoreComponents && signalData.scoreComponents.ema) || 0,
      scoreRoc: (signalData.scoreComponents && signalData.scoreComponents.roc) || 0,
      scoreMomentum: (signalData.scoreComponents && signalData.scoreComponents.momentum) || 0,
      spikePenalty: (signalData.scoreComponents && signalData.scoreComponents.spikePenalty) || 0,
      indicatorsJson: signalData.indicatorsJson || null,
      contractType: signalData.contractType || this.defaultContractType,
    });
    return info.lastInsertRowid;
  }

  updateSignalWithTrade(signalId, outcome, pnl, contractId, tradeId) {
    if (!this.db) this.init();
    this.updateSignalStmt.run({
      signalId,
      outcome: outcome || null,
      pnl: pnl ?? null,
      contractId: contractId || null,
      tradeId: tradeId || null,
    });
  }

  getSignals(limit = 100, offset = 0) {
    if (!this.db) this.init();
    return this.db.prepare(
      'SELECT * FROM signals ORDER BY id DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
  }

  getPendingSignals() {
    if (!this.db) this.init();
    return this.db.prepare(
      "SELECT * FROM signals WHERE resolved = 0 ORDER BY id DESC LIMIT 50"
    ).all();
  }

  getSignalsByContractId(contractId) {
    if (!this.db) this.init();
    return this.db.prepare(
      "SELECT * FROM signals WHERE contract_id = ? ORDER BY id DESC"
    ).all(contractId);
  }

  getTradesToday() {
    if (!this.db) this.init();
    const today = getLocalDateString();
    return this.db.prepare(
      "SELECT * FROM trades WHERE DATE(created_at, 'localtime') = ? ORDER BY id"
    ).all(today);
  }

  getDailyStats() {
    if (!this.db) this.init();
    const today = getLocalDateString();
    const row = this.db.prepare(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN win = 0 THEN 1 ELSE 0 END) AS losses,
        COALESCE(SUM(CASE WHEN win = 1 THEN pnl ELSE 0 END), 0) AS profit,
        COALESCE(SUM(CASE WHEN win = 0 THEN pnl ELSE 0 END), 0) AS loss,
        COALESCE(SUM(pnl), 0) AS netPnl
      FROM trades WHERE DATE(created_at, 'localtime') = ?
    `).get(today);

    const recentTrades = this.db.prepare(`
      SELECT win FROM trades WHERE DATE(created_at, 'localtime') = ? ORDER BY created_at DESC
    `).all(today);

    let consecutiveLosses = 0;
    for (const t of recentTrades) {
      if (t.win === 0) consecutiveLosses++;
      else break;
    }
    row.consecutiveLosses = consecutiveLosses;

    return row;
  }

  getTodayStats() {
    if (!this.db) this.init();
    const today = getLocalDateString();
    const row = this.db.prepare(`
      SELECT 
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END), 0) AS wins,
        COALESCE(SUM(CASE WHEN win = 0 THEN 1 ELSE 0 END), 0) AS losses,
        COALESCE(SUM(CASE WHEN win = 1 THEN pnl ELSE 0 END), 0) AS profit,
        COALESCE(SUM(CASE WHEN win = 0 THEN pnl ELSE 0 END), 0) AS loss,
        COALESCE(SUM(pnl), 0) AS netPnl
      FROM trades WHERE DATE(created_at, 'localtime') = ?
    `).get(today);

    const recent = this.db.prepare(
      'SELECT win FROM trades WHERE DATE(created_at, \'localtime\') = ? ORDER BY id DESC LIMIT 50'
    ).all(today);

    let consecutiveLosses = 0;
    for (const t of recent) {
      if (t.win === 0) consecutiveLosses++;
      else break;
    }

    return { ...row, consecutiveLosses };
  }

  logDailyStats(date, symbol, trades, wins, losses, pnl, balance) {
    if (!this.db) this.init();
    const result = this.db.prepare(`
      UPDATE daily_stats SET
        symbol = ?, trades = ?, wins = ?, losses = ?, pnl = ?, balance = ?,
        updated_at = datetime('now')
      WHERE date = ?
    `).run(symbol, trades, wins, losses, pnl, balance, date);
    if (result.changes === 0) {
      this.db.prepare(`
        INSERT INTO daily_stats (date, symbol, trades, wins, losses, pnl, balance)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(date, symbol, trades, wins, losses, pnl, balance);
    }
  }

  getRecentTrades(limit) {
    if (!this.db) this.init();
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
