const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const defaults = require('../config/backtest-defaults');
const DerivClient = require('../lib/deriv-client');
const IndicatorEngine = require('../lib/indicator-engine');
const { computeScore } = require('../lib/scoring-engine');
const { simulateTrade } = require('../lib/trade-simulator');
const Storage = require('../lib/storage');

const ONE_MINUTE_MS = 60000;
const ONE_HOUR_MS = 3600000;

function loadConfig() {
  const syncDir = path.resolve(__dirname, '..', '.opencode', 'sync');
  const liveConfigPath = path.join(syncDir, 'live-config.json');
  let liveConfig = {};
  if (fs.existsSync(liveConfigPath)) {
    liveConfig = JSON.parse(fs.readFileSync(liveConfigPath, 'utf-8'));
  }

  return {
    apiToken: process.env.API_TOKEN,
    appId: parseInt(process.env.APP_ID || '0', 10),
    endpoint: process.env.DERIV_ENDPOINT || 'ws.binaryws.com',
    dbPath: path.resolve(__dirname, '..', process.env.DB_PATH || defaults.dbPath),
    liveTradesDbPath: path.resolve(__dirname, '..', process.env.LIVE_TRADES_DB_PATH || './data/live_trades.db'),
    dryRun: (process.env.DRY_RUN || 'true') === 'true',
    debugScores: (process.env.DEBUG_SCORES || 'false') === 'true',
    logLevel: process.env.LOG_LEVEL || 'INFO',
    storeTicks: (process.env.STORE_TICKS || 'false') === 'true',
    healthPort: parseInt(process.env.HEALTH_PORT || '3456', 10),
    logDir: path.resolve(__dirname, '..', process.env.LOG_DIR || './logs'),
    reportDir: path.resolve(__dirname, '..', process.env.REPORT_DIR || './reports/daily'),

    ...liveConfig,

    symbols: liveConfig.symbols || [
      { symbol: 'BOOM1000', direction: 'PUT', stake: 0.50 },
      { symbol: 'CRASH1000', direction: 'CALL', stake: 0.50 },
    ],

    payoutRate: parseFloat(process.env.PAYOUT_RATE || defaults.payoutRate),
    durationTicks: parseInt(process.env.DURATION_TICKS || defaults.durationTicks, 10),
    scoreThreshold: parseInt(process.env.SCORE_THRESHOLD || defaults.scoreThreshold, 10),
    cooldownTicks: parseInt(process.env.COOLDOWN_TICKS || defaults.cooldownTicks, 10),
    minTicksBeforeTrade: parseInt(process.env.MIN_TICKS_BEFORE_TRADE || defaults.minTicksBeforeTrade, 10),
    tickBufferSize: parseInt(process.env.TICK_BUFFER_SIZE || defaults.tickBufferSize, 10),

    rsiOversold: parseInt(process.env.RSI_OVERSOLD || defaults.rsiOversold, 10),
    rsiOverbought: parseInt(process.env.RSI_OVERBOUGHT || defaults.rsiOverbought, 10),
    bbPeriod: parseInt(process.env.BB_PERIOD || defaults.bbPeriod, 10),
    bbStdDev: parseFloat(process.env.BB_STDDEV || defaults.bbStdDev),
    emaShortPeriod: parseInt(process.env.EMA_SHORT_PERIOD || defaults.emaShortPeriod, 10),
    emaLongPeriod: parseInt(process.env.EMA_LONG_PERIOD || defaults.emaLongPeriod, 10),
    rocPeriod: parseInt(process.env.ROC_PERIOD || defaults.rocPeriod, 10),

    maxConsecutiveLosses: parseInt(process.env.MAX_CONSECUTIVE_LOSSES || defaults.maxConsecutiveLosses, 10),
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || defaults.maxDailyLoss),
    maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || defaults.maxDailyTrades, 10),
    spikeThreshold: parseFloat(process.env.SPIKE_THRESHOLD || defaults.spikeThreshold),
    emaDistanceThreshold: parseFloat(process.env.EMA_DISTANCE_THRESHOLD || defaults.emaDistanceThreshold),
    rocMagnitudeThreshold: parseFloat(process.env.ROC_MAGNITUDE_THRESHOLD || defaults.rocMagnitudeThreshold),
  };
}

