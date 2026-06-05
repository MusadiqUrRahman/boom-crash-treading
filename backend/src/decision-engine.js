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

    const result = computeScore(indicatorValues, this.config);
    const { call, put, decision } = result;

    this.logger.info('DecisionEngine', `SCORE CALL=${call.total} PUT=${put.total} spread=${result.spread} threshold=${this.config.scoreThreshold}`);

    if (this.config.debugScores) {
      this.logger.debug('DecisionEngine', `CALL components: ${JSON.stringify(call.components)} PUT components: ${JSON.stringify(put.components)}`);
    }

    if (!decision.enter) {
      return { action: 'SKIP', reason: 'no_signal' };
    }

    const price = tickBuffer.length > 0 ? tickBuffer[tickBuffer.length - 1].quote : null;
    this.logger.info('DecisionEngine', `ENTER ${decision.direction} at ${price} (score=${decision.direction === 'CALL' ? call.total : put.total})`);

    this._emit('enter', {
      direction: decision.direction,
      score: decision.direction === 'CALL' ? call.total : put.total,
      scoreComponents: decision.direction === 'CALL' ? call.components : put.components,
      price,
      tickIndex,
    });

    return { action: 'ENTER', direction: decision.direction, score: decision.direction === 'CALL' ? call.total : put.total };
  }

  startCooldown(tickIndex) {
    const ticks = this.inCooldown ? this.config.cooldownTicks * 2 : this.config.cooldownTicks;
    this.cooldownEnd = tickIndex + ticks;
    this.inCooldown = true;
    this.logger.info('DecisionEngine', `Cooldown started for ${ticks} ticks (ends at index ${this.cooldownEnd})`);
  }

  setCooldownAfterLoss(lost) {
    if (lost && this.config.lossCooldownMultiplier) {
      this.inCooldown = true;
    }
  }
}

module.exports = DecisionEngine;
