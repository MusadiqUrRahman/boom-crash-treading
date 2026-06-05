const { loadConfig } = require('../lib/config-loader');
const DerivClient = require('../lib/deriv-client');
const Storage = require('../lib/storage');
const ProgressBar = require('../lib/progress-bar');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const BATCH_SIZE = 5000;

async function downloadSymbol(client, storage, symbol, minTicks, delay) {
  const existingCount = storage.getTickCount(symbol);
  let totalTicks = existingCount;
  let oldestInDb = storage.getOldestEpoch(symbol);
  let newestInDb = storage.getNewestEpoch(symbol);
  let end = 'latest';
  let batchCount = 0;
  let consecutiveEmpty = 0;
  let cumulativeNewThisRun = 0;
  let minEpochThisRun = Infinity;

  console.log(`  Existing data: ${existingCount.toLocaleString()} ticks`);

  if (existingCount >= minTicks) {
    console.log(`  Target already met (${minTicks.toLocaleString()}). Skipping.`);
    return { symbol, totalTicks, batchCount, status: 'skipped' };
  }

  if (oldestInDb) {
    console.log(`  Existing range:  ${formatEpoch(newestInDb)} → ${formatEpoch(oldestInDb)}`);
    end = oldestInDb - 1;
  }

  const progress = new ProgressBar(`  Downloading ${symbol}`);
  progress.show(totalTicks, minTicks);

  while (totalTicks < minTicks) {
    if (batchCount > 0) {
      await sleep(delay);
    }

    let history;
    try {
      history = await client.getTickHistory(symbol, end, BATCH_SIZE);
    } catch (err) {
      console.error(`\n  Error downloading batch: ${err.message}`);
      await sleep(5000);
      continue;
    }

    const times = history.times;
    const prices = history.prices;

    if (!times || times.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 3) {
        console.log('\n  No more historical data available from API.');
        break;
      }
      end = oldestInDb ? oldestInDb - 1 : 'latest';
      continue;
    }
    consecutiveEmpty = 0;

    const batchMin = Math.min(...times);
    const batchMax = Math.max(...times);
    const batchSpanSeconds = batchMax - batchMin + 1;
    const ticksPerSecond = times.length / batchSpanSeconds;
    const windowSkip = Math.ceil(BATCH_SIZE / ticksPerSecond);

    const result = storage.insertTicks(symbol, times, prices);
    totalTicks = storage.getTickCount(symbol);

    if (result.inserted > 0) {
      minEpochThisRun = Math.min(minEpochThisRun, batchMin);
      cumulativeNewThisRun += result.inserted;
    }

    batchCount++;
    progress.show(totalTicks, minTicks);

    if (result.inserted === 0) {
      end = batchMin - windowSkip * 2;
    } else {
      end = batchMin - windowSkip;
    }

    if (result.duplicates > 0) {
      console.log(`\n  (+${result.inserted} new, ${result.duplicates} dup — range: ${formatEpoch(batchMax)} → ${formatEpoch(batchMin)}, ${batchSpanSeconds}s span @ ${ticksPerSecond.toFixed(2)} t/s, skip=${windowSkip}s)`);
    }

    if (minEpochThisRun !== Infinity && batchMax > minEpochThisRun) {
      totalTicks = storage.getTickCount(symbol);
      const remaining = minTicks - totalTicks;
      if (result.inserted < BATCH_SIZE * 0.02 || remaining > 99000) {
        console.log(`\n  ⚠ Available API history exhausted. wrapped to ${formatEpoch(batchMax)}, only ${result.inserted} new ticks.`);
        break;
      }
    }
  }

  progress.done();

  const finalCount = storage.getTickCount(symbol);
  const finalNewest = storage.getNewestEpoch(symbol);

  storage.logAcquisition(
    symbol,
    minEpochThisRun === Infinity ? null : minEpochThisRun,
    finalNewest,
    finalCount - existingCount,
    'historical'
  );

  console.log(`  \u2713 ${symbol}: ${finalCount.toLocaleString()} total ticks (+${(finalCount - existingCount).toLocaleString()} new, ${batchCount} batches)`);

  return { symbol, totalTicks: finalCount, batchCount, status: 'downloaded' };
}

function formatEpoch(epoch) {
  if (!epoch) return 'N/A';
  return new Date(epoch * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

async function main() {
  console.log('Boom/Crash Data Acquisition');
  console.log('═══════════════════════════════\n');

  const config = loadConfig();
  console.log(`Symbols:        ${config.symbols.join(', ')}`);
  console.log(`Target/symbol:  ${config.minTicksPerSymbol.toLocaleString()} ticks`);
  console.log(`Database:       ${config.dbPath}\n`);

  const storage = new Storage();
  storage.init(config.dbPath);

  const client = new DerivClient(config);
  await client.connect();
  console.log('Connected to Deriv API.\n');

  const results = [];

  for (const symbol of config.symbols) {
    console.log(`Processing ${symbol}...`);
    const result = await downloadSymbol(
      client,
      storage,
      symbol,
      config.minTicksPerSymbol,
      config.requestDelay
    );
    results.push(result);
    console.log('');
  }

  await client.disconnect();
  storage.close();

  console.log('═══════════════════════════════');
  console.log('Acquisition Complete');
  console.log('═══════════════════════════════');

  for (const r of results) {
    const statusIcon = r.totalTicks >= config.minTicksPerSymbol ? '\u2713' : '\u26A0';
    console.log(`  ${statusIcon} ${r.symbol}: ${r.totalTicks.toLocaleString()} ticks (${r.status})`);
  }
}

main().catch(err => {
  console.error('\nDownload failed:', err.message);
  process.exit(1);
});
