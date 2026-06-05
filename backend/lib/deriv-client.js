const DerivAPIBasic = require('@deriv/deriv-api/dist/DerivAPIBasic');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class DerivClient {
  constructor(config) {
    this.config = config;
    this.api = null;
    this.connected = false;
  }

  async connect() {
    let attempt = 0;
    const maxAttempts = 5;
    let delay = 1000;

    while (attempt < maxAttempts) {
      try {
        this.api = new DerivAPIBasic({
          endpoint: this.config.endpoint,
          app_id: this.config.appId,
          lang: 'EN',
        });

        await this.api.authorize({ authorize: this.config.apiToken });
        this.connected = true;
        return;
      } catch (err) {
        attempt++;
        if (attempt >= maxAttempts) {
          throw new Error(
            `Failed to connect after ${maxAttempts} attempts: ${err.message}`
          );
        }
        console.warn(
          `Connection attempt ${attempt}/${maxAttempts} failed: ${err.message}. Retrying in ${delay}ms...`
        );
        await sleep(delay);
        delay = Math.min(delay * 2, 30000);
      }
    }
  }

  async disconnect() {
    if (this.api && this.connected) {
      try {
        await this.api.disconnect();
      } catch {
        // ignore disconnect errors
      }
      this.connected = false;
      this.api = null;
    }
  }

  async getActiveSymbols() {
    this._ensureConnected();
    return await this._withRetry(() =>
      this.api.activeSymbols({ active_symbols: 'brief' })
    );
  }

  async getTickHistory(symbol, end, count) {
    this._ensureConnected();
    return await this._withRetry(async () => {
      const response = await this.api.ticksHistory({
        ticks_history: symbol,
        end: end,
        count: count || 5000,
        style: 'ticks',
      });

      if (
        !response ||
        !response.history ||
        !response.history.times ||
        !response.history.prices
      ) {
        return { times: [], prices: [] };
      }
      return response.history;
    }, `getTickHistory(${symbol}, ${end})`);
  }

  subscribeTicks(symbol) {
    this._ensureConnected();
    return this.api.subscribe({ ticks: symbol });
  }

  isConnected() {
    return this.connected;
  }

  _ensureConnected() {
    if (!this.connected || !this.api) {
      throw new Error('Not connected to Deriv API. Call connect() first.');
    }
  }

  async _withRetry(fn, context) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.warn(
            `[${context || ''}] Attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delay}ms...`
          );
          await sleep(delay);
        }
      }
    }
    throw new Error(
      `[${context || ''}] All ${maxRetries} attempts failed: ${lastError.message}`
    );
  }
}

module.exports = DerivClient;
