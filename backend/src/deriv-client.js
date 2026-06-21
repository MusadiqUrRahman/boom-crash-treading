const WebSocket = require('ws');
const https = require('https');
const http = require('http');

const API_BASE = 'https://api.derivws.com';

function extractError(err) {
  if (!err) return 'unknown_error';
  if (typeof err === 'string') return err;
  if (err?.error?.message) return err.error.message;
  if (err?.message) return err.message;
  try { return JSON.stringify(err); } catch { return 'unknown_error'; }
}

function createObservable(subscribeFn) {
  return { subscribe: subscribeFn };
}

function mapMessageForNewApi(data) {
  const msg = { ...data };

  msg.req_id = msg.req_id || undefined;

  if (msg.ticks && !msg.subscribe) {
    msg.subscribe = 1;
  }

  if (msg.proposal || msg.proposal === 1) {
    if (msg.symbol && !msg.underlying_symbol) {
      msg.underlying_symbol = msg.symbol;
      delete msg.symbol;
    }
    if (msg.duration && msg.duration_unit === 't') {
      this.logger?.warn?.('DerivClient', `duration_unit "t" may not be supported by new API; duration=${msg.duration}`);
    }
  }

  if (msg.subscribe) {
    msg.subscribe = 1;
  }

  if (!msg.req_id) {
    delete msg.req_id;
  }

  return msg;
}

class DerivClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this._isNewMode = config.derivApiMode === 'new';

    this.ws = null;
    this._legacyApi = null;
    this._reqIdCounter = 0;
    this._pending = new Map();
    this._subscriptions = new Map();
    this._openHandlers = [];
    this._closeHandlers = [];
    this._messageHandlers = [];
    this._errorHandlers = [];
    this._intentionalClose = false;
    this._connected = false;
    this._authorized = false;
    this._legacySubs = [];

    this._lastAccountBalance = 0;
    this._lastAccountCurrency = 'USD';
    this._lastAccountLoginId = '';
  }

  _nextReqId() {
    return ++this._reqIdCounter;
  }

  onOpen() {
    return createObservable(({ next, error }) => {
      if (this._connected && next) next({});
      const handler = next || (() => {});
      this._openHandlers.push(handler);
      return {
        unsubscribe: () => {
          const idx = this._openHandlers.indexOf(handler);
          if (idx >= 0) this._openHandlers.splice(idx, 1);
        },
      };
    });
  }

  onClose() {
    return createObservable(({ next, error }) => {
      const handler = next || (() => {});
      this._closeHandlers.push(handler);
      return {
        unsubscribe: () => {
          const idx = this._closeHandlers.indexOf(handler);
          if (idx >= 0) this._closeHandlers.splice(idx, 1);
        },
      };
    });
  }

  onMessage() {
    return createObservable(({ next, error }) => {
      const handler = next || (() => {});
      this._messageHandlers.push(handler);
      return {
        unsubscribe: () => {
          const idx = this._messageHandlers.indexOf(handler);
          if (idx >= 0) this._messageHandlers.splice(idx, 1);
        },
      };
    });
  }

  onError() {
    return createObservable(({ next, error }) => {
      const handler = next || (() => {});
      this._errorHandlers.push(handler);
      return {
        unsubscribe: () => {
          const idx = this._errorHandlers.indexOf(handler);
          if (idx >= 0) this._errorHandlers.splice(idx, 1);
        },
      };
    });
  }

  _notifyOpen() {
    for (const h of this._openHandlers) h({});
  }

  _notifyClose(event) {
    console.log(`[DC] _notifyClose called, handlers=${this._closeHandlers.length}, intentional=${this._intentionalClose}`);
    for (const h of this._closeHandlers) {
      try { h(event || { code: 'unknown', reason: 'none' }); } catch (e) { console.log(`[DC] handler error: ${e.message}`); }
    }
  }

  _notifyMessage(data) {
    for (const h of this._messageHandlers) h(data);
  }

  _notifyError(err) {
    for (const h of this._errorHandlers) h(err);
  }

  async connect() {
    if (this._isNewMode) return this._connectNew();
    return this._connectLegacy();
  }

  _fetchJson(url, options) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const mod = parsedUrl.protocol === 'https:' ? https : http;
      const req = mod.request(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: 15000,
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              const errMsg = parsed?.errors?.[0]?.message || parsed?.error?.message || `HTTP ${res.statusCode}`;
              const errCode = parsed?.errors?.[0]?.code || parsed?.error?.code || '';
              reject(Object.assign(new Error(errMsg), { code: errCode, status: res.statusCode, body: parsed }));
            }
          } catch (e) {
            reject(Object.assign(new Error(`Invalid response (HTTP ${res.statusCode}): ${body.slice(0, 200)}`), { status: res.statusCode, rawBody: body }));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  async _getOtpUrl() {
    let accountId = this.config.derivAccountId;
    const headers = {
      'Authorization': `Bearer ${this.config.apiToken}`,
      'Deriv-App-ID': String(this.config.derivNewAppId || this.config.appId),
      'Content-Type': 'application/json',
    };

    if (!accountId) {
      this.logger.info('DerivClient', 'No account ID configured — fetching accounts');
      const accountsResp = await this._fetchJson(`${API_BASE}/trading/v1/options/accounts`, { headers });
      const accounts = accountsResp?.data?.accounts || [];

      if (accounts.length === 0) {
        this.logger.info('DerivClient', 'No accounts found — creating a demo account');
        const createResp = await this._fetchJson(`${API_BASE}/trading/v1/options/accounts`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            currency: 'USD',
            group: 'row',
            account_type: this.config.derivAccountType || 'demo',
          }),
        });

        const created = createResp?.data?.accounts?.[0] || createResp?.data;
        if (created?.id || created?.account_id) {
          accountId = created.id || created.account_id;
          this._lastAccountBalance = created.balance || 0;
          this._lastAccountCurrency = created.currency || 'USD';
          this._lastAccountLoginId = accountId;
          this.logger.info('DerivClient', `Created account: ${accountId} (balance: ${this._lastAccountBalance} ${this._lastAccountCurrency})`);
        } else {
          throw new Error('Failed to create account: ' + JSON.stringify(createResp));
        }
      } else {
        const demoAccounts = accounts.filter(a => a.type === 'demo');
        const preferred = demoAccounts[0] || accounts[0];
        accountId = preferred.id;
        this._lastAccountBalance = preferred.balance || 0;
        this._lastAccountCurrency = preferred.currency || 'USD';
        this._lastAccountLoginId = accountId;
        this.logger.info('DerivClient', `Using account: ${accountId} (type: ${preferred.type}, balance: ${this._lastAccountBalance} ${this._lastAccountCurrency})`);
      }
    }

    this.logger.info('DerivClient', `Getting OTP URL for account ${accountId}`);
    const otpResp = await this._fetchJson(`${API_BASE}/trading/v1/options/accounts/${accountId}/otp`, {
      method: 'POST',
      headers,
    });

    const url = otpResp?.data?.url;
    if (!url) {
      throw new Error('OTP response missing WebSocket URL: ' + JSON.stringify(otpResp));
    }

    this.logger.info('DerivClient', `OTP URL obtained: ${url.replace(/otp=[^&]+/, 'otp=***')}`);
    return url;
  }

  async _connectNew() {
    this._intentionalClose = false;

    const otpUrl = await this._getOtpUrl();

    return new Promise((resolve, reject) => {
      this._resolved = false;
      const timeout = setTimeout(() => {
        this._resolved = true;
        reject(new Error('WebSocket connection timed out after 15s'));
      }, 15000);

      try {
        this.ws = new WebSocket(otpUrl);

        this.ws.on('open', () => {
          clearTimeout(timeout);
          this._resolved = true;
          this._connected = true;
          this._authorized = true;
          this.logger.info('DerivClient', 'WebSocket connected and authenticated via OTP');
          this._notifyOpen();
          resolve();
        });

        this.ws.on('message', (data) => {
          let parsed;
          try {
            parsed = JSON.parse(data.toString());
          } catch {
            this.logger.warn('DerivClient', 'Failed to parse message: ' + data.toString().slice(0, 200));
            return;
          }

          const reqId = parsed.req_id || parsed.subscription?.id;
          if (reqId && this._pending.has(reqId)) {
            const p = this._pending.get(reqId);
            if (parsed.error) {
              p.reject(parsed);
            } else {
              p.resolve(parsed);
            }
            this._pending.delete(reqId);
          }

          this._notifyMessage(parsed);

          for (const [, handler] of this._subscriptions) {
            if (handler.matchMsgType && parsed.msg_type === handler.matchMsgType) {
              handler.next(parsed);
            }
            if (handler.matchSubId != null && parsed.subscription?.id != null) {
              const subId = parsed.subscription.id;
              if (subId === handler.matchSubId || String(subId) === String(handler.matchSubId)) {
                handler.next(parsed);
              }
            }
          }
        });

        this.ws.on('close', (code, reason) => {
          clearTimeout(timeout);
          this._connected = false;
          this._authorized = false;
          const closeEvent = { code: code || 'unknown', reason: (reason || '').toString() };
          this.logger.warn('DerivClient', `WebSocket closed: code=${closeEvent.code}`);
          if (!this._resolved) {
            this._resolved = true;
            reject(Object.assign(new Error(`WebSocket closed during connect: code=${code}`), { code: 'ConnectionClosed' }));
          }
          for (const [, p] of this._pending) {
            if (!p.resolved) p.reject(Object.assign(new Error('WebSocket closed'), { code: 'ConnectionClosed' }));
          }
          this._pending.clear();
          this._notifyClose(closeEvent);
        });

        this.ws.on('error', (err) => {
          clearTimeout(timeout);
          this.logger.error('DerivClient', `WebSocket error: ${err.message || err}`);
          if (!this._resolved) {
            this._resolved = true;
            reject(Object.assign(new Error(`WebSocket error during connect: ${err.message}`), { code: 'ConnectionFailed' }));
          }
          this._notifyError(err);
        });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  async _connectLegacy() {
    const DerivAPIBasic = require('@deriv/deriv-api/dist/DerivAPIBasic');

    this._legacyApi = new DerivAPIBasic({
      endpoint: this.config.endpoint,
      app_id: this.config.appId,
      lang: 'EN',
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket open timed out after 10s'));
      }, 10000);

      const openSub = this._legacyApi.onOpen().subscribe(() => {
        clearTimeout(timeout);
        this._connected = true;
        this.logger.info('DerivClient', 'Legacy WebSocket opened');
        resolve();
      });

      const closeSub = this._legacyApi.onClose().subscribe((event) => {
        this._connected = false;
        this._authorized = false;
        this._notifyClose(event);
      });

      const msgSub = this._legacyApi.onMessage().subscribe((msg) => {
        this._notifyMessage(msg);
      });

      this._legacySubs = [openSub, closeSub, msgSub];
    });
  }

  async authorize(args) {
    if (this._isNewMode) {
      this._authorized = true;
      return {
        authorize: {
          balance: this._lastAccountBalance,
          currency: this._lastAccountCurrency,
          loginid: this._lastAccountLoginId,
          email: '',
          account_list: [{ loginid: this._lastAccountLoginId, is_virtual: this.config.derivAccountType !== 'real' }],
        },
      };
    }
    if (!this._legacyApi) throw new Error('Not connected');
    const result = await this._legacyApi.authorize(args);
    this._authorized = true;
    return result;
  }

  async send(data) {
    if (this._isNewMode) return this._sendNew(data);
    if (!this._legacyApi) throw new Error('Not connected');
    return this._legacyApi.send(data);
  }

  _sendNew(data) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(Object.assign(new Error('WebSocket not connected'), { code: 'NotConnected' }));
        return;
      }

      const reqId = data.req_id || this._nextReqId();
      const mapped = mapMessageForNewApi(data);
      mapped.req_id = reqId;

      const timeout = setTimeout(() => {
        this._pending.delete(reqId);
        reject(Object.assign(new Error('Request timed out'), { code: 'Timeout' }));
      }, 15000);

      this._pending.set(reqId, {
        resolve: (resp) => { clearTimeout(timeout); resolve(resp); },
        reject: (err) => { clearTimeout(timeout); reject(err); },
      });

      try {
        this.ws.send(JSON.stringify(mapped));
      } catch (err) {
        clearTimeout(timeout);
        this._pending.delete(reqId);
        reject(err);
      }
    });
  }

  subscribe(data) {
    if (this._isNewMode) return this._subscribeNew(data);
    if (!this._legacyApi) throw new Error('Not connected');
    return this._legacyApi.subscribe(data);
  }

  _subscribeNew(data) {
    const id = data.req_id || this._nextReqId();

    return {
      subscribe: ({ next, error }) => {
        let matchMsgType = null;
        let matchSubId = null;

        if (data.ticks) matchMsgType = 'tick';
        else if (data.balance) matchMsgType = 'balance';
        else if (data.proposal) matchMsgType = 'proposal';
        else if (data.proposal_open_contract) matchSubId = id;

        const handler = { next: next || (() => {}), error: error || (() => {}), matchMsgType, matchSubId };
        const key = matchSubId || `sub_${id}`;
        this._subscriptions.set(key, handler);

        const mapped = mapMessageForNewApi(data);
        mapped.req_id = id;
        mapped.subscribe = 1;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(mapped));
        }

        return {
          unsubscribe: () => {
            this._subscriptions.delete(key);
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              const forgetId = matchSubId || id;
              this.ws.send(JSON.stringify({ forget: forgetId, req_id: this._nextReqId() }));
            }
          },
        };
      },
    };
  }

  keepAlivePing() {
    if (this._isNewMode) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try { this.ws.send(JSON.stringify({ ping: 1, req_id: this._nextReqId() })); } catch { }
      }
      return;
    }
    if (this._legacyApi) {
      try { this._legacyApi.keepAlivePing(); } catch { }
    }
  }

  disconnect() {
    this._intentionalClose = true;

    for (const s of this._legacySubs) { try { s.unsubscribe(); } catch { } }
    this._legacySubs = [];

    if (this._legacyApi) {
      try { this._legacyApi.disconnect(); } catch { }
      this._legacyApi = null;
    }

    if (this.ws) {
      try { this.ws.close(); } catch { }
      this.ws = null;
    }

    this._connected = false;
    this._authorized = false;

    for (const [, p] of this._pending) {
      if (!p.resolved) p.reject(Object.assign(new Error('Disconnected'), { code: 'Disconnected' }));
    }
    this._pending.clear();
    this._subscriptions.clear();
  }

  isConnected() { return this._connected; }
  isAuthorized() { return this._authorized && this._connected; }
}

module.exports = DerivClient;
