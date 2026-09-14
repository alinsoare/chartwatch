/* Shared bar-reading conventions for the accumulation screener.
 *
 * Every signal imports from here so the forming-bar rule, current price, touch
 * geometry and columnar conversion cannot drift apart.
 */

export const SCAN_TIMEFRAMES = ["h1", "d1"];
export const RANGE_WINDOW_DAYS = 30;

/** Last completed bar index. Matches j3Newest in fvg.js and lastCompletedJs in ob-structure.js. */
export function lastCompletedIndex(bars) {
  return bars.length - 2;
}

/** Close of the newest bar across scanned timeframes, chosen by max timestamp. */
export function currentPrice(seriesByTimeframe) {
  let bestTs = -Infinity;
  let price = null;
  for (const bars of Object.values(seriesByTimeframe)) {
    if (!bars?.length) continue;
    const newest = bars[bars.length - 1];
    if (newest.time > bestTs) {
      bestTs = newest.time;
      price = newest.close;
    }
  }
  return price;
}

/**
 * Current-day touch exception: the newest stored bar of a series. Zone triggers
 * ask whether price is interacting with structure right now, so they read
 * today's developing bar rather than the last completed one.
 */
export function currentDayBar(bars) {
  if (!bars?.length) return null;
  return bars[bars.length - 1];
}

/** Inclusive overlap between a bar's high-to-low interval and a zone's price interval. */
export function intervalsOverlap(barLow, barHigh, zoneLow, zoneHigh) {
  return barLow <= zoneHigh && barHigh >= zoneLow;
}

export function columnarToBars(payloadSeries) {
  if (!payloadSeries?.t?.length) return [];
  const n = payloadSeries.t.length;
  const bars = [];
  for (let i = 0; i < n; i++) {
    bars.push({
      time: payloadSeries.t[i],
      open: payloadSeries.o[i],
      high: payloadSeries.h[i],
      low: payloadSeries.l[i],
      close: payloadSeries.c[i],
    });
  }
  return bars;
}
