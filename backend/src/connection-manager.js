const DerivClient = require('./deriv-client');
const dns = require('dns');

function extractError(err) {
  if (!err) return 'unknown_error';
  if (typeof err === 'string') return err;
  if (err?.error?.message) return err.error.message;
  if (err?.message) return err.message;
  try { return JSON.stringify(err); } catch { return 'unknown_error'; }
}

function extractErrorCode(err) {
  if (err?.error?.code) return err.error.code;
  return '';
}

const STATE = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  AUTHORIZED: 'AUTHORIZED',
  ERROR: 'ERROR',
};

class ConnectionManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.state = STATE.DISCONNECTED;
    this.api = null;
    this.reconnectAttempts = 0;
    this._listeners = {};
    this._pingTimer = null;
    this._intentionalDisconnect = false;
    this._rxSubscriptions = [];
    this._reconnectPending = false;
    this._wsGen = 0;
    this._dnsCache = { hostname: '', addresses: [], lastResolved: 0 };
    this._dnsTimer = null;
    this._lastErrorWasDns = false;
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

  async connect() {
    this._intentionalDisconnect = false;
    this.reconnectAttempts = 0;
    this._reconnectPending = false;
    await this._withTimeout(this._doConnect(), 30000, 'Connection timed out after 30s');
  }

  async _withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async _resolveDns(hostname) {
    // Strip protocol prefix and trailing slash/port for DNS lookup
    const cleanHost = hostname.replace(/^wss?:\/\//, '').replace(/\/.*$/, '').split(':')[0];
    if (this._dnsCache.hostname === cleanHost && this._dnsCache.addresses.length > 0
        && Date.now() - this._dnsCache.lastResolved < 60000) {
      return this._dnsCache.addresses;
    }
    for (let i = 0; i < 3; i++) {
      try {
        // Use lookup() instead of resolve4() — uses OS resolver (getaddrinfo)
        // resolve4() uses c-ares which is often blocked by Windows firewalls
        const result = await this._withTimeout(
          dns.promises.lookup(cleanHost, { family: 4 }),
          5000,
          'DNS resolution timed out'
        );
        const addrs = [result.address];
        this._dnsCache = { hostname: cleanHost, addresses: addrs, lastResolved: Date.now() };
        this._lastErrorWasDns = false;
        return addrs;
      } catch (err) {
        if (i === 2) {
          if (this._dnsCache.hostname === cleanHost && this._dnsCache.addresses.length > 0) {
            this.logger.warn('ConnectionManager', `DNS resolution failed (${err.message}) — using cached IP ${this._dnsCache.addresses[0]}`);
            return this._dnsCache.addresses;
          }
          this._lastErrorWasDns = true;
          throw err;
        }
        await new Promise(r => setTimeout(r, (i + 1) * 1000));
      }
    }
  }

  _startDnsRefresh() {
    this._stopDnsRefresh();
    this._dnsTimer = setInterval(() => {
      this._resolveDns(this.config.endpoint).catch(() => {});
    }, 60000);
  }

  _stopDnsRefresh() {
    if (this._dnsTimer) {
      clearInterval(this._dnsTimer);
      this._dnsTimer = null;
    }
  }

  async _doConnect() {
    if (this.api) {
      this.logger.info('ConnectionManager', 'Cleaning up old connection before reconnect');
      this._stopPing();
      for (const sub of this._rxSubscriptions) {
        try { sub.unsubscribe(); } catch { this.logger.debug('ConnectionManager', 'Error unsubscribing during reconnect'); }
      }
      this._rxSubscriptions = [];
      try { this.api.disconnect(); } catch { this.logger.debug('ConnectionManager', 'Error disconnecting old API during reconnect'); }
      this.api = null;
    }

    this.state = STATE.CONNECTING;
    this._emit('stateChange', this.state);

    try {
      const addrs = await this._resolveDns(this.config.endpoint);
      this.logger.info('ConnectionManager', `DNS: ${this.config.endpoint} -> ${addrs[0]}`);
    } catch (err) {
      this.logger.error('ConnectionManager', `DNS resolution failed for ${this.config.endpoint}: ${err.message}`);
      this.state = STATE.ERROR;
      this._emit('stateChange', this.state);
      this._emit('error', err);
      if (!this._intentionalDisconnect) this._startReconnect();
      return;
    }

    this.state = STATE.CONNECTING;
    this._emit('stateChange', this.state);

    const modeLabel = this.config.derivApiMode === 'new' ? 'NEW Deriv API' : 'legacy Deriv API';
    this.logger.info('ConnectionManager', `Connecting to ${modeLabel}`);
    console.log(`[CM] Connecting (${modeLabel})...`);

    try {
      console.log('[CM] Creating DerivClient...');
      this.api = new DerivClient(this.config, this.logger);
      console.log('[CM] DerivClient created, setting up subscriptions...');

      this._rxSubscriptions.push(
        this.api.onOpen().subscribe(() => {
          console.log('[CM] OPEN event received');
          this.logger.info('ConnectionManager', 'WebSocket established');
          this.state = STATE.CONNECTED;
          this._emit('stateChange', this.state);
          this._emit('connected');
        })
      );

      this._rxSubscriptions.push(
        this.api.onClose().subscribe((event) => {
          const code = event?.code ?? 'unknown';
          const reason = event?.reason ?? 'none';
          console.log(`[CM] CLOSE event received (code=${code}, reason=${reason})`);

          this.logger.warn('ConnectionManager', `WS CLOSE event: code=${code} reason=${reason} state=${this.state} intentional=${this._intentionalDisconnect} reconnectPending=${this._reconnectPending}`);

          if (this.state === STATE.AUTHORIZED || this.state === STATE.CONNECTED) {
            this.logger.warn('ConnectionManager', `WebSocket disconnected: code=${code} reason=${reason}`);
            this.state = STATE.DISCONNECTED;
            this._emit('stateChange', this.state);
            this._emit('disconnected');
            if (!this._intentionalDisconnect) {
              this.logger.warn('ConnectionManager', `Initiating reconnect (attempt ${this.reconnectAttempts + 1}/${this.config.maxReconnectAttempts})`);
              this._startReconnect();
            } else {
              this.logger.info('ConnectionManager', 'Skipping reconnect — intentional disconnect');
            }
          } else {
            this.logger.info('ConnectionManager', `Ignoring close during connection setup (state=${this.state})`);
          }
        })
      );

      this._rxSubscriptions.push(
        this.api.onMessage().subscribe((msg) => {
          this._emit('message', msg);
        })
      );

      console.log('[CM] Waiting for WebSocket to open...');
      await this.api.connect();
      console.log('[CM] WebSocket opened!');

      // Direct WS close listener (bypasses Observable subscription)
      if (this.api.ws) {
        const gen = ++this._wsGen;
        this.api.ws.on('close', (code, reason) => {
          if (gen !== this._wsGen) return; // stale WS
          console.log(`[CM] DIRECT WS CLOSE: code=${code} reason=${(reason||'').toString()} state=${this.state} intentional=${this._intentionalDisconnect}`);
          if (!this._intentionalDisconnect && (this.state === STATE.AUTHORIZED || this.state === STATE.CONNECTED)) {
            this.logger.warn('ConnectionManager', 'Direct WS close — initiating disconnect+reconnect');
            this._intentionalDisconnect = false;
            this.state = STATE.DISCONNECTED;
            this._emit('stateChange', this.state);
            this._emit('disconnected');
            this._startReconnect();
          }
        });
        console.log('[CM] Direct WS close listener installed (gen=' + gen + ')');
      }

      console.log('[CM] Authorizing...');
      this.logger.info('ConnectionManager', 'Authorizing...');
      const authResult = await this._withTimeout(
        this.api.authorize({ authorize: this.config.apiToken }),
        15000,
        'Authorization timed out after 15s'
      );
      console.log('[CM] Authorized!');

      console.log('[CM] State -> AUTHORIZED');
      this.state = STATE.AUTHORIZED;
      this.reconnectAttempts = 0;
      this._emit('stateChange', this.state);
      this._emit('authorized', authResult);
      this.logger.info('ConnectionManager', 'Authorized with Deriv API');

      this._queryContractConfig().then(cfg => {
        if (cfg) {
          this._emit('contractConfig', cfg);
        }
      }).catch(() => {});

      this._startPing();
      this._startDnsRefresh();

      if (this.config.virtualBalance > 0) {
        this.logger.info('ConnectionManager', `Virtual balance active ($${this.config.virtualBalance.toFixed(2)}) — skipping live balance subscription`);
      } else {
        try {
          const balanceSub = this.api.subscribe({ balance: 1, subscribe: 1 }).subscribe({
            next: (msg) => {
              const liveBalance = msg?.balance?.balance;
              if (typeof liveBalance === 'number') {
                this._emit('balance', liveBalance);
              }
            },
            error: (err) => {
              this.logger.warn('ConnectionManager', `Balance subscription error: ${extractError(err)}`);
            },
          });
          this._rxSubscriptions.push(balanceSub);
          this.logger.info('ConnectionManager', 'Subscribed to live balance updates');
        } catch (err) {
          this.logger.warn('ConnectionManager', `Failed to subscribe to balance: ${extractError(err)}`);
        }
      }

      console.log('[CM] Connection fully established');
    } catch (err) {
      const errMsg = extractError(err);
      const errCode = extractErrorCode(err);
      console.log(`[CM] Error: ${errCode ? `[${errCode}] ` : ''}${errMsg}`);
      this.state = STATE.ERROR;
      this._emit('stateChange', this.state);
      this.logger.error('ConnectionManager', `Connection failed: ${errCode ? `[${errCode}] ` : ''}${errMsg}`);
      this._emit('error', err);
      if (!this._intentionalDisconnect) this._startReconnect();
    }
  }

  _startReconnect() {
    if (this._intentionalDisconnect) return;
    if (this._reconnectPending) {
      this.logger.info('ConnectionManager', 'Reconnect already scheduled, skipping');
      return;
    }
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.logger.error('ConnectionManager', 'Max reconnect attempts reached');
      this.state = STATE.ERROR;
      this._emit('stateChange', this.state);
      this._emit('error', new Error('Max reconnect attempts reached'));
      return;
    }

    const dnsMultiplier = this._lastErrorWasDns ? 10 : 1;
    const baseDelay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts) * dnsMultiplier,
      this.config.reconnectMaxDelay * (this._lastErrorWasDns ? 10 : 1)
    );
    const jitter = baseDelay * (0.5 + Math.random() * 0.5);
    const delay = Math.round(jitter);
    this.reconnectAttempts++;
    this._reconnectPending = true;
    this.logger.warn('ConnectionManager', `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})${this._lastErrorWasDns ? ' [DNS error — extended backoff]' : ''}`);
    this._emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    setTimeout(() => {
      this._reconnectPending = false;
      this._doConnect();
    }, delay);
  }

  _startPing() {
    this._stopPing();
    this._pingTimer = setInterval(() => {
      if (this.api && this.state === STATE.AUTHORIZED) {
        try {
          this.api.keepAlivePing();
        } catch (e) {
          this.logger.warn('ConnectionManager', `Keepalive ping failed: ${e.message}`);
        }
      }
    }, this.config.pingInterval);
  }

  _stopPing() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  async _queryContractConfig() {
    const config = {};

    // Query proposal for min stake — use MULTDOWN/MULTUP (Multiplier)
    const ctTypesToTry = ['MULTDOWN', 'MULTUP'];
    for (const ctType of ctTypesToTry) {
      try {
        const resp = await this._withTimeout(
          this.api.send({
            proposal: 1,
            contract_type: ctType,
            currency: 'USD',
            amount: 1,
            basis: 'stake',
            underlying_symbol: this.config.symbol,
            multiplier: this.config.multiplier || 100,
          }),
          10000,
          'Min stake query timed out'
        );
        const valParams = resp?.proposal?.contract_details;
        if (valParams && valParams.minimum_stake) {
          const min = parseFloat(valParams.minimum_stake);
          if (!isNaN(min) && min > 0) {
            config.contractMinStake = min;
            this.logger.info('ConnectionManager', `Contract ${ctType} min stake from API: $${min.toFixed(2)}`);
            break;
          }
        }
      } catch (err) {
        const codeArgs = err?.error?.code_args;
        if (codeArgs && codeArgs.length > 0) {
          const min = parseFloat(codeArgs[0]);
          if (!isNaN(min) && min > 0) {
            config.contractMinStake = min;
            this.logger.info('ConnectionManager', `Contract ${ctType} min stake from error: $${min.toFixed(2)}`);
            break;
          }
        }
        this.logger.debug('ConnectionManager', `Could not get min stake for ${ctType}: ${extractError(err)}`);
      }
    }

    return Object.keys(config).length > 0 ? config : null;
  }

  async disconnect() {
    this._intentionalDisconnect = true;
    this._stopDnsRefresh();
    this._stopPing();
    for (const sub of this._rxSubscriptions) {
      try { sub.unsubscribe(); } catch { this.logger.debug('ConnectionManager', 'Error unsubscribing during disconnect'); }
    }
    this._rxSubscriptions = [];
    if (this.api) {
      try { await this.api.disconnect(); } catch { this.logger.debug('ConnectionManager', 'Error disconnecting API'); }
      this.api = null;
    }
    this.state = STATE.DISCONNECTED;
    this._emit('stateChange', this.state);
    this.logger.info('ConnectionManager', 'Disconnected');
  }

  getState() { return this.state; }
  isAuthorized() { return this.state === STATE.AUTHORIZED; }
}

module.exports = { ConnectionManager, STATE };
