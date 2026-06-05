class ContractMonitor {
  constructor(logger) {
    this.logger = logger;
    this.activeContracts = new Map();
    this._contractIdCounter = 0;
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

  startContract(contractId, entryPrice, entryTickIndex, durationTicks, direction, stake, payout, score, scoreComponents) {
    this._contractIdCounter++;
    const localId = `BC-${String(this._contractIdCounter).padStart(4, '0')}`;

    const contract = {
      contractId,
      localId,
      direction,
      entryPrice,
      entryTickIndex,
      expiryTickIndex: entryTickIndex + durationTicks,
      currentTickIndex: entryTickIndex,
      stake,
      payout,
      score,
      scoreComponents,
      tickAtEntry: entryTickIndex,
      resolved: false,
    };

    this.activeContracts.set(localId, contract);
    this.logger.info('ContractMonitor', `Contract ${localId} started: ${direction} entry=${entryPrice} duration=${durationTicks}t`);
    return localId;
  }

  onTick(tick, currentTickIndex) {
    for (const [localId, contract] of this.activeContracts) {
      if (contract.resolved) continue;
      contract.currentTickIndex = currentTickIndex;

      if (currentTickIndex >= contract.expiryTickIndex) {
        this._resolveContract(localId, contract, tick);
      }
    }
  }

  _resolveContract(localId, contract, currentTick) {
    contract.resolved = true;
    const exitPrice = currentTick.quote;
    let win;

    if (contract.direction === 'CALL') {
      win = exitPrice >= contract.entryPrice;
    } else {
      win = exitPrice <= contract.entryPrice;
    }

    const payoutRate = contract.payout ? (contract.payout - contract.stake) / contract.stake : 0;
    const pnl = win ? contract.stake * payoutRate : -contract.stake;

    this.logger.info('ContractMonitor', `Contract ${localId} RESOLVED: ${win ? 'WIN' : 'LOSS'} (exit=${exitPrice} entry=${contract.entryPrice}) PnL=${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)}`);

    const result = {
      localId,
      contractId: contract.contractId,
      direction: contract.direction,
      win,
      pnl,
      entryPrice: contract.entryPrice,
      exitPrice,
      stake: contract.stake,
      payout: contract.payout,
      score: contract.score,
      scoreComponents: contract.scoreComponents,
      entryTickIndex: contract.entryTickIndex,
      durationTicks: contract.expiryTickIndex - contract.entryTickIndex,
    };

    this.activeContracts.delete(localId);
    this._emit('contractResolved', result);
  }

  forceResolve(localId, currentTick) {
    const contract = this.activeContracts.get(localId);
    if (contract && !contract.resolved) {
      this._resolveContract(localId, contract, currentTick);
    }
  }

  getActiveCount() { return this.activeContracts.size; }
  hasActiveContracts() { return this.activeContracts.size > 0; }
}

module.exports = ContractMonitor;