function getStrategyConfig(symbolConfig, globalConfig) {
  return {
    direction: symbolConfig.direction,
    payoutRate: globalConfig.payoutRate,
    stake: symbolConfig.stake || globalConfig.stake || 0.50,
    durationTicks: globalConfig.durationTicks,
    cooldownTicks: globalConfig.cooldownTicks,
    scoreThreshold: globalConfig.scoreThreshold,
    minTicksBeforeTrade: globalConfig.minTicksBeforeTrade,
    tickBufferSize: globalConfig.tickBufferSize,
    rsiOversold: globalConfig.rsiOversold,
    rsiOverbought: globalConfig.rsiOverbought,
    bbPeriod: globalConfig.bbPeriod,
    bbStdDev: globalConfig.bbStdDev,
    emaShortPeriod: globalConfig.emaShortPeriod,
    emaLongPeriod: globalConfig.emaLongPeriod,
    rocPeriod: globalConfig.rocPeriod,
    spikeThreshold: globalConfig.spikeThreshold,
    emaDistanceThreshold: globalConfig.emaDistanceThreshold,
    rocMagnitudeThreshold: globalConfig.rocMagnitudeThreshold,
    maxConsecutiveLosses: globalConfig.maxConsecutiveLosses,
    maxDailyLoss: globalConfig.maxDailyLoss,
    maxDailyTrades: globalConfig.maxDailyTrades,
  };
}

class LiveBot {
  constructor(config) {
    this.config = config;
    this.running = false;
    this.startTime = null;
    this.client = null;
    this.storage = null;
    this.liveTradesDb = null;
    this.symbolHandlers = {};
    this.dailyStats = { date: null };
    this.logStream = null;
  }

  async start() {
    this.startTime = Date.now();
    this.running = true;

    this._setupLogging();
    this._log('INFO', 'Live Trading Bot starting...');
    this._log('INFO', `Dry run: ${this.config.dryRun}`);
    this._log('INFO', `Symbols: ${this.config.symbols.map(s => `${s.symbol} ${s.direction}`).join(', ')}`);

    this.storage = new Storage();
    this.storage.init(this.config.dbPath);
    this._initLiveTradesDb();

    this._resetDailyStats();

    this.client = new DerivClient({
      endpoint: this.config.endpoint,
      appId: this.config.appId,
      apiToken: this.config.apiToken,
    });

    await this.client.connect();
    this._log('INFO', 'Connected to Deriv');

    for (const symConfig of this.config.symbols) {
      await this._initSymbol(symConfig);
    }

    this._log('INFO', 'All symbols subscribed. Bot running.');
  }

