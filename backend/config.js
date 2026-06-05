const path = require('path');
const fs = require('fs');
require('dotenv').config();

const BEST_PARAMS_PATH = path.join(__dirname, 'data', 'optimization-results', 'best-params.json');

function loadBestParams() {
  try {
    if (fs.existsSync(BEST_PARAMS_PATH)) {
      const raw = fs.readFileSync(BEST_PARAMS_PATH, 'utf-8');
      return JSON.parse(raw).config;
    }
  } catch {}
  return null;
}

const bestParams = loadBestParams();

function loadConfig() {
  const symbol = process.env.SYMBOL || bestParams?.symbol || 'CRASH1000';
  const isCrash = symbol.startsWith('CRASH');

  const config = {
    endpoint: process.env.DERIV_ENDPOINT || 'ws.derivws.com',
    appId: parseInt(process.env.APP_ID || '1089', 10),
    apiToken: process.env.API_TOKEN || '',
    symbol,
    direction: isCrash ? 'CALL' : 'PUT',

    dryRun: process.env.DRY_RUN !== 'false',
    debugScores: process.env.DEBUG_SCORES === 'true',

    payoutRate: parseFloat(process.env.PAYOUT_RATE || bestParams?.payoutRate || '0.85'),
    stake: parseFloat(process.env.STAKE || bestParams?.stake || '0.50'),
    allowEquals: (process.env.ALLOW_EQUALS || (bestParams?.allowEquals !== undefined ? bestParams.allowEquals : false)) === true,
    durationTicks: parseInt(process.env.DURATION_TICKS || bestParams?.durationTicks || '10', 10),
    cooldownTicks: parseInt(process.env.COOLDOWN_TICKS || bestParams?.cooldownTicks || '5', 10),
    lossCooldownMultiplier: parseInt(process.env.LOSS_COOLDOWN_MULT || '2', 10),

    scoreThreshold: parseInt(process.env.SCORE_THRESHOLD || bestParams?.scoreThreshold || '5', 10),
    minScoreSpread: parseInt(process.env.MIN_SCORE_SPREAD || bestParams?.minScoreSpread || '2', 10),

    rsiPeriod: parseInt(process.env.RSI_PERIOD || '14', 10),
    rsiOversold: parseInt(process.env.RSI_OVERSOLD || bestParams?.rsiOversold || '35', 10),
    rsiOverbought: parseInt(process.env.RSI_OVERBOUGHT || bestParams?.rsiOverbought || '65', 10),
    bbPeriod: parseInt(process.env.BB_PERIOD || bestParams?.bbPeriod || '20', 10),
    bbStdDev: parseFloat(process.env.BB_STDDEV || bestParams?.bbStdDev || '2'),
    emaShortPeriod: parseInt(process.env.EMA_SHORT_PERIOD || bestParams?.emaShortPeriod || '5', 10),
    emaLongPeriod: parseInt(process.env.EMA_LONG_PERIOD || bestParams?.emaLongPeriod || '20', 10),
    rocPeriod: parseInt(process.env.ROC_PERIOD || bestParams?.rocPeriod || '5', 10),

    tickBufferSize: parseInt(process.env.TICK_BUFFER_SIZE || bestParams?.tickBufferSize || '200', 10),
    minTicksBeforeTrade: parseInt(process.env.MIN_TICKS_BEFORE_TRADE || bestParams?.minTicksBeforeTrade || '30', 10),

    spikeThreshold: parseFloat(process.env.SPIKE_THRESHOLD || bestParams?.spikeThreshold || '2.3'),

    maxConsecutiveLosses: parseInt(process.env.MAX_CONSECUTIVE_LOSSES || bestParams?.maxConsecutiveLosses || '5', 10),
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || bestParams?.maxDailyLoss || '10'),
    maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || bestParams?.maxDailyTrades || '100', 10),
    maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '2.00'),
    maxDailyDrawdown: parseFloat(process.env.MAX_DAILY_DRAWDOWN || '0.10'),
    startingBalance: parseFloat(process.env.STARTING_BALANCE || bestParams?.startingBalance || '100'),

    reconnectBaseDelay: parseInt(process.env.RECONNECT_BASE_DELAY || '1000', 10),
    reconnectMaxDelay: parseInt(process.env.RECONNECT_MAX_DELAY || '30000', 10),
    maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '10', 10),
    pingInterval: parseInt(process.env.PING_INTERVAL || '30000', 10),

    stakeMode: process.env.STAKE_MODE || 'fixed',
    baseStake: parseFloat(process.env.BASE_STAKE || process.env.STAKE || '0.50'),
    minStake: parseFloat(process.env.MIN_STAKE || '0.35'),
    maxStake: parseFloat(process.env.MAX_STAKE || '2.00'),
    riskPercent: parseFloat(process.env.RISK_PERCENT || '0.005'),
    useMartingale: process.env.USE_MARTINGALE === 'true',

    logDir: process.env.LOG_DIR || path.join(__dirname, 'logs'),
    dbPath: process.env.DB_PATH || './data/boom_crash_ticks.db',
    liveTradesDbPath: process.env.LIVE_TRADES_DB_PATH || './data/live_trades.db',
    storeTicks: process.env.STORE_TICKS !== 'false',
  };

  return config;
}

module.exports = { loadConfig, loadBestParams };
