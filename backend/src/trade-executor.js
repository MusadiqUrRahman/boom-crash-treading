class TradeExecutor {
  constructor(config, connectionManager, logger) {
    this.config = config;
    this.connectionManager = connectionManager;
    this.logger = logger;
    this.dryRun = config.dryRun !== false;
    this._listeners = {};
    this._contractStreams = new Map();
    this._currentSignalId = null;
    this._stopped = false;
    this._slTpSet = new Set();
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

  _toContractType(direction) {
    return direction === 'PUT' ? 'MULTDOWN' : 'MULTUP';
  }

  _buildContract(direction) {
    const contractType = this._toContractType(direction);
    return {
      proposal: 1,
      contract_type: contractType,
      currency: 'USD',
      amount: this.config.stake,
      basis: 'stake',
      underlying_symbol: this.config.symbol,
      multiplier: this.config.multiplier || 100,
    };
  }

  async executeTrade(direction, price, score, scoreComponents, customStake, signalId) {
    this._currentSignalId = signalId || null;
    let effectiveStake = (typeof customStake === 'number' && customStake > 0) ? customStake : this.config.stake;

    const contractMin = this.config.contractMinStake || 0;
    if (contractMin > 0 && effectiveStake < contractMin) {
      this.logger.warn('TradeExecutor', `Stake $${effectiveStake.toFixed(2)} below contract minimum $${contractMin.toFixed(2)} — raising to minimum`);
      effectiveStake = contractMin;
    }

    const contract = this._buildContract(direction);

    if (this.dryRun) {
      const contractType = this._toContractType(direction);
      this.logger.info('TradeExecutor', `DRY-RUN ${direction} stake=${effectiveStake} symbol=${this.config.symbol} type=${contractType}`);
      this._emit('tradeExecuted', {
        success: true,
        contractId: null,
        direction,
        stake: effectiveStake,
        entryPrice: price,
        dryRun: true,
        contractType,
      });
      return {
        success: true,
        dryRun: true,
        contractId: null,
        buyPrice: effectiveStake,
        payout: 0,
        contractType,
      };
    }

    contract.amount = effectiveStake;

    if (!this.connectionManager.isAuthorized()) {
      this.logger.error('TradeExecutor', 'Cannot trade: not authorized');
      this._emit('tradeError', {
        direction, price, score, error: 'not_authorized',
        signalId: this._currentSignalId, timestamp: new Date().toISOString(),
      });
      return { success: false, error: 'not_authorized' };
    }

    try {
      this.logger.info('TradeExecutor', `Multiplier proposal: ${JSON.stringify(contract)}`);
      const proposalPromise = this.connectionManager.api.send(contract);
      const proposalResponse = await Promise.race([
        proposalPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Proposal timed out after 10s')), 10000)),
      ]);

      if (!proposalResponse || !proposalResponse.proposal) {
        const errMsg = proposalResponse?.error?.message || proposalResponse?.error?.code || 'proposal_rejected';
        const errCode = proposalResponse?.error?.code;
        this.logger.error('TradeExecutor', `Multiplier proposal rejected: ${errMsg}`);

        if (errMsg === 'not_authorized' || errCode === 'Authorization') {
          this.logger.warn('TradeExecutor', 'Not authorized after reconnect — clearing state');
        }

        this._emit('tradeError', {
          direction, price, score, error: errMsg, errorCode: errCode,
          proposalRequest: contract, signalId: this._currentSignalId, timestamp: new Date().toISOString(),
        });
        return { success: false, error: errMsg };
      }

      const proposal = proposalResponse.proposal;
      this.logger.info('TradeExecutor', `Multiplier proposal received: id=${proposal.id} ask=${proposal.ask_price} spot=${proposal.spot}`);

      this._emit('proposalReceived', {
        proposalId: proposal.id,
        askPrice: proposal.ask_price,
        payout: 0,
      });

      const buyPromise = this.connectionManager.api.send({
        buy: proposal.id,
        price: proposal.ask_price,
      });
      const buyResponse = await Promise.race([
        buyPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Buy timed out after 10s')), 10000)),
      ]);

      if (!buyResponse || !buyResponse.buy) {
        const errMsg = buyResponse?.error?.message || 'buy_rejected';
        this.logger.error('TradeExecutor', `Multiplier buy rejected: ${errMsg}`);
        this._emit('tradeError', {
          direction, price, score, error: errMsg,
          proposalId: proposal?.id, signalId: this._currentSignalId, timestamp: new Date().toISOString(),
        });
        return { success: false, error: errMsg };
      }

      const buy = buyResponse.buy;
      const contractType = this._toContractType(direction);
      this.logger.info('TradeExecutor', `Multiplier purchased: id=${buy.contract_id} price=${buy.buy_price} balance=${buy.balance_after} type=${contractType}`);

      const tradeResult = {
        success: true,
        dryRun: false,
        contractId: buy.contract_id,
        buyPrice: buy.buy_price,
        payout: 0,
        transactionId: buy.transaction_id,
        entryPrice: price,
        contractType,
      };

      this._emit('tradeExecuted', {
        success: true,
        contractId: buy.contract_id,
        direction,
        stake: buy.buy_price,
        payout: 0,
        entryPrice: price,
        dryRun: false,
        transactionId: buy.transaction_id,
        contractType,
      });

      try {
        const slTpResp = await this._setStopLossTakeProfit(buy.contract_id);
        const slTpOk = this._slTpSet.has(buy.contract_id);
        this._emit('slTpStatus', { contractId: buy.contract_id, set: slTpOk });
        if (!slTpOk) {
          this.logger.error('TradeExecutor', `SL/TP NOT confirmed for ${buy.contract_id} after retries — contract is running without server-side protection (local SL still active)`);
        }
      } catch (err) {
        this._emit('slTpStatus', { contractId: buy.contract_id, set: false });
        this.logger.error('TradeExecutor', `SL/TP setting failed for ${buy.contract_id}: ${err.message} — will retry on reconnect (local SL still active)`);
      }

      this._subscribeContract(buy.contract_id, price, contractType, buy.buy_price, this.config.multiplier);

      return tradeResult;
    } catch (err) {
      let errMsg = (err && err.message) ? err.message : (typeof err === 'string' ? err : JSON.stringify(err));

      if (errMsg.includes('not_authorized') || errMsg.includes('Authorization')) {
        this.logger.warn('TradeExecutor', `Not authorized (likely reconnect race) — will be retried on next tick`);
        return { success: false, error: 'not_authorized' };
      }

      this.logger.error('TradeExecutor', `Multiplier execution failed: ${errMsg}`);
      this._emit('tradeError', {
        direction, price, score, error: errMsg,
        signalId: this._currentSignalId, timestamp: new Date().toISOString(),
      });
      return { success: false, error: errMsg };
    }
  }

  async _setStopLossTakeProfit(contractId) {
    const stopLoss = this.config.stopLoss || 0.50;
    const takeProfit = this.config.takeProfit || 2.00;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const resp = await Promise.race([
          this.connectionManager.api.send({
            contract_update: 1,
            contract_id: contractId,
            limit_order: { stop_loss: stopLoss, take_profit: takeProfit },
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('SL/TP update timed out')), 10000)),
        ]);
        this._slTpSet.add(contractId);
        this.logger.info('TradeExecutor', `SL/TP set for ${contractId}: SL=$${stopLoss.toFixed(2)} TP=$${takeProfit.toFixed(2)}`);
        return resp;
      } catch (err) {
        const errMsg = err?.error?.message || err.message || 'unknown';
        if (attempt < MAX_RETRIES) {
          this.logger.warn('TradeExecutor', `Failed to set SL/TP for ${contractId} (attempt ${attempt}/${MAX_RETRIES}): ${errMsg} — retrying in ${RETRY_DELAY_MS}ms`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        } else {
          this.logger.warn('TradeExecutor', `Failed to set SL/TP for ${contractId} after ${MAX_RETRIES} attempts: ${errMsg}`);
          return null;
        }
      }
    }
  }

  _subscribeContract(contractId, entryPrice, contractType, stake, multiplier) {
    const entry = { entryPrice, contractType, resolved: false, subscription: null, stake: (typeof stake === 'number' && stake > 0) ? stake : this.config.stake, multiplier: multiplier || this.config.multiplier, stopLoss: this.config.stopLoss, openedAt: Date.now(), highestPnl: 0, trailDistance: parseFloat(this.config.trailDistance || '0') };
    this._contractStreams.set(contractId, entry);

    try {
      const stream = this.connectionManager.api.subscribe({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1,
      });

      const subscription = stream.subscribe({
        next: (resp) => {
          if (entry.resolved) return;
          const poc = resp?.proposal_open_contract;
          if (!poc) return;

          if (poc.is_sold) {
            entry.resolved = true;
            try { subscription.unsubscribe(); } catch {}
            this._resolveContract(contractId, poc, 'AUTO_CLOSE');
            return;
          }

          if (poc.limit_order?.stop_out?.order_amount) {
            const stopOutAmount = parseFloat(poc.limit_order.stop_out.order_amount);
            this.logger.warn('TradeExecutor', `Contract ${contractId} stop-out active: ${stopOutAmount} — selling`);
            this.sellContract(contractId).catch(err => {
              this.logger.error('TradeExecutor', `Stop-out sell failed for ${contractId}: ${err.message}`);
            });
            return;
          }

          if (entry.stopLoss && poc.profit !== undefined) {
            if (entry.openedAt && Date.now() - entry.openedAt < 1000) return;
            const currentPnl = parseFloat(poc.profit);

            // Track highest PnL for trailing stop
            if (currentPnl > entry.highestPnl) {
              entry.highestPnl = currentPnl;
            }

            // Fixed stop loss: PnL below -stopLoss
            if (currentPnl <= -entry.stopLoss) {
              this.logger.warn('TradeExecutor', `Stream SL hit: ${contractId} PnL=${currentPnl.toFixed(4)} <= -${entry.stopLoss.toFixed(2)} — selling`);
              this.sellContract(contractId).catch(err => {
                this.logger.error('TradeExecutor', `Stream SL sell failed for ${contractId}: ${err.message}`);
              });
              return;
            }

            // Trailing stop: if profit dropped by trailDistance from highest
            if (entry.trailDistance > 0 && entry.highestPnl > 0) {
              const trailTrigger = entry.highestPnl - entry.trailDistance;
              if (currentPnl <= trailTrigger) {
                this.logger.warn('TradeExecutor', `Trailing SL hit: ${contractId} PnL=${currentPnl.toFixed(4)} dropped ${(entry.highestPnl - currentPnl).toFixed(4)} from peak ${entry.highestPnl.toFixed(4)} — selling`);
                this.sellContract(contractId).catch(err => {
                  this.logger.error('TradeExecutor', `Trailing SL sell failed for ${contractId}: ${err.message}`);
                });
              }
            }
          }
        },
        error: (err) => {
          this.logger.error('TradeExecutor', `Stream error for ${contractId}: ${err.message}`);
        },
      });

      entry.subscription = subscription;
    } catch (err) {
      this.logger.warn('TradeExecutor', `Stream subscribe failed for ${contractId}, falling back to polling: ${err.message}`);
      this._startPolling(contractId, entry);
    }
  }

  _startPolling(contractId, entry) {
    const poll = async () => {
      if (entry.resolved || this._stopped) return;
      try {
        const resp = await Promise.race([
          this.connectionManager.api.send({
            proposal_open_contract: 1,
            contract_id: contractId,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Poll timeout')), 5000)),
        ]);
        const poc = resp?.proposal_open_contract;
        if (poc && poc.is_sold) {
          entry.resolved = true;
          this._resolveContract(contractId, poc, 'AUTO_CLOSE_POLL');
          return;
        }
      } catch {}
      setTimeout(poll, 1000);
    };
    setTimeout(poll, 1000);
  }

  _resolveContract(contractId, poc, exitReason) {
    const entry = this._contractStreams.get(contractId);
    if (!entry || entry.resolved) return;
    entry.resolved = true;
    this._cleanupSub(contractId);

    const buyPrice = parseFloat(poc.buy_price) || entry.entryPrice || entry.stake || 0;
    const sellPriceRaw = parseFloat(poc.sell_price);
    const sellPrice = Number.isFinite(sellPriceRaw) ? sellPriceRaw : null;

    // SINGLE SOURCE OF TRUTH: use Deriv's authoritative `profit` field.
    // Never fabricate a loss from a missing/zero sell price — that is the bug
    // that recorded phantom losses (see PNL_MISMATCH_REPORT.md). Fall back to
    // sell_price - buy_price only if Deriv's profit is genuinely absent; if BOTH
    // are absent, mark the trade UNRESOLVED (null pnl) for later reconciliation.
    const derivProfitRaw = parseFloat(poc.profit);
    let pnl;
    let derivProfit = null;
    if (Number.isFinite(derivProfitRaw)) {
      pnl = derivProfitRaw;
      derivProfit = derivProfitRaw;
    } else if (sellPrice !== null) {
      pnl = sellPrice - buyPrice;
    } else {
      pnl = null; // unknown — do NOT guess
    }

    if (pnl === null) {
      this.logger.error('TradeExecutor', `Contract ${contractId} UNRESOLVED: no Deriv profit or sell_price (exit=${exitReason}). Marking for reconciliation — NOT recording a fabricated loss.`);
      this._emit('contractResolved', {
        contractId,
        localId: null,
        win: null,
        pnl: null,
        derivProfit: null,
        entryPrice: buyPrice,
        exitPrice: poc.spot || buyPrice,
        stake: entry.stake || buyPrice,
        payout: 0,
        contractType: entry.contractType || 'MULTUP',
        entryTick: poc.date_start || 0,
        exitTick: poc.date_expiry || 0,
        exitReason: 'UNRESOLVED',
        entryEpoch: poc.date_start || Math.floor(Date.now() / 1000) - 10,
        exitEpoch: Math.floor(Date.now() / 1000),
      });
      return;
    }

    const win = pnl > 0;
    this.logger.info('TradeExecutor', `Contract ${contractId} resolved: ${win ? 'WIN' : 'LOSS'} buy=${buyPrice} sell=${sellPrice ?? 'n/a'} profit=${derivProfit ?? 'derived'} PnL=${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} exit=${exitReason}`);

    const result = {
      contractId,
      localId: null,
      win,
      pnl,
      derivProfit,
      entryPrice: buyPrice,
      exitPrice: sellPrice !== null ? sellPrice : (poc.spot || 0),
      stake: entry.stake || buyPrice,
      payout: sellPrice !== null ? sellPrice : 0,
      contractType: entry.contractType || 'MULTUP',
      entryTick: poc.date_start || 0,
      exitTick: poc.date_expiry || 0,
      exitReason,
      entryEpoch: poc.date_start || Math.floor(Date.now() / 1000) - 10,
      exitEpoch: Math.floor(Date.now() / 1000),
    };

    this._emit('contractResolved', result);
  }

  checkPerTickStopLoss(currentPrice) {
    const now = Date.now();
    for (const [contractId, entry] of this._contractStreams) {
      if (entry.resolved || !entry.stopLoss) continue;
      if (entry.openedAt && now - entry.openedAt < 1000) continue;
      const pnl = this._computePnL(currentPrice, entry);
      if (pnl <= -entry.stopLoss) {
        this.logger.warn('TradeExecutor', `SL hit: ${contractId} PnL=${pnl.toFixed(4)} <= -${entry.stopLoss.toFixed(2)} — selling`);
        this.sellContract(contractId).catch(err => {
          this.logger.error('TradeExecutor', `SL sell failed for ${contractId}: ${err.message}`);
        });
      }
    }
  }

  _computePnL(currentPrice, entry) {
    if (!entry.multiplier || !entry.entryPrice) return 0;
    const diff = entry.contractType === 'MULTDOWN'
      ? entry.entryPrice - currentPrice
      : currentPrice - entry.entryPrice;
    return entry.stake * entry.multiplier * diff / entry.entryPrice;
  }

  async sellContract(contractId) {
    const entry = this._contractStreams.get(contractId);
    if (entry && entry.resolved) {
      this.logger.info('TradeExecutor', `Contract ${contractId} already resolved — skipping sell`);
      return;
    }

    // Minimum hold time — prevent immediate sell after open (ALREADY_SOLD bug)
    const MIN_HOLD_MS = 500; // 0.5 seconds minimum
    if (entry && entry.openedAt && (Date.now() - entry.openedAt) < MIN_HOLD_MS) {
      this.logger.warn('TradeExecutor', `Contract ${contractId} too young (${Date.now() - entry.openedAt}ms < ${MIN_HOLD_MS}ms) — skipping sell`);
      return;
    }

    let sellPrice;
    try {
      const statusResp = await Promise.race([
        this.connectionManager.api.send({
          proposal_open_contract: 1,
          contract_id: contractId,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Status timed out')), 5000)),
      ]);
      sellPrice = statusResp?.proposal_open_contract?.bid_price;
      sellPrice = sellPrice ? parseFloat(sellPrice) : undefined;
    } catch {
      this.logger.warn('TradeExecutor', `Could not fetch bid price for sell: ${contractId}`);
    }

    try {
      const sellMsg = { sell: contractId };
      if (sellPrice) sellMsg.price = sellPrice;
      const resp = await Promise.race([
        this.connectionManager.api.send(sellMsg),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Sell timed out after 5s')), 5000)),
      ]);
      if (resp?.sell?.sold_for) {
        this.logger.info('TradeExecutor', `Contract ${contractId} sold for ${resp.sell.sold_for}`);
        const poc = resp?.sell?.sold_contract;
        if (poc) {
          this._resolveContract(contractId, poc, 'MANUAL_SELL');
          return;
        }
        this.logger.warn('TradeExecutor', `Sell response has no sold_contract — fetching status`);
        try {
          const status = await this.connectionManager.api.send({
            proposal_open_contract: 1,
            contract_id: contractId,
          });
          const statusPoc = status?.proposal_open_contract;
          if (statusPoc) {
            this._resolveContract(contractId, statusPoc, 'MANUAL_SELL_SOLD');
            return;
          }
        } catch (e) {
          this.logger.error('TradeExecutor', `Status fetch failed after sell: ${e.message}`);
        }
      }
    } catch (err) {
      const errMsg = (err && err.message) || (typeof err === 'string' ? err : JSON.stringify(err));
      this.logger.warn('TradeExecutor', `Sell failed for ${contractId} (may already be closed): ${errMsg}`);
    }

    try {
      const status = await Promise.race([
        this.connectionManager.api.send({
          proposal_open_contract: 1,
          contract_id: contractId,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Status check timed out after 5s')), 5000)),
      ]);
      const poc = status?.proposal_open_contract;
      if (poc && poc.is_sold) {
        this.logger.info('TradeExecutor', `Contract ${contractId} already sold — resolving from status`);
        this._resolveContract(contractId, poc, 'ALREADY_SOLD');
      } else if (poc) {
        // Not yet sold. Prefer Deriv's live `profit`; otherwise use bid_price as a
        // proxy sell price. NEVER substitute 0 (that fabricates a full-stake loss).
        // _resolveContract will mark UNRESOLVED if neither is available.
        this.logger.warn('TradeExecutor', `Contract ${contractId} not sold — force-resolving with profit=${poc.profit ?? 'n/a'} bid=${poc.bid_price ?? 'n/a'}`);
        const forcePoc = { ...poc };
        if (!Number.isFinite(parseFloat(poc.profit)) && Number.isFinite(parseFloat(poc.bid_price))) {
          forcePoc.sell_price = poc.bid_price;
        }
        this._resolveContract(contractId, forcePoc, 'FORCE_RESOLVE');
      } else {
        this.logger.error('TradeExecutor', `Contract ${contractId} cannot be resolved: sell failed, no status`);
      }
    } catch (err2) {
      this.logger.error('TradeExecutor', `Failed to get contract status for ${contractId}: ${err2.message}`);
      const entry = this._contractStreams.get(contractId);
      if (entry && !entry.resolved) {
        entry.resolved = true;
        // We genuinely do not know the outcome (Deriv unreachable). DO NOT fabricate
        // a full-stake loss — that is the bug that produced impossible records like
        // -$2.00 on a $1 stake (see PNL_MISMATCH_REPORT.md). Emit UNRESOLVED with a
        // null pnl so the reconciliation script settles it from Deriv's profit_table.
        this.logger.error('TradeExecutor', `Contract ${contractId} UNRESOLVED (status unreachable) — recording null pnl for reconciliation, NOT a fabricated loss`);
        this._emit('contractResolved', {
          contractId,
          localId: null,
          win: null,
          pnl: null,
          derivProfit: null,
          entryPrice: entry.entryPrice,
          exitPrice: entry.entryPrice,
          stake: entry.stake || this.config.stake,
          payout: 0,
          contractType: entry.contractType || 'MULTUP',
          entryTick: 0,
          exitTick: 0,
          exitReason: 'UNRESOLVED',
          entryEpoch: Math.floor(Date.now() / 1000) - 10,
          exitEpoch: Math.floor(Date.now() / 1000),
        });
        this._cleanupSub(contractId);
      }
    }
  }

  _cleanupSub(contractId) {
    const entry = this._contractStreams.get(contractId);
    if (!entry) return;
    if (entry.subscription) { try { entry.subscription.unsubscribe(); } catch {} }
    this._contractStreams.delete(contractId);
    this._slTpSet.delete(contractId);
  }

  async reconnectContracts() {
    const pending = Array.from(this._contractStreams.entries());
    if (pending.length === 0) return;

    this.logger.info('TradeExecutor', `Retrying ${pending.length} pending contracts after reconnect`);
    for (const [contractId, entry] of pending) {
      if (entry.subscription) { try { entry.subscription.unsubscribe(); } catch {} }
      this._subscribeContract(contractId, entry.entryPrice, entry.contractType, entry.stake, entry.multiplier);
      if (!this._slTpSet.has(contractId)) {
        this._setStopLossTakeProfit(contractId).catch(() => {});
      }
    }
  }

  getActiveContractIds() {
    return Array.from(this._contractStreams.keys());
  }

  hasActiveContracts() {
    return this._contractStreams.size > 0;
  }

  cleanup() {
    this._stopped = true;
    for (const [contractId] of this._contractStreams) {
      this._cleanupSub(contractId);
    }
  }
}

module.exports = TradeExecutor;
