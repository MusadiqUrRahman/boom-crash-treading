const DerivAPIBasic = require('@deriv/deriv-api/dist/DerivAPIBasic');

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
    await this._withTimeout(this._doConnect(), 20000, 'Connection timed out after 20s');
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

  async _doConnect() {
    if (this.api) {
      this.logger.info('ConnectionManager', 'Cleaning up old connection before reconnect');
      console.log('[CM] Cleaning up old connection...');
      this._stopPing();
      for (const sub of this._rxSubscriptions) {
        try { sub.unsubscribe(); } catch {}
      }
      this._rxSubscriptions = [];
      try { this.api.disconnect(); } catch {}
      this.api = null;
    }

    this.state = STATE.CONNECTING;
    this._emit('stateChange', this.state);
    this.logger.info('ConnectionManager', `Connecting to ${this.config.endpoint}`);
    console.log('[CM] Connecting...');

    try {
      console.log('[CM] Creating DerivAPIBasic...');
      this.api = new DerivAPIBasic({
        endpoint: this.config.endpoint,
        app_id: this.config.appId,
        lang: 'EN',
      });
      console.log('[CM] DerivAPIBasic created, setting up subscriptions...');

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
        this.api.onClose().subscribe(() => {
          console.log('[CM] CLOSE event received');
          this.logger.warn('ConnectionManager', 'WebSocket disconnected');
          this.state = STATE.DISCONNECTED;
          this._emit('stateChange', this.state);
          this._emit('disconnected');
          if (!this._intentionalDisconnect) this._startReconnect();
        })
      );

      this._rxSubscriptions.push(
        this.api.onMessage().subscribe((msg) => {
          this._emit('message', msg);
        })
      );

      console.log('[CM] Waiting for WebSocket to open...');
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket open timed out after 10s')), 10000);
        const sub = this.api.onOpen().subscribe(() => {
          clearTimeout(timeout);
          sub.unsubscribe();
          console.log('[CM] WebSocket opened!');
          resolve();
        });
        this._rxSubscriptions.push(sub);
      });

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
      this._emit('authorized');
      this.logger.info('ConnectionManager', 'Authorized with Deriv API');

      this._startPing();
      console.log('[CM] Connection fully established');
    } catch (err) {
      console.log('[CM] Error:', err.message);
      this.state = STATE.ERROR;
      this._emit('stateChange', this.state);
      this.logger.error('ConnectionManager', `Connection failed: ${err.message}`);
      this._emit('error', err);
      if (!this._intentionalDisconnect) this._startReconnect();
    }
  }

  _startReconnect() {
    if (this._intentionalDisconnect) return;
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.logger.error('ConnectionManager', 'Max reconnect attempts reached');
      this.state = STATE.ERROR;
      this._emit('stateChange', this.state);
      this._emit('error', new Error('Max reconnect attempts reached'));
      return;
    }

    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectMaxDelay
    );
    this.reconnectAttempts++;
    this.logger.warn('ConnectionManager', `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this._emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    setTimeout(() => this._doConnect(), delay);
  }

  _startPing() {
    this._stopPing();
    this._pingTimer = setInterval(() => {
      if (this.api && this.state === STATE.AUTHORIZED) {
        try {
          this.api.pong().catch(() => {});
        } catch {}
      }
    }, this.config.pingInterval);
  }

  _stopPing() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  async disconnect() {
    this._intentionalDisconnect = true;
    this._stopPing();
    for (const sub of this._rxSubscriptions) {
      try { sub.unsubscribe(); } catch {}
    }
    this._rxSubscriptions = [];
    if (this.api) {
      try { await this.api.disconnect(); } catch {}
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
