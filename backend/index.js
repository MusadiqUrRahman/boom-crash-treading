const readline = require('readline');
const path = require('path');
const { loadConfig } = require('./config');
const { Bot, BOT_STATE } = require('./src/bot');
const { createLogger } = require('./logging-config');
const HealthMonitor = require('./src/health-monitor');
const AlertManager = require('./src/alert-manager');
const SessionReporter = require('./src/session-reporter');

console.log('Boom Crash Trading Bot starting...');

function printConfig(config, logger) {
  logger.info('Config', '=== Bot Configuration ===');
  logger.info('Config', `Symbol:       ${config.symbol}`);
  logger.info('Config', `Direction:    ${config.direction}`);
  logger.info('Config', `Mode:         ${config.dryRun ? 'DRY-RUN' : 'LIVE'}`);
  logger.info('Config', `Stake:        $${config.stake.toFixed(2)}`);
  logger.info('Config', `Duration:     ${config.durationTicks} ticks`);
  logger.info('Config', `Score thresh: ${config.scoreThreshold}`);
  logger.info('Config', `Cooldown:     ${config.cooldownTicks} ticks`);
  logger.info('Config', `RSI:          ${config.rsiPeriod} (os=${config.rsiOversold}, ob=${config.rsiOverbought})`);
  logger.info('Config', `BB:           ${config.bbPeriod}/${config.bbStdDev}std`);
  logger.info('Config', `EMA:          ${config.emaShortPeriod}/${config.emaLongPeriod}`);
  logger.info('Config', `ROC:          ${config.rocPeriod}`);
  logger.info('Config', `Spike thresh: ${config.spikeThreshold}`);
  logger.info('Config', `Payout rate:  ${(config.payoutRate * 100).toFixed(0)}%`);
  logger.info('Config', `RL:           ${config.maxConsecutiveLosses} cons, $${config.maxDailyLoss}/d, ${config.maxDailyTrades}/d`);
  logger.info('Config', `Endpoint:     ${config.endpoint}`);
  logger.info('Config', '========================');
}

