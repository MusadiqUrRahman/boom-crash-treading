class ContractMonitor {
  constructor(logger, allowEquals = false) {
    this.logger = logger;
    this.allowEquals = allowEquals;
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

  startContract(contractId, entryPrice, entryTickIndex, durationTicks, direction, stake, payout, score, scoreComponents, contractType, stopLoss, takeProfit, entryEpoch, multiplier) {
    this._contractIdCounter++;
    const localId = `BC-${String(this._contractIdCounter).padStart(4, '0')}`;

    const hasFixedDuration = durationTicks && durationTicks > 0;
    const contract = {
      contractId,
      localId,
      direction,
      entryPrice,
      entryTickIndex,
      expiryTickIndex: hasFixedDuration ? entryTickIndex + durationTicks : null,
      currentTickIndex: entryTickIndex,
      stake,
      payout,
      score,
      scoreComponents,
      tickAtEntry: entryTickIndex,
      resolved: false,
      contractType,
      hasFixedDuration,
      entryEpoch: entryEpoch || Math.floor(Date.now() / 1000),
    };

    this.activeContracts.set(localId, contract);
    if (hasFixedDuration) {
      this.logger.info('ContractMonitor', `Contract ${localId} started: ${direction} type=${contractType} entry=${entryPrice} expiryTick=${entryTickIndex + durationTicks}`);
    } else {
      this.logger.info('ContractMonitor', `Contract ${localId} started: ${direction} type=${contractType} entry=${entryPrice} (open-ended)`);
    }
    return localId;
  }

  onTick(tick, currentTickIndex) {
    for (const [localId, contract] of this.activeContracts) {
      if (contract.resolved) continue;
      contract.currentTickIndex = currentTickIndex;

      if (contract.hasFixedDuration && currentTickIndex >= contract.expiryTickIndex) {
        this._resolveContract(localId, contract, tick);
      }
    }
  }

  resolveContract(localId, result) {
    const contract = this.activeContracts.get(localId);
    if (!contract || contract.resolved) return;

    contract.resolved = true;
    const pnlStr = (result.pnl == null) ? 'UNRESOLVED' : `${result.pnl >= 0 ? '+' : ''}${result.pnl.toFixed(4)}`;
    this.logger.info('ContractMonitor', `Contract ${localId} RESOLVED via API: ${result.win == null ? 'UNRESOLVED' : (result.win ? 'WIN' : 'LOSS')} PnL=${pnlStr}`);

    const fullResult = {
      localId,
      contractId: contract.contractId,
      direction: contract.direction,
      win: result.win,
      pnl: result.pnl,
      derivProfit: result.derivProfit ?? null,
      entryPrice: contract.entryPrice,
      exitPrice: result.exitPrice || contract.entryPrice,
      stake: contract.stake,
      payout: result.exitPrice || contract.payout,
      score: contract.score,
      scoreComponents: contract.scoreComponents,
      entryTickIndex: contract.entryTickIndex,
      durationTicks: contract.currentTickIndex - contract.entryTickIndex,
      contractType: contract.contractType,
      exitReason: result.exitReason || null,
      entryEpoch: contract.entryEpoch,
      exitEpoch: Math.floor(Date.now() / 1000),
    };

    this.activeContracts.delete(localId);
    this._emit('contractResolved', fullResult);
  }

  _resolveContract(localId, contract, currentTick) {
    contract.resolved = true;
    const exitPrice = currentTick.quote;

    // Multiplier contracts do NOT have a binary win?+payout:-stake P/L — that
    // formula fabricated phantom losses (see PNL_MISMATCH_REPORT.md). For
    // multipliers the authoritative outcome comes only from TradeExecutor reading
    // Deriv's `profit`; here we mark UNRESOLVED (null pnl) so nothing is fabricated.
    // Genuine fixed-duration BINARY contracts (CALL/PUT) keep the binary path.
    const isMultiplier = contract.contractType && contract.contractType.startsWith('MULT');

    if (isMultiplier) {
      this.logger.error('ContractMonitor', `Contract ${localId} hit tick-monitor resolution but is a multiplier — emitting UNRESOLVED (no fabricated P/L). Deriv settles this.`);
      this.activeContracts.delete(localId);
      this._emit('contractResolved', {
        localId,
        contractId: contract.contractId,
        direction: contract.direction,
        win: null,
        pnl: null,
        derivProfit: null,
        entryPrice: contract.entryPrice,
        exitPrice,
        stake: contract.stake,
        payout: 0,
        score: contract.score,
        scoreComponents: contract.scoreComponents,
        entryTickIndex: contract.entryTickIndex,
        durationTicks: contract.currentTickIndex - contract.entryTickIndex,
        contractType: contract.contractType,
        exitReason: 'UNRESOLVED',
        entryEpoch: contract.entryEpoch,
        exitEpoch: Math.floor(Date.now() / 1000),
      });
      return;
    }

    // Genuine fixed-duration binary contract (legacy/backtest path only).
    let win;
    if (contract.direction === 'CALL') {
      win = this.allowEquals ? exitPrice >= contract.entryPrice : exitPrice > contract.entryPrice;
    } else {
      win = this.allowEquals ? exitPrice <= contract.entryPrice : exitPrice < contract.entryPrice;
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
      durationTicks: contract.expiryTickIndex ? contract.expiryTickIndex - contract.entryTickIndex : contract.currentTickIndex - contract.entryTickIndex,
      contractType: contract.contractType,
      exitReason: 'TICK_RESOLVED',
      entryEpoch: contract.entryEpoch,
      exitEpoch: Math.floor(Date.now() / 1000),
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