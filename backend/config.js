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
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[Config] Failed to load best params:', err.message);
    }
  }
  return null;
}

const bestParams = loadBestParams();

function resolveContractType() {
  const fromEnv = process.env.CONTRACT_TYPE;
  if (fromEnv) return fromEnv;
  const fromBest = bestParams?.contractType;
  if (fromBest) return fromBest;
  return '';
}

function resolveDirection() {
  const fromEnv = process.env.DIRECTION;
  if (fromEnv) return fromEnv;
  const symbol = process.env.SYMBOL || bestParams?.symbol || '';
  if (symbol.startsWith('CRASH')) return 'CALL';
  if (symbol.startsWith('BOOM')) return 'PUT';
  const fromBest = bestParams?.direction;
  if (fromBest) return fromBest;
  return 'PUT';
}

function loadConfig() {
  const symbol = process.env.SYMBOL || bestParams?.symbol || 'BOOM1000';

  const contractType = resolveContractType();

  const config = {
    endpoint: process.env.DERIV_ENDPOINT || 'ws.derivws.com',

    derivApiMode: process.env.DERIV_API_MODE || 'legacy',
    derivNewAppId: process.env.DERIV_NEW_APP_ID || process.env.APP_ID || '1089',
    derivAccountId: process.env.DERIV_ACCOUNT_ID || '',
    derivAccountType: process.env.DERIV_ACCOUNT_TYPE || 'demo',

    appId: parseInt(process.env.APP_ID || '1089', 10),
    apiToken: process.env.API_TOKEN || '',
    symbol,
    direction: resolveDirection(),
    dynamicDirection: process.env.DYNAMIC_DIRECTION === 'true',
    contractType,

    dryRun: process.env.DRY_RUN !== 'false',
    debugScores: process.env.DEBUG_SCORES === 'true',

    payoutRate: parseFloat(process.env.PAYOUT_RATE || bestParams?.payoutRate || '0.85'),
    stake: parseFloat(process.env.STAKE || bestParams?.stake || '2.00'),
    allowEquals: process.env.ALLOW_EQUALS === 'true' || (bestParams?.allowEquals === true),
    durationTicks: parseInt(process.env.DURATION_TICKS || bestParams?.durationTicks || '10', 10),
    cooldownTicks: parseInt(process.env.COOLDOWN_TICKS || bestParams?.cooldownTicks || '5', 10),
    lossCooldownMultiplier: parseInt(process.env.LOSS_COOLDOWN_MULT || '4', 10),

    scoreThreshold: parseInt(process.env.SCORE_THRESHOLD || bestParams?.scoreThreshold || '7', 10),

    rsiPeriod: parseInt(process.env.RSI_PERIOD || '14', 10),
    rsiOversold: parseInt(process.env.RSI_OVERSOLD || bestParams?.rsiOversold || '35', 10),
    rsiOverbought: parseInt(process.env.RSI_OVERBOUGHT || bestParams?.rsiOverbought || '65', 10),
    bbPeriod: parseInt(process.env.BB_PERIOD || bestParams?.bbPeriod || '20', 10),
    bbStdDev: parseFloat(process.env.BB_STDDEV || bestParams?.bbStdDev || '2'),
    emaShortPeriod: parseInt(process.env.EMA_SHORT_PERIOD || bestParams?.emaShortPeriod || '5', 10),
    emaLongPeriod: parseInt(process.env.EMA_LONG_PERIOD || bestParams?.emaLongPeriod || '20', 10),
    rocPeriod: parseInt(process.env.ROC_PERIOD || bestParams?.rocPeriod || '5', 10),

    emaDistanceThreshold: parseFloat(process.env.EMA_DISTANCE_THRESHOLD || bestParams?.emaDistanceThreshold || '0.002'),
    rocMagnitudeThreshold: parseFloat(process.env.ROC_MAGNITUDE_THRESHOLD || bestParams?.rocMagnitudeThreshold || '1.0'),

    tickBufferSize: parseInt(process.env.TICK_BUFFER_SIZE || bestParams?.tickBufferSize || '200', 10),
    minTicksBeforeTrade: parseInt(process.env.MIN_TICKS_BEFORE_TRADE || bestParams?.minTicksBeforeTrade || '30', 10),
    directionLookbackTicks: parseInt(process.env.DIRECTION_LOOKBACK_TICKS || '10', 10),
    directionMinAlignment: parseInt(process.env.DIRECTION_MIN_ALIGNMENT || '6', 10),

    maxConsecutiveLosses: parseInt(process.env.MAX_CONSECUTIVE_LOSSES || bestParams?.maxConsecutiveLosses || '5', 10),
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || bestParams?.maxDailyLoss || '10'),
    maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || bestParams?.maxDailyTrades || '100', 10),
    maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '5.00'),
    maxDailyDrawdown: parseFloat(process.env.MAX_DAILY_DRAWDOWN || '0.10'),
    circuitBreakerCooldownMin: parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MIN || '30', 10),
    maxCircuitBreakerTrips: parseInt(process.env.MAX_CIRCUIT_BREAKER_TRIPS || '3', 10),
    startingBalance: parseFloat(process.env.STARTING_BALANCE || bestParams?.startingBalance || '100'),
    virtualBalance: process.env.VIRTUAL_BALANCE ? parseFloat(process.env.VIRTUAL_BALANCE) : 0,

    reconnectBaseDelay: parseInt(process.env.RECONNECT_BASE_DELAY || '1000', 10),
    reconnectMaxDelay: parseInt(process.env.RECONNECT_MAX_DELAY || '30000', 10),
    maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '999', 10),
    pingInterval: parseInt(process.env.PING_INTERVAL || '30000', 10),

    stakeMode: process.env.STAKE_MODE || 'fixed',
    // Default aligned with .env template (BASE_STAKE=1.00); falls back to STAKE.
    baseStake: parseFloat(process.env.BASE_STAKE || process.env.STAKE || '1.00'),
    minStake: parseFloat(process.env.MIN_STAKE || '0.35'),
    maxStake: parseFloat(process.env.MAX_STAKE || '2.00'),
    riskPercent: parseFloat(process.env.RISK_PERCENT || '0.005'),
    useMartingale: process.env.USE_MARTINGALE === 'true',
    contractMinStake: 0,
    contractMultiplierRange: [],

    logDir: process.env.LOG_DIR || path.join(__dirname, 'logs'),
    dbPath: process.env.DB_PATH || './data/boom_crash_ticks.db',
    liveTradesDbPath: process.env.LIVE_TRADES_DB_PATH || './data/live_trades.db',
    storeTicks: process.env.STORE_TICKS !== 'false',

    multiplier: parseInt(process.env.MULTIPLIER || '500', 10),
    stopLoss: parseFloat(process.env.STOP_LOSS || '0.25'),
    takeProfit: parseFloat(process.env.TAKE_PROFIT || '0.50'),
    // Defaults aligned with .env template (MAX_ML_DURATION_TICKS=110,
    // MAX_ACCEPTABLE_LOSS=2.00) so the fallback matches live behaviour if the key
    // is ever removed from .env.
    maxMlDurationTicks: parseInt(process.env.MAX_ML_DURATION_TICKS || '110', 10),
    maxTimeoutExtensions: parseInt(process.env.MAX_TIMEOUT_EXTENSIONS || '1000', 10),
    minProfitToSell: parseFloat(process.env.MIN_PROFIT_TO_SELL || '0.50'),
    maxAcceptableLoss: parseFloat(process.env.MAX_ACCEPTABLE_LOSS || '2.00'),
    trailDistance: parseFloat(process.env.TRAIL_DISTANCE || '0'),
    volatilityThreshold: parseFloat(process.env.VOLATILITY_THRESHOLD || '300'),
    volatilityLookbackTicks: parseInt(process.env.VOLATILITY_LOOKBACK_TICKS || '10', 10),
    maxPositionTicks: parseInt(process.env.MAX_POSITION_TICKS || '110', 10),
    entryCooldownTicks: parseInt(process.env.ENTRY_COOLDOWN_TICKS || '10', 10),
  };

  return config;
}

module.exports = { loadConfig, loadBestParams };
