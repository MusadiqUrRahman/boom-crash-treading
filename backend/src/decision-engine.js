const { computeScore } = require('../lib/scoring-engine');

class DecisionEngine {
  constructor(config, riskManager, logger) {
    this.config = config;
    this.riskManager = riskManager;
    this.logger = logger;
    this.inCooldown = false;
    this.cooldownEnd = 0;
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

  evaluate(tickBuffer, indicatorValues, tickIndex) {
    if (this.inCooldown) {
      if (tickIndex < this.cooldownEnd) {
        return { action: 'SKIP', reason: 'cooldown' };
      }
      this.inCooldown = false;
    }

    const riskCheck = this.riskManager.canTrade();
    if (!riskCheck.allowed) {
      this.logger.info('DecisionEngine', `Risk block: ${riskCheck.reason}`);
      return { action: 'SKIP', reason: riskCheck.reason };
    }

    const configWithDir = { ...this.config, direction: this.config.direction };
    const result = computeScore(indicatorValues, configWithDir);
    const { score, components, direction, enter } = result;

    this.logger.info('DecisionEngine', `SCORE=${score} direction=${direction} threshold=${this.config.scoreThreshold}`);

    if (this.config.debugScores) {
      this.logger.info('DecisionEngine', `Components: ${JSON.stringify(components)}`);
    }

    if (!enter) {
      return { action: 'SKIP', reason: 'no_signal' };
    }

    const strongComponents = ['rsi', 'bb', 'momentum'].filter(k => (components[k] || 0) >= 2).length;
    if (strongComponents < 1) {
      this.logger.info('DecisionEngine', `Weak signal: only ${strongComponents} strong component(s) (need ≥1) — skipping`);
      return { action: 'SKIP', reason: 'weak_signal' };
    }

    const price = tickBuffer.length > 0 ? tickBuffer[tickBuffer.length - 1].quote : null;
    this.logger.info('DecisionEngine', `ENTER ${direction} at ${price} (score=${score})`);

    this._emit('enter', {
      direction,
      score,
      scoreComponents: components,
      price,
      tickIndex,
    });

    return { action: 'ENTER', direction, score };
  }

  startCooldown(tickIndex) {
    this.cooldownEnd = tickIndex + this.config.cooldownTicks;
    this.inCooldown = true;
    this.logger.info('DecisionEngine', `Cooldown started for ${this.config.cooldownTicks} ticks (ends at index ${this.cooldownEnd})`);
  }

  setCooldownAfterLoss(lost, tickIndex) {
    if (lost && this.config.lossCooldownMultiplier) {
      const extended = Math.round(this.config.cooldownTicks * this.config.lossCooldownMultiplier);
      this.cooldownEnd = tickIndex + extended;
      this.inCooldown = true;
      this.logger.info('DecisionEngine', `Loss cooldown extended for ${extended} ticks (ends at index ${this.cooldownEnd})`);
    }
  }
}

module.exports = DecisionEngine;
