const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');
const { buildReport } = require('./scripts/daily-report');

const ENV_PATH = path.join(__dirname, '.env');

const CONFIG_KEY_TO_ENV = {
  symbol: 'SYMBOL',
  direction: 'DIRECTION',
  stake: 'STAKE',
  stopLoss: 'STOP_LOSS',
  takeProfit: 'TAKE_PROFIT',
  multiplier: 'MULTIPLIER',
  scoreThreshold: 'SCORE_THRESHOLD',
  minTicksBeforeTrade: 'MIN_TICKS_BEFORE_TRADE',
  cooldownTicks: 'COOLDOWN_TICKS',
  maxConsecutiveLosses: 'MAX_CONSECUTIVE_LOSSES',
  maxDailyLoss: 'MAX_DAILY_LOSS',
  maxDailyTrades: 'MAX_DAILY_TRADES',
  durationTicks: 'DURATION_TICKS',
  payoutRate: 'PAYOUT_RATE',
  rsiPeriod: 'RSI_PERIOD',
  rsiOversold: 'RSI_OVERSOLD',
  rsiOverbought: 'RSI_OVERBOUGHT',
  bbPeriod: 'BB_PERIOD',
  bbStdDev: 'BB_STDDEV',
  emaShortPeriod: 'EMA_SHORT_PERIOD',
  emaLongPeriod: 'EMA_LONG_PERIOD',
  rocPeriod: 'ROC_PERIOD',
  entryCooldownTicks: 'ENTRY_COOLDOWN_TICKS',
  maxPositionTicks: 'MAX_POSITION_TICKS',
  stakeMode: 'STAKE_MODE',
  baseStake: 'BASE_STAKE',
  minStake: 'MIN_STAKE',
  maxStake: 'MAX_STAKE',
  useMartingale: 'USE_MARTINGALE',
  circuitBreakerCooldownMin: 'CIRCUIT_BREAKER_COOLDOWN_MIN',
  maxCircuitBreakerTrips: 'MAX_CIRCUIT_BREAKER_TRIPS',
  volatilityThreshold: 'VOLATILITY_THRESHOLD',
  volatilityLookbackTicks: 'VOLATILITY_LOOKBACK_TICKS',
  directionLookbackTicks: 'DIRECTION_LOOKBACK_TICKS',
  directionMinAlignment: 'DIRECTION_MIN_ALIGNMENT',
  dynamicDirection: 'DYNAMIC_DIRECTION',
  debugScores: 'DEBUG_SCORES',
};

function writeEnvFile(updates) {
  try {
    let content = fs.readFileSync(ENV_PATH, 'utf-8');
    const lines = content.split(/\r?\n/);
    const updatedKeys = new Set();

    const result = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) return line;
      const key = trimmed.slice(0, eqIdx).trim();
      if (updates[key] !== undefined) {
        updatedKeys.add(key);
        return `${key}=${String(updates[key])}`;
      }
      return line;
    });

    for (const [key, value] of Object.entries(updates)) {
      if (!updatedKeys.has(key)) {
        result.push(`${key}=${String(value)}`);
      }
    }

    fs.writeFileSync(ENV_PATH, result.join(os.EOL), 'utf-8');
    return true;
  } catch (err) {
    console.error('[WSBridge] Failed to write .env:', err.message);
    return false;
  }
}

const liveDbPath = path.join(__dirname, 'data', 'live_trades.db');
let _sharedDb = null;
function getDb() {
  if (!_sharedDb) {
    _sharedDb = new Database(liveDbPath, { readonly: true });
  }
  return _sharedDb;
}

function toCamelCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = toCamelCase(value);
  }
  return result;
}

class BotWebSocketServer {
  constructor(bot, logger, port = 3457) {
    this.bot = bot;
    this.logger = logger;
    this.port = port;
    this.wss = null;
    this.clients = new Set();
    this._statusInterval = null;
  }

  start() {
    this.wss = new WebSocket.Server({ port: this.port });
    this.wss.on('error', (err) => {
      this.logger.error('WSBridge', `WebSocket server error: ${err.message}`);
    });
    this.logger.info('WSBridge', `WebSocket server on ws://127.0.0.1:${this.port}`);

    this.wss.on('connection', (ws) => this._handleConnection(ws));
    this._subscribeToBotEvents();
    this._startStatusBroadcast();
  }

