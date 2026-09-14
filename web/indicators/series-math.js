/* Shared EMA and stochastic helpers for indicator signal parity.
 *
 * These deliberately follow the source platform's moving-average and stochastic
 * conventions rather than textbook or pandas defaults — the differences change
 * signals:
 * - the EMA is seeded with the SMA of the first `period` values (not a
 *   first-value seed — with EMA 377 the difference persists long enough to
 *   alter decisions);
 * - the stochastic is the source's low/high mode: rolling extremes over the
 *   %K period, then SMA sums over the slowing window.
 * Warm-up regions are NaN, standing in for the source's empty value.
 */

export function smaSeededEma(values, period) {
  const n = values.length;
  const out = new Array(n).fill(NaN);
  if (n < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;

  const k = 2 / (period + 1);
  for (let i = period; i < n; i++) {
    out[i] = out[i - 1] + k * (values[i] - out[i - 1]);
  }
  return out;
}

/* EMA of a series whose warm-up starts at `firstValidIndex`: seed at
 * firstValidIndex + period − 1 with the SMA of
 * values[firstValidIndex .. firstValidIndex + period − 1]. */
export function smaSeededEmaFromSeries(values, period, firstValidIndex) {
  const n = values.length;
  const out = new Array(n).fill(NaN);
  const firstEma = firstValidIndex + period - 1;
  if (period < 1 || firstEma >= n) return out;

  let sum = 0;
  for (let k = 0; k < period; k++) sum += values[firstValidIndex + k];
  out[firstEma] = sum / period;

  const k = 2 / (period + 1);
  for (let i = firstEma + 1; i < n; i++) {
    out[i] = out[i - 1] + k * (values[i] - out[i - 1]);
  }
  return out;
}

export function lowHighStochastic(high, low, close, kPeriod = 21, slowing = 9) {
  const n = close.length;

  // Rolling extremes over kPeriod bars; NaN during warm-up.
  const ll = new Array(n).fill(NaN);
  const hh = new Array(n).fill(NaN);
  for (let i = kPeriod - 1; i < n; i++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (low[j] < lo) lo = low[j];
      if (high[j] > hi) hi = high[j];
    }
    ll[i] = lo;
    hh[i] = hi;
  }

  // %K = 100 * SMA(close - LL, slowing) / SMA(HH - LL, slowing).
  // A window containing any NaN yields NaN, matching pandas' rolling sum.
  const out = new Array(n).fill(NaN);
  for (let i = slowing - 1; i < n; i++) {
    let num = 0;
    let den = 0;
    let valid = true;
    for (let j = i - slowing + 1; j <= i; j++) {
      if (Number.isNaN(ll[j]) || Number.isNaN(hh[j])) {
        valid = false;
        break;
      }
      num += close[j] - ll[j];
      den += hh[j] - ll[j];
    }
    if (!valid || den === 0) continue; // stays NaN (flat window or warm-up)
    out[i] = (100 * num) / den;
  }
  return out;
}
