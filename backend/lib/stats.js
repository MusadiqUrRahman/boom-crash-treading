function validateArray(arr, minLen) {
  if (!Array.isArray(arr) || arr.length < (minLen || 1)) return false;
  return arr.every(v => typeof v === 'number' && isFinite(v));
}

function mean(arr) {
  if (!validateArray(arr)) return NaN;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function median(arr) {
  if (!validateArray(arr)) return NaN;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function variance(arr) {
  if (!validateArray(arr) || arr.length < 2) return NaN;
  const m = mean(arr);
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) sumSq += (arr[i] - m) ** 2;
  return sumSq / (arr.length - 1);
}

function std(arr) {
  const v = variance(arr);
  return isNaN(v) ? NaN : Math.sqrt(v);
}

function skewness(arr) {
  if (!validateArray(arr) || arr.length < 3) return NaN;
  const m = mean(arr);
  const s = std(arr);
  if (s === 0) return NaN;
  let sumCb = 0;
  for (let i = 0; i < arr.length; i++) sumCb += ((arr[i] - m) / s) ** 3;
  return (arr.length / ((arr.length - 1) * (arr.length - 2))) * sumCb;
}

function kurtosis(arr) {
  if (!validateArray(arr) || arr.length < 4) return NaN;
  const m = mean(arr);
  const s = std(arr);
  if (s === 0) return NaN;
  let sumCq = 0;
  for (let i = 0; i < arr.length; i++) sumCq += ((arr[i] - m) / s) ** 4;
  const n = arr.length;
  const excess = (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * sumCq - (3 * (n - 1) ** 2 / ((n - 2) * (n - 3)));
  return excess;
}

function pearsonCorrelation(x, y) {
  if (!validateArray(x, 2) || !validateArray(y, 2) || x.length !== y.length) return NaN;
  const mx = mean(x), my = mean(y);
  const sx = std(x), sy = std(y);
  if (sx === 0 || sy === 0 || !isFinite(sx) || !isFinite(sy)) return NaN;
  let cov = 0;
  for (let i = 0; i < x.length; i++) cov += (x[i] - mx) * (y[i] - my);
  return cov / ((x.length - 1) * sx * sy);
}

function autocorrelation(arr, lag) {
  if (!validateArray(arr) || lag < 1 || lag >= arr.length) return NaN;
  const n = arr.length;
  const m = mean(arr);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const d = arr[i] - m;
    den += d * d;
    if (i >= lag) num += (arr[i] - m) * (arr[i - lag] - m);
  }
  return den === 0 ? NaN : num / den;
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

function chiSquaredCDF(x, k) {
  if (x <= 0) return 0;
  if (!isFinite(x)) return 1;
  if (k <= 0) return NaN;
  const z = ((x / k) ** (1 / 3) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
  return normalCDF(z);
}

function kolmogorovCDF(lambda) {
  if (lambda <= 0) return 0;
  if (lambda > 5) return 1;
  let sum = 0;
  const precision = 1e-10;
  for (let k = 1; k <= 100; k++) {
    const term = Math.exp(-2 * k * k * lambda * lambda);
    const prevSum = sum;
    sum += (k % 2 ? 1 : -1) * term;
    if (Math.abs(term) < precision && Math.abs(sum - prevSum) < precision) break;
  }
  return 1 - 2 * sum;
}

function welchTTest(sample1, sample2) {
  if (!validateArray(sample1, 2) || !validateArray(sample2, 2)) return { t: NaN, df: NaN, p: NaN };
  const n1 = sample1.length, n2 = sample2.length;
  const m1 = mean(sample1), m2 = mean(sample2);
  const v1 = variance(sample1), v2 = variance(sample2);
  if (v1 === 0 || v2 === 0 || !isFinite(v1) || !isFinite(v2)) return { t: NaN, df: NaN, p: NaN };
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  if (se === 0) return { t: NaN, df: NaN, p: NaN };
  const t = (m1 - m2) / se;
  const dfNum = (v1 / n1 + v2 / n2) ** 2;
  const dfDen = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
  const df = dfNum / dfDen;
  const p = 2 * (1 - normalCDF(Math.abs(t)));
  return { t, df, p };
}

function chiSquaredGOF(observed, expected) {
  if (!validateArray(observed, 1) || !validateArray(expected, 1) || observed.length !== expected.length) {
    return { chi2: NaN, p: NaN };
  }
  let chi2 = 0;
  for (let i = 0; i < observed.length; i++) {
    if (expected[i] <= 0) continue;
    chi2 += (observed[i] - expected[i]) ** 2 / expected[i];
  }
  const df = observed.length - 1;
  const p = 1 - chiSquaredCDF(chi2, df);
  return { chi2, p };
}

function ljungBoxTest(residuals, lags) {
  if (!validateArray(residuals, 2) || lags < 1 || lags >= residuals.length) {
    return { statistic: NaN, pValue: NaN };
  }
  const n = residuals.length;
  const m = mean(residuals);
  let denom = 0;
  for (let i = 0; i < n; i++) denom += (residuals[i] - m) ** 2;
  if (denom === 0) return { statistic: NaN, pValue: NaN };
  let q = 0;
  for (let k = 1; k <= lags; k++) {
    let num = 0;
    for (let i = k; i < n; i++) num += (residuals[i] - m) * (residuals[i - k] - m);
    const rk = num / denom;
    q += rk * rk / (n - k);
  }
  q *= n * (n + 2);
  const pValue = 1 - chiSquaredCDF(q, lags);
  return { statistic: q, pValue };
}

function exponentialFit(intervals) {
  if (!validateArray(intervals, 2)) return { lambda: NaN, ksStat: NaN, ksPValue: NaN };
  const sorted = intervals.slice().sort((a, b) => a - b);
  const lambda = 1 / mean(sorted);
  let maxDiff = 0;
  const n = sorted.length;
  for (let i = 0; i < n; i++) {
    const ecdf = (i + 1) / n;
    const cdf = 1 - Math.exp(-lambda * sorted[i]);
    maxDiff = Math.max(maxDiff, Math.abs(ecdf - cdf));
  }
  const ksStat = maxDiff;
  const ksLambda = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * ksStat;
  const ksPValue = 1 - kolmogorovCDF(ksLambda);
  return { lambda, ksStat, ksPValue };
}

module.exports = {
  mean, median, std, variance, skewness, kurtosis,
  pearsonCorrelation, autocorrelation,
  welchTTest, chiSquaredGOF, ljungBoxTest,
  exponentialFit,
  normalCDF, chiSquaredCDF, kolmogorovCDF
};
