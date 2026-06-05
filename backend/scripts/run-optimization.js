const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const defaults = require('../config/backtest-defaults');
const { Optimizer } = require('../lib/optimizer');

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
  const config = { ...defaults, ...cliOverrides };
  const includeFineTune = cliOverrides.fineTune === true;

  const ticks = loadTicks(config.dbPath, config.symbol);

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   STRATEGY OPTIMIZATION                  ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`Symbol:     ${config.symbol}`);
  console.log(`Direction:  ${config.direction}`);
  console.log(`Ticks:      ${ticks.length.toLocaleString()}`);
  console.log(`Fine-tune:  ${includeFineTune ? 'Yes' : 'No'}`);
  console.log('');

  const optimizer = new Optimizer(config, ticks);
  optimizer.runAll(includeFineTune);
}

main();
