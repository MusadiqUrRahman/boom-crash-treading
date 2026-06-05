class StakeManager {
  constructor(config) {
    this.config = config;
    this.baseStake = config.baseStake || 0.50;
    this.minStake = config.minStake || 0.35;
    this.maxStake = config.maxStake || 2.00;
    this.mode = config.mode || 'fixed';
    this.riskPercent = config.riskPercent || 0.005;
    this.useMartingale = config.useMartingale === true;
    this.currentStake = this.baseStake;
    this._consecutiveLosses = 0;
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
    if (this.useMartingale) {
      stake = this.baseStake * Math.pow(1.5, this._consecutiveLosses);
    }
    return Math.max(this.minStake, Math.min(this.maxStake, stake));
  }

  _proportionalStake(accountBalance) {
    let pct = this.riskPercent;
    if (this._consecutiveLosses >= 3) {
      pct = Math.max(0.002, pct / 2);
    }
    let stake = accountBalance * pct;
    if (this.useMartingale) {
      stake *= Math.pow(1.5, this._consecutiveLosses);
    }
    return Math.max(this.minStake, Math.min(this.maxStake, stake));
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
