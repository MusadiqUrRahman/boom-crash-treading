const fs = require('fs');
const path = require('path');
const { BacktestingEngine } = require('./backtesting-engine');
const { computeMetrics } = require('./metrics-calculator');
const { getStageDefinition, generateCombinations, generateRandomCombinations, splitData } = require('./parameter-grid');

class Optimizer {
  constructor(baseConfig, ticks, options = {}) {
    this.baseConfig = { ...baseConfig };
    this.ticks = ticks;
    this.options = {
      parallel: false,
      workers: 4,
      checkpointPath: path.resolve(__dirname, '..', 'data', 'optimization-results'),
      batchSize: 100,
      ...options,
    };

    this.bestParams = { ...baseConfig };
    this.allResults = {};
    this.overfitChecks = [];

    if (!fs.existsSync(this.options.checkpointPath)) {
      fs.mkdirSync(this.options.checkpointPath, { recursive: true });
    }
  }

  evaluate(params, tickSlice) {
    const config = { ...this.baseConfig, ...params };
    const engine = new BacktestingEngine(config, tickSlice);
    const results = engine.run();

    const uniqueDays = engine.uniqueDays.size;
    const summary = computeMetrics(results.trades, uniqueDays);
    summary.ticksProcessed = results.ticksProcessed;
    summary.stoppedEarly = results.stoppedEarly;

    return summary;
  }

  evaluateOnAllSplits(params) {
    const splits = splitData(this.ticks);
    return {
      config: { ...this.baseConfig, ...params },
      training: this.evaluate(params, splits.training),
      validation: this.evaluate(params, splits.validation),
      test: this.evaluate(params, splits.test),
    };
  }

