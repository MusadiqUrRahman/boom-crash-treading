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

      this._setStopLossTakeProfit(buy.contract_id).catch(err => {
        this.logger.error('TradeExecutor', `Failed to set SL/TP for ${buy.contract_id}: ${err.message} — selling back`);
        this.sellContract(buy.contract_id).catch(() => {});
      });

      this._subscribeContract(buy.contract_id, price, contractType);

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
      this.logger.warn('TradeExecutor', `Failed to set SL/TP for ${contractId}: ${errMsg}`);
      return null;
    }
  }

  _subscribeContract(contractId, entryPrice, contractType) {
    const entry = { entryPrice, contractType, resolved: false, subscription: null, stake: this.config.stake };
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

    const buyPrice = parseFloat(poc.buy_price) || entry.entryPrice || 0;
    const sellPrice = parseFloat(poc.sell_price) || 0;
    const pnl = sellPrice - buyPrice;
    const win = pnl > 0;

    this.logger.info('TradeExecutor', `Contract ${contractId} resolved: ${win ? 'WIN' : 'LOSS'} buy=${buyPrice} sell=${sellPrice} PnL=${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} exit=${exitReason}`);

    const result = {
      contractId,
      localId: null,
      win,
      pnl,
      entryPrice: buyPrice,
      exitPrice: sellPrice || (poc.spot || 0),
      stake: buyPrice,
      payout: sellPrice,
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
    // Multiplier SL/TP is managed by the Deriv API via contract_update
  }

  async sellContract(contractId) {
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
        this.logger.warn('TradeExecutor', `Contract ${contractId} not sold — force-resolving with bid price ${poc.bid_price || 'unknown'}`);
        const forcePoc = { ...poc, sell_price: poc.bid_price || 0 };
        this._resolveContract(contractId, forcePoc, 'FORCE_RESOLVE');
      } else {
        this.logger.error('TradeExecutor', `Contract ${contractId} cannot be resolved: sell failed, no status`);
      }
    } catch (err2) {
      this.logger.error('TradeExecutor', `Failed to get contract status for ${contractId}: ${err2.message}`);
      const entry = this._contractStreams.get(contractId);
      if (entry && entry.entryPrice && !entry.resolved) {
        entry.resolved = true;
        this.logger.warn('TradeExecutor', `Force-resolving ${contractId} with last known data`);
        this._emit('contractResolved', {
          contractId,
          localId: null,
          win: false,
          pnl: -this.config.stake,
          entryPrice: entry.entryPrice,
          exitPrice: entry.entryPrice,
          stake: this.config.stake,
          payout: 0,
          contractType: entry.contractType || 'MULTUP',
          entryTick: 0,
          exitTick: 0,
          exitReason: 'FORCE_RESOLVE_LOCAL',
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
      this._subscribeContract(contractId, entry.entryPrice, entry.contractType);
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
