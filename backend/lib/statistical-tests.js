function calculateBreakevenWR(payoutRate) {
  return 1 / (1 + payoutRate);
}

function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * erf);
}

function logGamma(x) {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y++;
    ser += c[j] / y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function logBinomialCoeff(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

function binomialTest(wins, total, p0) {
  if (total === 0) {
    return { pValue: null, significant: 'INSUFFICIENT_DATA', zScore: null };
  }

  const observedWR = wins / total;

  let pValue;

  if (total > 1000) {
    const z = (observedWR - p0) / Math.sqrt(p0 * (1 - p0) / total);
    pValue = 1 - normalCDF(z);
  } else {
    pValue = 0;
    for (let k = wins; k <= total; k++) {
      const logP = logBinomialCoeff(total, k)
        + k * Math.log(p0)
        + (total - k) * Math.log(1 - p0);
      pValue += Math.exp(logP);
    }
    pValue = Math.min(pValue, 1);
  }

  let significant;
  if (pValue < 0.01) {
    significant = 'HIGHLY_SIGNIFICANT';
  } else if (pValue < 0.05) {
    significant = 'SIGNIFICANT';
  } else if (pValue < 0.10) {
    significant = 'MARGINAL';
  } else {
    significant = 'NOT_SIGNIFICANT';
  }

  const zScore = (observedWR - p0) / Math.sqrt(p0 * (1 - p0) / total);

  return { pValue, significant, zScore };
}

module.exports = { binomialTest, calculateBreakevenWR, normalCDF };