  runStage(stageNum, fixedParams) {
    const stageDef = getStageDefinition(stageNum, fixedParams);
    if (!stageDef) throw new Error(`Unknown stage: ${stageNum}`);

    const stageName = `stage-${stageNum}-${stageDef.name}`;

    let combos;
    if (stageDef.randomSamples) {
      combos = generateRandomCombinations(stageDef, stageDef.randomSamples);
    } else {
      combos = generateCombinations(stageDef);
    }

    const splits = splitData(this.ticks);
    const total = combos.length;

    console.log(`  ${stageDef.description}`);
    console.log(`  Combinations: ${total.toLocaleString()}`);
    console.log(`  Training data: ${splits.training.length.toLocaleString()} ticks`);
    console.log(`  Validation data: ${splits.validation.length.toLocaleString()} ticks`);
    console.log('');

    const results = [];
    let bestComposite = -Infinity;
    let bestParams = null;
    let consecutiveLowWr = 0;
    let checkpointCount = 0;

    const checkpointFile = path.join(this.options.checkpointPath, `${stageName}-checkpoint.json`);

    const existingCheckpoint = this._loadCheckpoint(checkpointFile);
    const startFrom = existingCheckpoint ? existingCheckpoint.completed : 0;

    if (startFrom > 0) {
      console.log(`  Resuming from checkpoint: ${startFrom} / ${total} completed`);
      results.push(...(existingCheckpoint.results || []));
      bestComposite = existingCheckpoint.bestComposite;
      bestParams = existingCheckpoint.bestParams;
    }

    const rawResults = [];

    for (let i = startFrom; i < total; i++) {
      const combo = combos[i];

      const summary = this.evaluate(combo, splits.training);

      if (summary.totalTrades < 20 || summary.winRate < 0.48) {
        consecutiveLowWr++;
        if (consecutiveLowWr >= 100 && i > total * 0.25) continue;
        continue;
      }
      consecutiveLowWr = 0;

      rawResults.push({ params: combo, summary });

      if ((i + 1) % this.options.batchSize === 0 || i === total - 1) {
        const elapsed = ((Date.now() - this._startTime) / 1000).toFixed(0);
        console.log(`    ${(i + 1).toLocaleString()} / ${total.toLocaleString()} combos evaluated (${elapsed}s elapsed, ${rawResults.length} valid)`);

        this._saveCheckpoint(checkpointFile, {
          stage: stageNum,
          completed: i + 1,
          total,
          rawCount: rawResults.length,
        });
        checkpointCount++;
      }
    }

    const globalMaxTrades = rawResults.reduce((m, r) => Math.max(m, r.summary.totalTrades), 0);
    const globalMaxDrawdown = rawResults.reduce((m, r) => Math.max(m, r.summary.maxDrawdown), 0.01);
    const tradeNormMax = Math.max(globalMaxTrades, 1);
    const ddNormMax = Math.max(globalMaxDrawdown, 0.01);

    for (const r of rawResults) {
      const s = r.summary;
      const compositeScore = (s.winRate * 0.40)
        + ((s.profitFactor !== null ? Math.min(s.profitFactor, 10) : 0) * 0.25)
        + ((s.sharpeRatio !== null ? Math.min(s.sharpeRatio, 10) : 0) * 0.15)
        + ((s.totalTrades / tradeNormMax) * 0.10)
        + ((-s.maxDrawdown / ddNormMax) * 0.10);

      results.push({
        params: r.params,
        summary: s,
        compositeScore,
      });

      if (compositeScore > bestComposite) {
        bestComposite = compositeScore;
        bestParams = r.params;
      }
    }

    results.sort((a, b) => b.compositeScore - a.compositeScore);
    const top100 = results.slice(0, 100);

    const bestResult = top100[0] || null;
    if (bestResult) {
      this.bestParams = { ...this.bestParams, ...bestResult.params };
    }

    const validationResults = [];
    if (bestResult) {
      for (const r of top100.slice(0, 10)) {
        const validSummary = this.evaluate(r.params, splits.validation);
        validationResults.push({
          params: r.params,
          trainingSummary: r.summary,
          validationSummary: validSummary,
          compositeScore: r.compositeScore,
        });
      }
    }

    const wrGap = validationResults.length > 0
      ? validationResults[0].trainingSummary.winRate - validationResults[0].validationSummary.winRate
      : null;

    const top10WinRates = validationResults.slice(0, 10).map(r => r.trainingSummary.winRate);
    const top10Mean = top10WinRates.reduce((s, v) => s + v, 0) / top10WinRates.length;
    const top10Variance = top10WinRates.length > 1
      ? Math.sqrt(top10WinRates.reduce((s, v) => s + (v - top10Mean) ** 2, 0) / (top10WinRates.length - 1))
      : 0;

    const overfitLevel = wrGap !== null
      ? (wrGap > 0.03 ? 'high' : wrGap > 0.015 ? 'medium' : 'low')
      : 'unknown';

    const overfitCheck = {
      wrGap,
      top10Variance,
      overfitLevel,
      note: wrGap > 0.03
        ? `WR gap ${(wrGap * 100).toFixed(1)}% — possible overfitting. Consider wider validation or reducing parameter count.`
        : wrGap > 0.015
          ? `WR gap ${(wrGap * 100).toFixed(1)}% — mild overfitting. Monitor in live trading.`
          : `WR gap ${(wrGap !== null ? (wrGap * 100).toFixed(1) : 'N/A')}% — low overfitting risk.`,
    };

    this.overfitChecks.push({ stage: stageNum, ...overfitCheck });

    const stageOutput = {
      stage: stageNum,
      name: stageDef.name,
      description: stageDef.description,
      dataSplit: splits.indices,
      topResults: top100.map(r => ({
        params: r.params,
        training: r.summary,
        compositeScore: r.compositeScore,
      })),
      validationResults: validationResults.map(r => ({
        params: r.params,
        training: r.trainingSummary,
        validation: r.validationSummary,
        compositeScore: r.compositeScore,
      })),
      overfitCheck,
      bestParams: bestResult ? bestResult.params : null,
      bestTrainingSummary: bestResult ? bestResult.summary : null,
      bestValidationSummary: validationResults.length > 0 ? validationResults[0].validationSummary : null,
      totalEvaluated: results.length,
      totalFiltered: total - results.length,
    };

    const outFile = path.join(this.options.checkpointPath, `${stageName}.json`);
    fs.writeFileSync(outFile, JSON.stringify(stageOutput, null, 2));

    this.allResults[stageNum] = stageOutput;

    return stageOutput;
  }