  _setupLogging() {
    if (!fs.existsSync(this.config.logDir)) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
    }
    const logFile = path.join(this.config.logDir, `live-bot-${new Date().toISOString().split('T')[0]}.log`);
    this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
  }

  _log(level, message) {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level}] ${message}`;
    console.log(line);
    if (this.logStream) {
      this.logStream.write(line + '\n');
    }
  }

  _initLiveTradesDb() {
    const dir = path.dirname(this.config.liveTradesDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.liveTradesDb = new Database(this.config.liveTradesDbPath);
    this.liveTradesDb.pragma('journal_mode = WAL');
    this.liveTradesDb.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id TEXT,
        local_id TEXT,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL,
        stake REAL NOT NULL,
        payout_rate REAL NOT NULL,
        entry_price REAL,
        exit_price REAL,
        entry_epoch INTEGER NOT NULL,
        exit_epoch INTEGER,
        duration_ticks INTEGER NOT NULL,
        score REAL,
        score_rsi REAL,
        score_bb REAL,
        score_ema REAL,
        score_roc REAL,
        score_momentum REAL,
        win INTEGER,
        pnl REAL,
        balance_after REAL,
        dry_run INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS daily_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        symbol TEXT NOT NULL,
        trades INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        pnl REAL DEFAULT 0,
        max_consecutive_losses INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  _resetDailyStats() {
    const today = new Date().toISOString().split('T')[0];
    this.dailyStats = { date: today };
    for (const sym of this.config.symbols) {
      const key = sym.symbol;
      this.dailyStats[key] = {
        trades: 0,
        wins: 0,
        losses: 0,
        pnl: 0,
        consecutiveLosses: 0,
        maxConsecutiveLosses: 0,
      };
    }
  }

  async _initSymbol(symConfig) {
    const { symbol, direction } = symConfig;
    this._log('INFO', `Initializing ${symbol} ${direction}...`);

    const stratConfig = getStrategyConfig(symConfig, this.config);

    const existing = this.storage.db.prepare(
      'SELECT epoch, quote FROM ticks WHERE symbol = ? ORDER BY epoch ASC'
    ).all(symbol);
    const tickHistory = existing.map(r => ({ epoch: r.epoch, quote: r.quote }));
    this._log('INFO', `  Loaded ${tickHistory.length} historical ticks for ${symbol}`);

    const engine = new IndicatorEngine(this.config.tickBufferSize);
    for (const t of tickHistory) {
      engine.addPrice(t.quote);
    }
    this._log('INFO', `  IndicatorEngine warmed (${engine.priceCount} prices)`);

    const pendingTrades = [];

    const handler = {
      symbol,
      direction,
      stratConfig,
      engine,
      pendingTrades,
      lastTradeEpoch: null,
      cooldownRemaining: 0,
    };

    this.symbolHandlers[symbol] = handler;

    this._subscribeLive(symbol, handler);
  }

  _subscribeLive(symbol, handler) {
    try {
      const observable = this.client.subscribeTicks(symbol);
      const subscription = observable.subscribe({
        next: tick => this._onTick(symbol, handler, tick),
        error: err => this._log('ERROR', `${symbol} stream error: ${err.message}`),
      });
      handler.subscription = subscription;
      this._log('INFO', `  Subscribed to ${symbol} live ticks`);
    } catch (err) {
      this._log('ERROR', `  Failed to subscribe ${symbol}: ${err.message}`);
    }
  }

  _onTick(symbol, handler, tick) {
    if (!tick || tick.epoch === undefined || tick.quote === undefined) return;

    const { direction, engine, stratConfig, pendingTrades } = handler;
    const { epoch, quote } = tick;

    if (this.config.storeTicks) {
      this.storage.insertTicks(symbol, [epoch], [quote]);
    }

    if (this.config.debugScores && engine.priceCount >= stratConfig.minTicksBeforeTrade) {
      engine.addPrice(quote);
    } else {
      engine.addPrice(quote);
    }

    this._checkPendingTrades(symbol, handler, epoch, quote);

    if (engine.priceCount < stratConfig.minTicksBeforeTrade) return;

    if (handler.cooldownRemaining > 0) {
      handler.cooldownRemaining--;
      return;
    }

    const emaShortVal = engine.ema(stratConfig.emaShortPeriod);
    const emaLongVal = engine.ema(stratConfig.emaLongPeriod);

    const indicators = {
      rsi: engine.rsi(14),
      bb: engine.bollingerBands(stratConfig.bbPeriod, stratConfig.bbStdDev),
      emaShort: emaShortVal,
      emaLong: emaLongVal,
      emaDistance: emaShortVal !== null && emaLongVal !== null
        ? Math.abs(emaShortVal - emaLongVal) / emaLongVal
        : null,
      deltaAlignment: engine.deltaAlignment(3, direction),
      roc: engine.roc(stratConfig.rocPeriod),
      deltas: engine.deltas(3),
      _rawPrices: engine.prices,
    };

    const score = computeScore(indicators, { ...stratConfig, direction });

    if (this.config.debugScores && score.enter) {
      this._log('DEBUG', `${symbol} score=${score.score} components=${JSON.stringify(score.components)} price=${quote}`);
    }

    if (score.enter) {
      const daily = this.dailyStats[symbol];
      if (daily.trades >= stratConfig.maxDailyTrades) {
        this._log('WARN', `${symbol}: maxDailyTrades (${stratConfig.maxDailyTrades}) reached`);
        return;
      }
      if (daily.pnl <= -stratConfig.maxDailyLoss) {
        this._log('WARN', `${symbol}: maxDailyLoss (${stratConfig.maxDailyLoss}) reached (PnL: ${daily.pnl.toFixed(2)})`);
        return;
      }
      if (daily.consecutiveLosses >= stratConfig.maxConsecutiveLosses) {
        this._log('WARN', `${symbol}: maxConsecutiveLosses (${stratConfig.maxConsecutiveLosses}) reached`);
        return;
      }

      this._enterTrade(symbol, handler, epoch, quote, score, tick);
    }
  }

  _enterTrade(symbol, handler, epoch, quote, score, tick) {
    const { direction, stratConfig } = handler;
    const stake = stratConfig.stake;

    const trade = {
      symbol,
      direction,
      entryEpoch: epoch,
      entryQuote: quote,
      entryIndex: handler.engine.priceCount - 1,
      stake,
      payoutRate: stratConfig.payoutRate,
      durationTicks: stratConfig.durationTicks,
      score: score.score,
      components: score.components,
      dryRun: this.config.dryRun ? 1 : 0,
      resolved: false,
      win: null,
      pnl: null,
      exitEpoch: null,
      exitQuote: null,
    };

    handler.pendingTrades.push(trade);

    const daily = this.dailyStats[symbol];
    daily.trades++;

    const bal = this.dailyStats[symbol].pnl + (this.dailyStats[symbol].trades === 0 ? 0 : 0);
    this.liveTradesDb.prepare(`
      INSERT INTO trades (symbol, direction, entry_epoch, entry_price, stake, payout_rate, duration_ticks, score, score_rsi, score_bb, score_ema, score_roc, score_momentum, dry_run)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(symbol, direction, epoch, quote, stake, stratConfig.payoutRate, stratConfig.durationTicks, score.score, score.components.rsi, score.components.bb, score.components.ema, score.components.roc, score.components.momentum, this.config.dryRun ? 1 : 0);

    handler.lastTradeEpoch = epoch;
    handler.cooldownRemaining = stratConfig.cooldownTicks;

    this._log('TRADE', `${symbol} ENTRY epoch=${epoch} price=${quote} score=${score.score} dir=${direction} stake=${stake}`);
    this._log('INFO', `  components: ${JSON.stringify(score.components)}`);

    if (!this.config.dryRun) {
      this._executeLiveTrade(symbol, handler, trade);
    }
  }

  async _executeLiveTrade(symbol, handler, trade) {
    try {
      this._log('INFO', `${symbol}: Sending buy proposal...`);
      const proposal = await this.client.api.proposal({
        proposal: 1,
        amount: trade.stake,
        basis: 'stake',
        contract_type: trade.direction,
        currency: 'USD',
        duration: trade.durationTicks,
        duration_unit: 't',
        symbol: trade.symbol,
      });

      if (proposal && proposal.proposal && proposal.proposal.id) {
        const proposalId = proposal.proposal.id;
        this._log('INFO', `${symbol}: Proposal ${proposalId} accepted. Buying...`);

        const buyResult = await this.client.api.buy({
          buy: proposalId,
          price: trade.stake,
        });

        if (buyResult && buyResult.buy) {
          this._log('TRADE', `${symbol} LIVE BUY executed: contract_id=${buyResult.buy.contract_id} buy_price=${buyResult.buy.buy_price}`);
          trade.liveContractId = buyResult.buy.contract_id;
        } else {
          this._log('ERROR', `${symbol}: Buy failed: ${JSON.stringify(buyResult)}`);
        }
      } else {
        this._log('ERROR', `${symbol}: Proposal rejected: ${JSON.stringify(proposal)}`);
      }
    } catch (err) {
      this._log('ERROR', `${symbol}: Trade execution error: ${err.message}`);
    }
  }

  _checkPendingTrades(symbol, handler, currentEpoch, currentQuote) {
    const toRemove = [];
    for (let i = 0; i < handler.pendingTrades.length; i++) {
      const trade = handler.pendingTrades[i];
      const ticksElapsed = handler.engine.priceCount - 1 - trade.entryIndex;

      if (ticksElapsed >= trade.durationTicks && !trade.resolved) {
        let win;
        if (trade.direction === 'CALL') {
          win = currentQuote > trade.entryQuote;
        } else {
          win = currentQuote < trade.entryQuote;
        }

        trade.win = win;
        trade.pnl = win ? trade.stake * trade.payoutRate : -trade.stake;
        trade.exitEpoch = currentEpoch;
        trade.exitQuote = currentQuote;
        trade.resolved = true;

        const daily = this.dailyStats[symbol];
        if (win) {
          daily.wins++;
          daily.consecutiveLosses = 0;
        } else {
          daily.losses++;
          daily.consecutiveLosses++;
          if (daily.consecutiveLosses > daily.maxConsecutiveLosses) {
            daily.maxConsecutiveLosses = daily.consecutiveLosses;
          }
        }
        daily.pnl += trade.pnl;

        this.liveTradesDb.prepare(`
          UPDATE trades SET exit_epoch = ?, exit_price = ?, win = ?, pnl = ?
          WHERE entry_epoch = ? AND symbol = ?
        `).run(currentEpoch, currentQuote, win ? 1 : 0, trade.pnl, trade.entryEpoch, symbol);

        this._log('TRADE', `${symbol} EXIT epoch=${currentEpoch} price=${currentQuote} ${win ? 'WIN' : 'LOSS'} pnl=${trade.pnl.toFixed(2)} (${daily.trades}T ${daily.wins}W ${daily.losses}L $${daily.pnl.toFixed(2)})`);
      }

      if (trade.resolved) {
        toRemove.push(i);
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      handler.pendingTrades.splice(toRemove[i], 1);
    }
  }

  _reportStatus() {
    const elapsed = ((Date.now() - this.startTime) / 1000 / 60).toFixed(1);
    this._log('INFO', `═════════ Status (${elapsed} min) ═════════`);
    for (const sym of this.config.symbols) {
      const s = this.dailyStats[sym.symbol];
      this._log('INFO', `  ${sym.symbol} ${sym.direction}: ${s.trades}T | ${s.wins}W ${s.losses}L | ${(s.trades > 0 ? (s.wins/s.trades*100).toFixed(1) : 'N/A')}% | PnL: $${s.pnl.toFixed(2)} | Consec L: ${s.consecutiveLosses}`);
    }
  }

  async stop() {
    if (!this.running) return;
    this.running = false;

    this._log('INFO', 'Shutting down Live Bot...');

    for (const [symbol, handler] of Object.entries(this.symbolHandlers)) {
      if (handler.subscription) {
        try { handler.subscription.unsubscribe(); } catch { }
      }
    }

    await this.client.disconnect();
    this._log('INFO', 'Disconnected from Deriv');

    this._saveDailyStats();
    this._reportStatus();

    if (this.logStream) {
      this.logStream.end();
    }
    if (this.storage) {
      this.storage.close();
    }
    if (this.liveTradesDb) {
      this.liveTradesDb.close();
    }

    this._log('INFO', 'Live Bot stopped.');
    process.exit(0);
  }

  _saveDailyStats() {
    const today = new Date().toISOString().split('T')[0];
    for (const sym of this.config.symbols) {
      const s = this.dailyStats[sym.symbol];
      if (s.trades === 0) continue;
      this.liveTradesDb.prepare(`
        INSERT INTO daily_stats (date, symbol, trades, wins, losses, pnl, max_consecutive_losses)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(today, sym.symbol, s.trades, s.wins, s.losses, s.pnl, s.maxConsecutiveLosses);
    }
  }
}

function main() {
  const config = loadConfig();

  if (!config.apiToken || !config.appId) {
    console.error('ERROR: API_TOKEN and APP_ID must be set in .env');
    process.exit(1);
  }

  const bot = new LiveBot(config);

  process.on('SIGINT', () => bot.stop());
  process.on('SIGTERM', () => bot.stop());

  setInterval(() => bot._reportStatus(), ONE_HOUR_MS);

  bot.start().catch(err => {
    console.error('Bot failed:', err.message);
    process.exit(1);
  });
}

main();
