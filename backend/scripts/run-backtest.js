const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const defaults = require('../config/backtest-defaults');
const { BacktestingEngine } = require('../lib/backtesting-engine');
const { computeMetrics } = require('../lib/metrics-calculator');

function parseCliArgs() {
  const args = process.argv.slice(2);
  const overrides = {};
  for (const arg of args) {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) {
      const key = match[1];
      let value = match[2];
      const num = Number(value);
      if (!isNaN(num) && isFinite(num)) {
        overrides[key] = num;
      } else if (value === 'true' || value === 'false') {
        overrides[key] = value === 'true';
      } else {
        overrides[key] = value;
      }
    }
  }
  return overrides;
}

function loadTicks(dbPath, symbol) {
  const resolvedDbPath = path.resolve(__dirname, '..', dbPath);
  if (!fs.existsSync(resolvedDbPath)) {
    console.error(`Database not found: ${resolvedDbPath}`);
    process.exit(1);
  }

  const db = new Database(resolvedDbPath);
  const rows = db.prepare(
    'SELECT epoch, quote FROM ticks WHERE symbol = ? ORDER BY epoch ASC'
  ).all(symbol);

  if (rows.length === 0) {
    console.error(`No ticks found for symbol: ${symbol}`);
    process.exit(1);
  }

  return rows.map(r => ({ epoch: r.epoch, quote: r.quote }));
}

function formatMoney(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${value.toFixed(2)}`;
}

function formatPct(value) {
  if (value === null || value === undefined) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value) {
  if (value === null || value === undefined) return 'N/A';
  return value.toFixed(2);
}

function main() {
  const cliOverrides = parseCliArgs();
  const config = { ...defaults, ...cliOverrides };

  console.log('');
  console.log(`Running backtest: ${config.symbol} ${config.direction} @ ${config.durationTicks} ticks`);
  console.log(`  Config: scoreThreshold=${config.scoreThreshold}, payoutRate=${formatPct(config.payoutRate)}, stake=${formatMoney(config.stake)}`);

  const ticks = loadTicks(config.dbPath, config.symbol);
  console.log(`  Ticks loaded: ${ticks.length.toLocaleString()}`);

  if (ticks.length < 1000) {
    console.error(`  ERROR: Need at least 1000 ticks (have ${ticks.length})`);
    process.exit(1);
  }

  console.log(`  Simulating...`);

  const engine = new BacktestingEngine(config, ticks);
  const startTime = Date.now();
  const results = engine.run();
  const elapsed = Date.now() - startTime;

  const uniqueDays = engine.uniqueDays;
  const summary = computeMetrics(results.trades, uniqueDays.size);

  const output = {
    config,
    summary,
    trades: results.trades,
    equityCurve: results.equityCurve,
    ticksProcessed: results.ticksProcessed,
    stoppedEarly: results.stoppedEarly,
    elapsedMs: elapsed,
    timestamp: new Date().toISOString(),
  };

  const dateStr = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve(__dirname, '..', 'data', 'backtest-results');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outFile = path.join(outDir, `backtest-${dateStr}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

  console.log(`  Completed ${results.trades.length} trades in ${ticks.length.toLocaleString()} ticks (${elapsed}ms)`);
  if (results.stoppedEarly) {
    console.log(`  ⚠ Stopped early due to risk limits at tick ${results.ticksProcessed}`);
  }
  console.log(`  ─────────────────────`);
  console.log(`  Win Rate:        ${formatPct(summary.winRate)} (${summary.wins} / ${summary.totalTrades})`);
  console.log(`  Net Profit:      ${formatMoney(summary.netProfit)}`);
  console.log(`  Profit Factor:   ${formatNumber(summary.profitFactor)}`);
  console.log(`  Sharpe Ratio:    ${formatNumber(summary.sharpeRatio)}`);
  console.log(`  Max Drawdown:    ${formatMoney(-summary.maxDrawdown)}`);
  console.log(`  Max Consec Loss: ${summary.maxConsecutiveLosses}`);
  console.log(`  Avg Win:         ${summary.avgWin !== null ? formatMoney(summary.avgWin) : 'N/A'}`);
  console.log(`  Avg Loss:        ${summary.avgLoss !== null ? formatMoney(-summary.avgLoss) : 'N/A'}`);
  console.log(`  Win/Loss Ratio:  ${formatNumber(summary.winLossRatio)}`);
  console.log(`  Trades/Day:      ${summary.tradesPerDay !== null ? summary.tradesPerDay.toFixed(1) : 'N/A'}`);
  console.log(`  Balance:         ${formatMoney(engine.accountBalance)}`);
  console.log(`  Result saved:    ${outFile}`);
  console.log('');
}

main();