  runAll(includeFineTune) {
    this._startTime = Date.now();

    console.log('');
    console.log(`Optimizer: ${this.baseConfig.symbol} ${this.baseConfig.direction}`);
    console.log(`Data: ${this.ticks.length.toLocaleString()} ticks`);
    console.log('');

    console.log('=== Stage 1: Duration Optimization ===');
    const stage1 = this.runStage(1);
    console.log(`  Best durationTicks: ${stage1.bestParams?.durationTicks}`);
    console.log(`  Best WR: ${stage1.bestTrainingSummary ? (stage1.bestTrainingSummary.winRate * 100).toFixed(1) : 'N/A'}%`);
    console.log('');

    const fixed1 = { durationTicks: stage1.bestParams?.durationTicks };

    console.log('=== Stage 2: Score Threshold Optimization ===');
    const stage2 = this.runStage(2, fixed1);
    console.log(`  Best scoreThreshold: ${stage2.bestParams?.scoreThreshold}`);
    console.log(`  Best WR: ${stage2.bestTrainingSummary ? (stage2.bestTrainingSummary.winRate * 100).toFixed(1) : 'N/A'}%`);
    console.log('');

    const fixed2 = { ...fixed1, scoreThreshold: stage2.bestParams?.scoreThreshold };

    console.log('=== Stage 3: Indicator Optimization ===');
    const stage3 = this.runStage(3, fixed2);
    console.log(`  Best params: RSI o/s=${stage3.bestParams?.rsiOversold}, BB period=${stage3.bestParams?.bbPeriod}, etc.`);
    console.log(`  Best WR: ${stage3.bestTrainingSummary ? (stage3.bestTrainingSummary.winRate * 100).toFixed(1) : 'N/A'}%`);
    console.log('');

    const fixed3 = { ...fixed2 };
    if (stage3.bestParams) {
      Object.assign(fixed3, stage3.bestParams);
    }

    console.log('=== Stage 4: Cooldown Optimization ===');
    const stage4 = this.runStage(4, fixed3);
    console.log(`  Best cooldownTicks: ${stage4.bestParams?.cooldownTicks}`);
    console.log(`  Best WR: ${stage4.bestTrainingSummary ? (stage4.bestTrainingSummary.winRate * 100).toFixed(1) : 'N/A'}%`);
    console.log('');

    const bestAll = { ...this.baseConfig };
    if (stage4.bestParams) Object.assign(bestAll, stage4.bestParams);

    const finalEval = this.evaluateOnAllSplits(bestAll);

    const bestParamsFile = path.join(this.options.checkpointPath, 'best-params.json');
    fs.writeFileSync(bestParamsFile, JSON.stringify(finalEval, null, 2));

    this._generateConsoleReport(finalEval, [stage1, stage2, stage3, stage4], this.overfitChecks);

    return finalEval;
  }

  _generateConsoleReport(finalEval, stages, overfitChecks) {
    const s = finalEval;
    console.log('');
    console.log('========================================');
    console.log('  OPTIMIZATION COMPLETE');
    console.log('========================================');
    console.log('');
    console.log('  Best Parameters:');
    for (const [key, value] of Object.entries(s.config)) {
      if (typeof value === 'number' || typeof value === 'string') {
        console.log(`    ${key}: ${value}`);
      }
    }
    console.log('');
    console.log('  Training Performance:');
    console.log(`    Win Rate:        ${(s.training.winRate * 100).toFixed(1)}% (${s.training.wins} / ${s.training.totalTrades})`);
    console.log(`    Net Profit:      $${s.training.netProfit.toFixed(2)}`);
    console.log(`    Profit Factor:   ${s.training.profitFactor !== null ? s.training.profitFactor.toFixed(2) : 'N/A'}`);
    console.log(`    Sharpe Ratio:    ${s.training.sharpeRatio !== null ? s.training.sharpeRatio.toFixed(2) : 'N/A'}`);
    console.log(`    Max Drawdown:    $${(-s.training.maxDrawdown).toFixed(2)}`);
    console.log(`    Max Consec Loss: ${s.training.maxConsecutiveLosses}`);

    console.log('');
    console.log('  Validation Performance:');
    console.log(`    Win Rate:        ${(s.validation.winRate * 100).toFixed(1)}% (${s.validation.wins} / ${s.validation.totalTrades})`);
    console.log(`    Net Profit:      $${s.validation.netProfit.toFixed(2)}`);
    console.log(`    Profit Factor:   ${s.validation.profitFactor !== null ? s.validation.profitFactor.toFixed(2) : 'N/A'}`);
    console.log(`    Sharpe Ratio:    ${s.validation.sharpeRatio !== null ? s.validation.sharpeRatio.toFixed(2) : 'N/A'}`);

    console.log('');
    console.log('  Overfit Checks:');
    for (const oc of overfitChecks) {
      console.log(`    Stage ${oc.stage}: ${oc.overfitLevel} (WR gap: ${oc.wrGap !== null ? (oc.wrGap * 100).toFixed(1) : 'N/A'}%)`);
      console.log(`      ${oc.note}`);
    }

    console.log('');
    console.log(`  Results saved to: ${this.options.checkpointPath}`);
    console.log('');
  }

  getBestParams() {
    return this.bestParams;
  }

  _loadCheckpoint(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return data;
      }
    } catch (e) {
      // ignore corrupt checkpoints
    }
    return null;
  }

  _saveCheckpoint(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
      // ignore checkpoint write errors
    }
  }
}

module.exports = { Optimizer };
