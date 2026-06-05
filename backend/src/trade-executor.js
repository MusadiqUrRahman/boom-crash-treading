class TradeExecutor {
  constructor(config, connectionManager, logger) {
    this.config = config;
    this.connectionManager = connectionManager;
    this.logger = logger;
    this.dryRun = config.dryRun !== false;
    this._listeners = {};
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

  async executeTrade(direction, price, score, scoreComponents) {
    const contract = {
      contract_type: direction,
      currency: 'USD',
      amount: this.config.stake,
      duration: this.config.durationTicks,
      duration_unit: 't',
      symbol: this.config.symbol,
      basis: 'stake',
    };

    if (this.dryRun) {
      this.logger.info('TradeExecutor', `DRY-RUN ${direction} stake=${this.config.stake} duration=${this.config.durationTicks}t symbol=${this.config.symbol}`);
      this._emit('tradeExecuted', {
        success: true,
        contractId: null,
        direction,
        stake: this.config.stake,
        entryPrice: price,
        dryRun: true,
      });
      return {
        success: true,
        dryRun: true,
        contractId: null,
        buyPrice: this.config.stake,
        payout: this.config.stake * (1 + this.config.payoutRate),
      };
    }

    if (!this.connectionManager.isAuthorized()) {
      this.logger.error('TradeExecutor', 'Cannot trade: not authorized');
      return { success: false, error: 'not_authorized' };
    }

    try {
      this.logger.info('TradeExecutor', `Proposal request: ${JSON.stringify(contract)}`);
      console.log('[TX] Sending proposal:', JSON.stringify(contract));
      const proposalPromise = this.connectionManager.api.proposal(contract);
      const proposalResponse = await Promise.race([
        proposalPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Proposal timed out after 10s')), 10000)),
      ]);
      console.log('[TX] Proposal response:', JSON.stringify(proposalResponse).slice(0, 500));

      if (!proposalResponse || !proposalResponse.proposal) {
        const errMsg = proposalResponse?.error?.message || proposalResponse?.error?.code || 'proposal_rejected';
        console.log('[TX] Proposal rejected:', errMsg, 'Full:', JSON.stringify(proposalResponse).slice(0, 500));
        this.logger.error('TradeExecutor', `Proposal rejected: ${errMsg}`, { full: JSON.stringify(proposalResponse).slice(0, 500) });
        return { success: false, error: errMsg };
      }

      const proposal = proposalResponse.proposal;
      this.logger.info('TradeExecutor', `Proposal received: id=${proposal.id} ask=${proposal.ask_price} payout=${proposal.payout}`);

      this._emit('proposalReceived', {
        proposalId: proposal.id,
        askPrice: proposal.ask_price,
        payout: proposal.payout,
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
        this.logger.error('TradeExecutor', `Buy rejected: no buy in response`);
        return { success: false, error: 'buy_rejected' };
      }

      const buy = buyResponse.buy;
      this.logger.info('TradeExecutor', `Contract purchased: id=${buy.contract_id} price=${buy.buy_price} payout=${buy.payout}`);

      const tradeResult = {
        success: true,
        dryRun: false,
        contractId: buy.contract_id,
        buyPrice: buy.buy_price,
        payout: buy.payout,
        transactionId: buy.transaction_id,
        entryPrice: price,
      };

      this._emit('tradeExecuted', {
        success: true,
        contractId: buy.contract_id,
        direction,
        stake: buy.buy_price,
        payout: buy.payout,
        entryPrice: price,
        dryRun: false,
        transactionId: buy.transaction_id,
      });

      return tradeResult;
    } catch (err) {
      const errMsg = (err && err.message) ? err.message : (typeof err === 'string' ? err : JSON.stringify(err));
      this.logger.error('TradeExecutor', `Trade execution failed: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }
}

module.exports = TradeExecutor;