  _broadcast(type, data) {
    const msg = JSON.stringify({ type, data });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  _send(ws, type, data, requestId) {
    const msg = { type, data };
    if (requestId) msg.requestId = requestId;
    ws.send(JSON.stringify(msg));
  }

  _sanitizeConfig(config) {
    const safe = { ...config };
    delete safe.apiToken;
    delete safe.telegramBotToken;
    delete safe.TELEGRAM_BOT_TOKEN;
    return safe;
  }

  _handleConnection(ws) {
    this.clients.add(ws);
    this.logger.info('WSBridge', `Client connected (${this.clients.size} total)`);

    this._send(ws, 'status', this.bot.getStatus());
    this._send(ws, 'config', this._sanitizeConfig(this.bot.config));
    if (this.bot.tickStream && this.bot.tickStream.getPriceCount() > 0) {
      this._send(ws, 'ticks', this.bot.tickStream.getBuffer().slice(-200));
    }
    if (this.bot.indicatorEngine) {
      this._send(ws, 'indicators', this.bot.indicatorEngine.getAll());
    }
    if (this.bot.tradeLogger) {
      const recentTrades = toCamelCase(this.bot.tradeLogger.getRecentTrades(50));
      if (recentTrades.length > 0) {
        this._send(ws, 'response', { data: recentTrades });
      }
    }

    ws.on('message', (raw) => this._handleMessage(ws, raw));
    ws.on('close', () => {
      this.clients.delete(ws);
      this.logger.info('WSBridge', `Client disconnected (${this.clients.size} remaining)`);
    });
    ws.on('error', () => this.clients.delete(ws));
  }

  async _handleMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type !== 'request' || !msg.action) return;

    const { requestId, action, params } = msg;

