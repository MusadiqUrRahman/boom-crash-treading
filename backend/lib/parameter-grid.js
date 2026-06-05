const DEFAULT_SPLITS = { training: 0.6, validation: 0.2, test: 0.2 };

function getStageDefinition(stageNum, fixedParams) {
  const defs = {
    1: {
      name: 'duration',
      description: 'Stage 1: Duration Optimization',
      params: {
        durationTicks: [5, 10, 15, 20, 25, 30, 40, 50],
      },
      fixed: { scoreThreshold: 5 },
    },
    2: {
      name: 'threshold',
      description: 'Stage 2: Score Threshold Optimization',
      params: {
        scoreThreshold: [3, 4, 5, 6, 7, 8, 9],
      },
      fixed: {},
    },
    3: {
      name: 'indicators',
      description: 'Stage 3: Indicator Parameter Optimization',
      params: {
        rsiOversold: [25, 30, 35, 40, 45],
        rsiOverbought: [55, 60, 65, 70, 75],
        bbPeriod: [10, 20, 30, 40, 50],
        bbStdDev: [1.5, 2.0, 2.5, 3.0],
        emaShortPeriod: [3, 5, 7, 10],
        emaLongPeriod: [15, 20, 25, 30],
        rocPeriod: [3, 5, 10, 15],
      },
      fixed: {},
    },
    4: {
      name: 'cooldown',
      description: 'Stage 4: Cooldown Optimization',
      params: {
        cooldownTicks: [3, 5, 7, 10, 15],
      },
      fixed: {},
    },
    5: {
      name: 'fine-tune',
      description: 'Stage 5: Random Fine-Tuning',
      params: {},
      randomSamples: 500,
      fixed: {},
    },
  };

  const def = defs[stageNum];
  if (!def) return null;

  def.fixed = { ...def.fixed, ...(fixedParams || {}) };
  return def;
}

function generateCombinations(stageDef) {
  if (stageDef.randomSamples) {
    return null;
  }

  const paramNames = Object.keys(stageDef.params);
  const paramValues = paramNames.map(k => stageDef.params[k]);

  function cartesian(arrays) {
    if (arrays.length === 0) return [[]];
    const [first, ...rest] = arrays;
    const restProduct = cartesian(rest);
    const result = [];
    for (let i = 0; i < first.length; i++) {
      for (let j = 0; j < restProduct.length; j++) {
        result.push([first[i], ...restProduct[j]]);
      }
    }
    return result;
  }

  const products = cartesian(paramValues);
  return products.map(combo => {
    const params = {};
    for (let i = 0; i < paramNames.length; i++) {
      params[paramNames[i]] = combo[i];
    }
    return { ...stageDef.fixed, ...params };
  });
}

function generateRandomCombinations(stageDef, count) {
  const results = [];
  const ranges = {};
  const paramNames = Object.keys(stageDef.params);

  for (const key of paramNames) {
    const values = stageDef.params[key];
    ranges[key] = { min: Math.min(...values), max: Math.max(...values) };
  }

  for (let i = 0; i < count; i++) {
    const params = { ...stageDef.fixed };
    for (const key of paramNames) {
      const values = stageDef.params[key];
      params[key] = values[Math.floor(Math.random() * values.length)];
    }
    results.push(params);
  }

  return results;
}

function splitData(ticks, splits) {
  splits = splits || DEFAULT_SPLITS;
  const n = ticks.length;
  const trainEnd = Math.floor(n * splits.training);
  const validEnd = trainEnd + Math.floor(n * splits.validation);

  return {
    training: ticks.slice(0, trainEnd),
    validation: ticks.slice(trainEnd, validEnd),
    test: ticks.slice(validEnd),
    indices: {
      training: { from: 0, to: trainEnd - 1, count: trainEnd },
      validation: { from: trainEnd, to: validEnd - 1, count: validEnd - trainEnd },
      test: { from: validEnd, to: n - 1, count: n - validEnd },
    },
  };
}

module.exports = {
  getStageDefinition,
  generateCombinations,
  generateRandomCombinations,
  splitData,
  DEFAULT_SPLITS,
};
