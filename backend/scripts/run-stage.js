const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const defaults = require('../config/backtest-defaults');
const { Optimizer } = require('../lib/optimizer');
const { splitData } = require('../lib/parameter-grid');

function parseCliArgs() {
  const args = process.argv.slice(2);
  const overrides = {};
  for (const arg of args) {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) {
      const key = match[1];
      let value = match[2];
      const num = parseFloat(value);
      if (!isNaN(num) && String(num) === value) {
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

function main() {
  const cliOverrides = parseCliArgs();
  const stageNum = cliOverrides.stage || 1;
  delete cliOverrides.stage;

  const config = { ...defaults, ...cliOverrides };

  console.log('');
  console.log(`Stage ${stageNum} Optimization: ${config.symbol} ${config.direction}`);

  const ticks = loadTicks(config.dbPath, config.symbol);
  console.log(`Ticks loaded: ${ticks.length.toLocaleString()}`);

  const splits = splitData(ticks);
  console.log(`Training: ${splits.training.length.toLocaleString()} ticks`);
  console.log(`Validation: ${splits.validation.length.toLocaleString()} ticks`);
  console.log(`Test: ${splits.test.length.toLocaleString()} ticks`);
  console.log('');

  const optimizer = new Optimizer(config, ticks);
  optimizer._startTime = Date.now();
  const result = optimizer.runStage(stageNum);

  console.log('');
  if (result.bestParams) {
    console.log(`Best params: ${JSON.stringify(result.bestParams)}`);
    console.log(`Best training WR: ${(result.bestTrainingSummary.winRate * 100).toFixed(1)}%`);
    console.log(`Best validation WR: ${result.bestValidationSummary ? (result.bestValidationSummary.winRate * 100).toFixed(1) : 'N/A'}%`);
  } else {
    console.log('No valid parameter combinations found.');
  }
  console.log('');
}

main();