    const handlers = {
      getRecentTrades: () => {
        const limit = (params && params.limit) || 50;
        return toCamelCase(this.bot.tradeLogger.getRecentTrades(limit));
      },
      getTodayTrades: () => {
        return toCamelCase(this.bot.tradeLogger.getTradesToday());
      },
      getDailyReport: () => {
        const now = new Date();
        const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const date = (params && params.date) || defaultDate;
        try {
          const db = getDb();
          const rows = db.prepare("SELECT * FROM trades WHERE DATE(created_at, 'localtime') = ? ORDER BY id").all(date);
          if (rows.length === 0) return [];
          const groups = {};
          for (const r of rows) {
            const key = r.symbol + '|' + r.direction;
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
          }
          return Object.values(groups).map(t => buildReport(t, date)).filter(Boolean);
        } catch {
          return [];
        }
      },
      getDailyReports: () => {
        try {
          const db = getDb();
          const dates = db.prepare("SELECT DISTINCT DATE(created_at, 'localtime') as day FROM trades ORDER BY day DESC").all();
          const all = [];
          for (const d of dates) {
            const rows = db.prepare("SELECT * FROM trades WHERE DATE(created_at, 'localtime') = ? ORDER BY id").all(d.day);
            const groups = {};
            for (const r of rows) {
              const key = r.symbol + '|' + r.direction;
              if (!groups[key]) groups[key] = [];
              groups[key].push(r);
            }
            for (const t of Object.values(groups)) {
              const report = buildReport(t, d.day);
              if (report) all.push(report);
            }
          }
          return all;
        } catch {
          this.logger.warn('WSBridge', 'Failed to query daily reports from DB');
          return [];
        }
      },
      getBacktestResults: () => {
        const date = (params && params.date) || '';
        const backtestPath = path.join(__dirname, 'data', 'backtest-results', `backtest-${date}.json`);
        try {
          return JSON.parse(fs.readFileSync(backtestPath, 'utf-8'));
        } catch {
          const dir = path.join(__dirname, 'data', 'backtest-results');
          try {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse();
            if (files.length > 0) {
              return JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf-8'));
            }
          } catch {
            this.logger.warn('WSBridge', 'Failed to read fallback backtest results');
          }
          return null;
        }
      },
      getBestParams: () => {
        const paramsPath = path.join(__dirname, 'data', 'optimization-results', 'best-params.json');
        try {
          return JSON.parse(fs.readFileSync(paramsPath, 'utf-8'));
        } catch {
          return null;
        }
      },
      getHealth: () => {
        return this.bot.getHealth();
      },
      getConfig: () => {
        return this._sanitizeConfig(this.bot.config);
      },
      getValidationResults: () => {
        const valPath = path.join(__dirname, 'data', 'validation-results', 'validation-report.json');
        try {
          return JSON.parse(fs.readFileSync(valPath, 'utf-8'));
        } catch {
          return null;
        }
      },
      getAllTrades: () => {
        const page = (params && params.page) || 1;
        const limit = (params && params.limit) || 50;
        const offset = (page - 1) * limit;
        const symbol = params && params.symbol;
        const direction = params && params.direction;
        const result = params && params.result;
        try {
          const db = getDb();
          let where = 'WHERE 1=1';
          const binds = [];
          if (symbol) { where += ' AND symbol = ?'; binds.push(symbol); }
          if (direction) { where += ' AND direction = ?'; binds.push(direction); }
          if (result === 'WIN') { where += ' AND win = 1'; }
          else if (result === 'LOSS') { where += ' AND win = 0'; }
          const total = db.prepare(`SELECT COUNT(*) as c FROM trades ${where}`).get(...binds);
          const rows = db.prepare(`SELECT * FROM trades ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...binds, limit, offset);
          return { trades: toCamelCase(rows), total: total.c, page, limit, pages: Math.ceil(total.c / limit) };
        } catch { return { trades: [], total: 0, page: 1, limit: 50, pages: 0 }; }
      },
      getTodayStats: () => {
        return this._getTodayStatsFull();
      },
      getHourlyBreakdown: () => {
        const now = new Date();
        const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const date = (params && params.date) || defaultDate;
        try {
          const db = getDb();
          const rows = db.prepare("SELECT * FROM trades WHERE DATE(created_at, 'localtime') = ? ORDER BY id").all(date);
          const hourly = {};
          for (let h = 0; h < 24; h++) hourly[h] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
          for (const r of rows) {
            const h = new Date(r.created_at + 'Z').getUTCHours();
            hourly[h].trades++;
            if (r.win) hourly[h].wins++;
            else hourly[h].losses++;
            hourly[h].pnl += r.pnl || 0;
          }
          return Object.fromEntries(
            Object.entries(hourly).map(([h, v]) => [h, { ...v, pnl: Math.round(v.pnl * 100) / 100 }])
          );
        } catch { return {}; }
      },
      getTickHistory: () => {
        const symbol = (params && params.symbol) || this.bot.config.symbol;
        const limit = (params && params.limit) || 5000;
        try {
          if (!this.bot.tickStream) return [];
          return this.bot.tickStream.getStoredTicks(symbol, limit);
        } catch {
          return [];
        }
      },
      getSignals: () => {
        const limit = (params && params.limit) || 100;
        const offset = (params && params.offset) || 0;
        try {
          return toCamelCase(this.bot.tradeLogger.getSignals(limit, offset));
        } catch {
          return [];
        }
      },
      updateConfig: async () => {
        const partial = params && params.config;
        if (!partial || typeof partial !== 'object') {
          return { success: false, error: 'config object required' };
        }
        const envUpdates = {};
        const configUpdates = {};
        for (const [key, value] of Object.entries(partial)) {
          const envKey = CONFIG_KEY_TO_ENV[key];
          if (envKey) {
            envUpdates[envKey] = value;
            configUpdates[key] = value;
          }
        }
        if (Object.keys(envUpdates).length === 0) {
          return { success: false, error: 'no valid config keys provided' };
        }
        const written = writeEnvFile(envUpdates);
        if (!written) {
          return { success: false, error: 'failed to write .env' };
        }
        if (this.bot.updateConfig) {
          this.bot.updateConfig(configUpdates);
        }
        this._broadcast('config', this._sanitizeConfig(this.bot.config));
        this.logger.info('WSBridge', `Config updated: ${Object.keys(configUpdates).join(', ')}`);
        return { success: true, updated: Object.keys(configUpdates) };
      },
      sellContract: async () => {
        const contractId = params && params.contractId;
        if (!contractId) {
          return { success: false, error: 'contractId is required' };
        }
        if (!this.bot.tradeExecutor) {
          return { success: false, error: 'TradeExecutor not available' };
        }
        try {
          const contract = this.bot.tradeExecutor._contractStreams.get(contractId);
          const wasResolved = contract ? contract.resolved : false;
          await this.bot.tradeExecutor.sellContract(contractId);
          const stillOpen = this.bot.tradeExecutor._contractStreams.has(contractId);
          return {
            success: !stillOpen,
            contractId,
            resolved: wasResolved,
            message: stillOpen ? 'Sell attempted but contract may still be open' : 'Contract sold successfully',
          };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },
      getSignalStats: () => {
        try {
          const db = getDb();
          const total = db.prepare('SELECT COUNT(*) as c FROM signals').get().c;
          const resolved = db.prepare('SELECT COUNT(*) as c FROM signals WHERE resolved = 1').get().c;
          const wins = db.prepare("SELECT COUNT(*) as c FROM signals WHERE outcome = 'WIN'").get().c;
          const losses = db.prepare("SELECT COUNT(*) as c FROM signals WHERE outcome = 'LOSS'").get().c;
          const avgScore = db.prepare('SELECT COALESCE(AVG(score), 0) as avg FROM signals').get().avg;
          return {
            total,
            resolved,
            wins,
            losses,
            winRate: resolved > 0 ? wins / resolved : 0,
            avgScore,
            pending: total - resolved,
          };
        } catch {
          return { total: 0, resolved: 0, wins: 0, losses: 0, winRate: 0, avgScore: 0, pending: 0 };
        }
      },
    };

    const handler = handlers[action];
    if (!handler) {
      this._send(ws, 'response', null, requestId);
      return;
    }

    try {
      const data = await handler();
      this._send(ws, 'response', { data }, requestId);
    } catch (err) {
      this._send(ws, 'response', { error: err.message }, requestId);
    }
  }

  _subscribeToBotEvents() {
    const bot = this.bot;

    if (bot.tickStream) {
      bot.tickStream.on('tick', (tick) => {
        this._broadcast('tick', tick);
      });
    }

    if (bot.tradeExecutor) {
      bot.on('tradeExecuted', (result) => {
        this._broadcast('tradeExecuted', result);
      });
      bot.tradeExecutor.on('tradeError', (errorInfo) => {
        this._broadcast('tradeError', errorInfo);
      });
    }

    if (bot.contractMonitor) {
      bot.contractMonitor.on('contractResolved', (result) => {
        this._broadcast('tradeResolved', result);
      });
    }

    if (bot.on) {
      bot.on('signal', (signalData) => {
        this._broadcast('signal', signalData);
      });
    }
  }

  _getTodayStatsFull() {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    try {
      const db = getDb();
      const rows = db.prepare("SELECT * FROM trades WHERE DATE(created_at, 'localtime') = ? ORDER BY id").all(today);
      const now = new Date();
      const currentHour = now.getUTCHours();
      const hourly = {};
      for (let h = 0; h < 24; h++) hourly[h] = { trades: 0, wins: 0, losses: 0, pnl: 0 };

      let thisHour = { trades: 0, wins: 0, losses: 0, pnl: 0 };
      for (const r of rows) {
        const h = new Date(r.created_at + 'Z').getUTCHours();
        hourly[h].trades++;
        if (r.win) hourly[h].wins++;
        else hourly[h].losses++;
        hourly[h].pnl += r.pnl || 0;
        if (h === currentHour) {
          thisHour.trades++;
          if (r.win) thisHour.wins++;
          else thisHour.losses++;
          thisHour.pnl += r.pnl || 0;
        }
      }

      const todayTotal = rows.length;
      const todayWins = rows.filter(r => r.win).length;
      const todayPnl = rows.reduce((s, r) => s + (r.pnl || 0), 0);

      return {
        today: { trades: todayTotal, wins: todayWins, losses: todayTotal - todayWins, pnl: Math.round(todayPnl * 100) / 100 },
        thisHour: { ...thisHour, pnl: Math.round(thisHour.pnl * 100) / 100 },
        hourly: Object.fromEntries(
          Object.entries(hourly).map(([h, v]) => [h, { ...v, pnl: Math.round(v.pnl * 100) / 100 }])
        ),
      };
    } catch {
      return { today: { trades: 0, wins: 0, losses: 0, pnl: 0 }, thisHour: { trades: 0, wins: 0, losses: 0, pnl: 0 }, hourly: {} };
    }
  }

  _startStatusBroadcast() {
    this._statusInterval = setInterval(() => {
      try {
        const status = this.bot.getStatus();
        this._broadcast('status', status);

        if (this.bot.indicatorEngine) {
          this._broadcast('indicators', this.bot.indicatorEngine.getAll());
        }
        if (this.bot.tradeLogger) {
          this._broadcast('todayStats', this._getTodayStatsFull());
        }
        this._broadcast('health', this.bot.getHealth());
      } catch (err) {
        this.logger.error('WSBridge', `Status broadcast error: ${err.message}`);
      }
    }, 2000);
  }

  stop() {
    if (this._statusInterval) {
      clearInterval(this._statusInterval);
      this._statusInterval = null;
    }
    for (const ws of this.clients) {
      try { ws.close(); } catch { this.logger.debug('WSBridge', 'Error closing client WebSocket'); }
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.logger.info('WSBridge', 'WebSocket server stopped');
  }
}

module.exports = BotWebSocketServer;
