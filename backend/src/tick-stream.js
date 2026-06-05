const Storage = require('../lib/storage');

class TickStream {
  constructor(config, connectionManager, logger) {
    this.config = config;
    this.connectionManager = connectionManager;
    this.logger = logger;
    this.buffer = [];
    this.bufferSize = config.bufferSize || 200;
    this.tickCount = 0;
    this.lastEpoch = 0;
    this._subscription = null;
    this._listeners = {};
    this._storage = null;

    if (config.storeTicks !== false) {
      this._storage = new Storage();
      this._storage.init(config.dbPath);
    }
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  _emit(event, ...args) {
    if (this._listeners[event]) {
      for (const fn of this._listeners[event]) fn(...args);
    }
  }

  async start() {
    if (!this.connectionManager.isAuthorized()) {
      console.log('[TS] NOT AUTHORIZED, throwing');
      throw new Error('Cannot subscribe: not authorized');
    }

    console.log('[TS] Starting tick subscription...');
    this.logger.info('TickStream', `Subscribing to ${this.config.symbol} ticks`);
    const observable = this.connectionManager.api.subscribe({ ticks: this.config.symbol });
    console.log('[TS] Got observable, subscribing...');
    this._subscription = observable.subscribe({
      next: (data) => this._onTick(data),
      error: (err) => {
        console.log('[TS] Subscription error:', err.message);
        this.logger.error('TickStream', `Subscription error: ${err.message}`);
        this._emit('error', err);
      },
    });
    console.log('[TS] Subscribed successfully');
  }

  stop() {
    if (this._subscription) {
      try { this._subscription.unsubscribe(); } catch {}
      this._subscription = null;
    }
    if (this._storage) {
      this._storage.close();
      this._storage = null;
    }
  }

  _onTick(data) {
    const tick = data && data.tick ? data.tick : data;
    if (!tick || !tick.epoch || !tick.quote) return;

    const { epoch, quote } = tick;

    if (this.lastEpoch > 0 && epoch - this.lastEpoch > 5) {
      this.logger.warn('TickStream', `Tick gap detected: ${epoch - this.lastEpoch}s (epoch ${this.lastEpoch} -> ${epoch})`);
    }
    this.lastEpoch = epoch;

    this.buffer.push({ epoch, quote });
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }

    this.tickCount++;

    if (this._storage) {
      try {
        this._storage.insertTicks(this.config.symbol, [epoch], [quote]);
      } catch (err) {
        this.logger.error('TickStream', `Failed to store tick: ${err.message}`);
      }
    }

    this._emit('tick', { epoch, quote });

    if (this.buffer.length >= this.config.minTicksBeforeTrade && this.buffer.length === 1) {
      this._emit('bufferReady');
    }
  }

  getBuffer() { return this.buffer; }
  getPriceCount() { return this.buffer.length; }
  isReady() { return this.buffer.length >= this.config.minTicksBeforeTrade; }
  getLastPrice() { return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1].quote : null; }
}

module.exports = TickStream;
