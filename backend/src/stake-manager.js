class StakeManager {
  constructor(config) {
    this.config = config;
    this.baseStake = config.baseStake || 2.00;
    this.minStake = config.minStake || 0.35;
    this.contractMinStake = config.contractMinStake || 0;
    this.maxStake = config.maxStake || 5.00;
    this.mode = config.stakeMode || 'fixed';
    this.riskPercent = config.riskPercent || 0.005;
    this.currentStake = this.baseStake;
    this._consecutiveLosses = 0;
  }

  setContractMinStake(min) {
    if (typeof min === 'number' && min > 0) {
      this.contractMinStake = min;
    }
  }

  _effectiveMinStake() {
    return Math.max(this.minStake, this.contractMinStake);
  }

  getStake(accountBalance) {
    switch (this.mode) {
      case 'proportional':
        return this._proportionalStake(accountBalance);
      case 'fixed':
      default:
        return this._fixedStake();
    }
  }

  _fixedStake() {
    let stake = this.baseStake;
    if (this._consecutiveLosses >= 3) {
      stake = this.baseStake * 0.5;
    }
    if (this._consecutiveLosses >= 5) {
      stake = this.minStake;
    }
    return Math.max(this._effectiveMinStake(), Math.min(this.maxStake, stake));
  }

  _proportionalStake(accountBalance) {
    let pct = this.riskPercent;
    if (this._consecutiveLosses >= 3) {
      pct = Math.max(0.002, pct / 2);
    }
    let stake = accountBalance * pct;
    return Math.max(this._effectiveMinStake(), Math.min(this.maxStake, stake));
  }

  recordResult(win) {
    if (win) {
      this._consecutiveLosses = 0;
      this.currentStake = this.baseStake;
    } else {
      this._consecutiveLosses++;
    }
  }

  get consecutiveLosses() { return this._consecutiveLosses; }
}

module.exports = StakeManager;