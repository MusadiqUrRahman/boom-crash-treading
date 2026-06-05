const { loadConfig } = require('../lib/config-loader');
const DerivClient = require('../lib/deriv-client');
const Storage = require('../lib/storage');

class LiveCollector {
  constructor(config) {
    this.config = config;
    this.client = new DerivClient(config);
    this.storage = new Storage();
    this.counts = {};
    this.subscriptions = [];
    this.startTime = Date.now();
    this.running = false;
  }

  async start() {
    this.storage.init(this.config.dbPath);
    await this.client.connect();

    console.log('Live Tick Collector');
    console.log('═══════════════════════════');
    console.log(`Collecting: ${this.config.symbols.join(', ')}`);
    console.log(`Database:   ${this.config.dbPath}`);
    console.log(`Target:     ${this.config.minTicksPerSymbol.toLocaleString()} ticks/symbol\n`);

    this.running = true;
    this._initialCounts = {};

    for (const symbol of this.config.symbols) {
      const existing = this.storage.getTickCount(symbol);
      this._initialCounts[symbol] = existing;
      this.counts[symbol] = 0;
      this._subscribe(symbol);
      const needed = Math.max(0, this.config.minTicksPerSymbol - existing);
      console.log(`  ${symbol}: ${existing.toLocaleString()} existing, ${needed.toLocaleString()} more needed`);
    }

    this._interval = setInterval(() => this._checkProgress(), 30000);

    process.on('SIGINT', () => this.stop());
  }

  _subscribe(symbol) {
    try {
      const observable = this.client.subscribeTicks(symbol);
      const subscription = observable.subscribe({
        next: tick => {
          if (!tick || !tick.epoch || tick.quote === undefined) return;
          this.storage.insertTicks(symbol, [tick.epoch], [tick.quote]);
          this.counts[symbol]++;
        },
        error: err => {
          console.error(`\n  ${symbol} stream error: ${err.message}`);
        },
      });
      this.subscriptions.push({ symbol, subscription });
      console.log(`  Subscribed to ${symbol}`);
    } catch (err) {
      console.error(`  Failed to subscribe to ${symbol}: ${err.message}`);
    }
  }

  async stop(autoComplete) {
    if (!this.running) return;
    this.running = false;

    if (this._interval) clearInterval(this._interval);

    for (const sub of this.subscriptions) {
      try {
        sub.subscription.unsubscribe();
      } catch {
        // ignore cleanup errors
      }
    }

    await this.client.disconnect();

    console.log('\n═══════════════════════════════');
    if (autoComplete) {
      console.log('All targets reached! Auto-stopping.');
    }
    console.log('Live Collection Stopped');
    console.log('═══════════════════════════════');
    const elapsed = ((Date.now() - this.startTime) / 1000 / 60).toFixed(1);

    for (const symbol of this.config.symbols) {
      const totalInDb = this.storage.getTickCount(symbol);
      const statusIcon = totalInDb >= this.config.minTicksPerSymbol ? '\u2713' : '\u26A0';
      console.log(`  ${statusIcon} ${symbol}: +${this.counts[symbol].toLocaleString()} this session (${totalInDb.toLocaleString()} total in DB)`);
      this.storage.logAcquisition(symbol, null, null, this.counts[symbol], 'live');
    }
    console.log(`  Duration: ${elapsed} minutes`);

    this.storage.close();
    process.exit(0);
  }

  _checkProgress() {
    const elapsed = ((Date.now() - this.startTime) / 1000 / 60).toFixed(1);
    const parts = [];
    let allDone = true;

    for (const symbol of this.config.symbols) {
      const totalInDb = this.storage.getTickCount(symbol);
      const thisSession = this.counts[symbol];
      const remaining = Math.max(0, this.config.minTicksPerSymbol - totalInDb);
      parts.push(`${symbol}: +${thisSession.toLocaleString()} (${remaining.toLocaleString()} remaining)`);
      if (remaining > 0) allDone = false;
    }

    console.log(`[${elapsed} min] ${parts.join(' | ')}`);

    if (allDone && this.running) {
      this.stop(true);
    }
  }
}

const config = loadConfig();
const collector = new LiveCollector(config);
collector.start().catch(err => {
  console.error('Live collector failed:', err.message);
  process.exit(1);
});