async function main() {
  console.log('[1] Loading config...');
  const config = loadConfig();
  console.log('[2] Config loaded. Symbol=' + config.symbol + ' dryRun=' + config.dryRun + ' logDir=' + config.logDir);
  const logLevel = process.env.LOG_LEVEL || 'INFO';
  console.log('[3] Creating logger...');
  const logger = createLogger({ level: logLevel, logDir: config.logDir });
  console.log('[4] Logger created');

  if (!config.apiToken) {
    logger.error('Config', 'API_TOKEN is required. Set it in .env file or environment.');
    process.exit(1);
  }

  console.log('[5] Printing config...');
  printConfig(config, logger);
  console.log('[6] Config printed');

  console.log('[7] Creating bot...');
  const bot = new Bot(config, logger);
  console.log('[8] Bot created');
  console.log('[9] Creating alert/health/reporter...');
  const alertManager = new AlertManager(config, logger);
  const healthMonitor = new HealthMonitor(bot, logger, parseInt(process.env.HEALTH_PORT || '3456', 10));
  const sessionReporter = new SessionReporter(config, logger);
  console.log('[10] All created');

  let lastAlertBalance = config.startingBalance || 100;
  let lastConsecutiveLossAlert = 0;

  bot.riskManager._onBalanceChange = (oldBal, newBal) => {
    if (oldBal <= 0) return;
    const change = Math.abs(newBal - oldBal) / oldBal;
    if (change > 0.05) {
      alertManager.send('INFO', 'RiskManager',
        `Balance change: $${newBal.toFixed(2)} (${((newBal - oldBal) / oldBal * 100).toFixed(1)}%)`,
        { oldBalance: oldBal, newBalance: newBal }
      );
    }
  };

  const originalRecordTrade = bot.riskManager.recordTrade.bind(bot.riskManager);
  bot.riskManager.recordTrade = (result) => {
    const oldBal = bot.riskManager.currentBalance;
    originalRecordTrade(result);

    if (bot.riskManager.consecutiveLosses >= 3 && bot.riskManager.consecutiveLosses !== lastConsecutiveLossAlert) {
      lastConsecutiveLossAlert = bot.riskManager.consecutiveLosses;
      alertManager.alertConsecutiveLosses(bot.riskManager.consecutiveLosses);
    }

    if (bot.riskManager.consecutiveLosses >= config.maxConsecutiveLosses) {
      alertManager.alertStopped(`MAX_CONSECUTIVE_LOSSES (${bot.riskManager.consecutiveLosses})`);
    }

    if (bot.riskManager.dailyLoss >= config.maxDailyLoss) {
      alertManager.alertDailyLoss(bot.riskManager.dailyLoss);
    }

    if (oldBal !== bot.riskManager.currentBalance && typeof bot.riskManager._onBalanceChange === 'function') {
      bot.riskManager._onBalanceChange(oldBal, bot.riskManager.currentBalance);
    }
  };

  process.on('SIGINT', async () => {
    logger.warn('Main', 'SIGINT received — stopping bot');
    alertManager.send('WARN', 'Main', 'SIGINT received — stopping bot');
    await bot.stop();
    healthMonitor.stop();
    process.exit(0);
  });

  process.on('uncaughtException', async (err) => {
    logger.error('Main', `Uncaught exception: ${err.message}`, { stack: err.stack });
    alertManager.send('ERROR', 'Main', `Uncaught exception: ${err.message}`);
    await bot.stop().catch(() => {});
    healthMonitor.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    logger.error('Main', `Unhandled rejection: ${reason}`);
  });

  const statusInterval = setInterval(() => {
    const status = bot.getStatus();
    logger.info('Bot', `Status: ${status.state} | Ticks: ${status.tickIndex} | Active: ${status.activeContracts} | Balance: ${status.risk.balance.toFixed(2)} | Daily: ${status.risk.dailyTrades}t ${status.risk.dailyPnL >= 0 ? '+' : ''}${status.risk.dailyPnL.toFixed(2)}`);
  }, 60000);

  const reportInterval = setInterval(() => {
    const report = sessionReporter.checkAndGenerate();
    if (report) {
      logger.info('SessionReporter', `Daily report: ${report.date} ${report.trades.total}t WR=${(report.trades.winRate * 100).toFixed(1)}% PnL=$${report.account.totalPnL.toFixed(2)}`);
      alertManager.send('INFO', 'SessionReporter', `Daily report: ${report.date}`, {
        trades: report.trades.total,
        winRate: `${(report.trades.winRate * 100).toFixed(1)}%`,
        pnl: report.account.totalPnL.toFixed(2),
      });
    }
  }, 60000);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on('line', async (line) => {
    const cmd = line.trim().toLowerCase();
    if (cmd === 'stop' || cmd === 'exit' || cmd === 'quit') {
      logger.warn('Main', 'Manual stop requested');
      alertManager.send('WARN', 'Main', 'Manual stop requested');
      clearInterval(statusInterval);
      clearInterval(reportInterval);
      await bot.stop();
      healthMonitor.stop();
      process.exit(0);
    } else if (cmd === 'status') {
      const s = bot.getStatus();
      console.log(JSON.stringify(s, null, 2));
    } else if (cmd === 'health') {
      const h = bot.getHealth();
      console.log(JSON.stringify(h, null, 2));
    } else if (cmd === 'help') {
      console.log('Commands: stop, status, health, help');
    }
  });

  console.log('[15] Starting health monitor...');
  healthMonitor.start();
  console.log('[16] Health monitor started');
  alertManager.alertStarted(config);
  console.log('[17] Alert sent, starting bot...');

  try {
    console.log('[18] Calling bot.start()...');
    await bot.start();
    console.log('[19] Bot start() returned');
  } catch (err) {
    logger.error('Main', `Bot start failed: ${err.message}`);
    alertManager.send('ERROR', 'Main', `Bot start failed: ${err.message}`);
    process.exit(1);
  }
}

main();
