/* Ruler measurement math.
 *
 * Chart-free and DOM-free on purpose: the sign conventions and the reversed,
 * same-bar and percent cases are what can silently go wrong, so they are
 * covered directly by tests/js/run_measure.mjs instead of by clicking.
 *
 * Bar times are UTC epoch SECONDS, matching the rest of the frontend.
 */

import { formatSignedPrice } from "../chart/format.js";

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const YEAR = 365 * DAY;
const INTERVAL_SAMPLE = 20;

/* Index of the stored bar closest to a time. Anchors carry a bar time straight
 * from the chart, so this normally lands exactly; the nearest-match fallback
 * keeps a measurement sensible if the bars were repruned underneath it. */
export function nearestBarIndex(bars, time) {
  let low = 0;
  let high = bars.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (bars[mid].time < time) low = mid + 1;
    else high = mid;
  }
  const previous = low - 1;
  if (previous >= 0 && Math.abs(bars[previous].time - time) <= Math.abs(bars[low].time - time)) {
    return previous;
  }
  return low;
}

/* Median gap over the last ~20 stored bars. Irregular final gaps (weekends on
 * D1) are outliers; the median keeps projected steps aligned with the series. */
export function barIntervalSeconds(bars) {
  if (!bars || bars.length < 2) return null;

  const sampleCount = Math.min(INTERVAL_SAMPLE, bars.length - 1);
  const start = bars.length - 1 - sampleCount;
  const gaps = [];
  for (let i = start + 1; i < bars.length; i++) {
    gaps.push(bars[i].time - bars[i - 1].time);
  }
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

function resolveAnchor(bars, anchor, role) {
  const lastIndex = bars.length - 1;
  const barsAhead = anchor.barsAhead > 0 ? anchor.barsAhead : 0;
  if (role === "to" && barsAhead > 0) {
    const interval = barIntervalSeconds(bars);
    if (interval) {
      return {
        index: lastIndex + barsAhead,
        time: bars[lastIndex].time + barsAhead * interval,
      };
    }
  }

  const index = nearestBarIndex(bars, anchor.time);
  return { index, time: bars[index].time };
}

/* Measure between two anchors, each { time, price } and optionally barsAhead on
 * the end anchor. Returns null when there is nothing to measure against. */
export function measure(bars, from, to) {
  if (!bars || !bars.length || !from || !to) return null;

  const fromResolved = resolveAnchor(bars, from, "from");
  const toResolved = resolveAnchor(bars, to, "to");
  const fromIndex = fromResolved.index;
  const toIndex = toResolved.index;
  const fromTime = fromResolved.time;
  const toTime = toResolved.time;

  // Relative to the anchor clicked first, so a measurement drawn right to left
  // still reads as "from where I started". Magnitude via abs() keeps the
  // percent sign tied to the move itself.
  const priceChange = to.price - from.price;
  const percentChange = from.price !== 0 ? (priceChange / Math.abs(from.price)) * 100 : 0;

  return {
    fromIndex,
    toIndex,
    anchorTimeFrom: fromTime,
    anchorTimeTo: toTime,
    priceFrom: from.price,
    priceTo: to.price,
    // Sorted bounds for the renderer, which draws a region rather than a vector.
    timeFrom: Math.min(fromTime, toTime),
    timeTo: Math.max(fromTime, toTime),
    priceLow: Math.min(from.price, to.price),
    priceHigh: Math.max(from.price, to.price),
    priceChange,
    percentChange,
    barCount: Math.abs(toIndex - fromIndex) + 1, // inclusive of both anchors
    elapsedSeconds: Math.abs(toTime - fromTime),
    direction: priceChange > 0 ? "up" : priceChange < 0 ? "down" : "flat",
  };
}

/* Wall-clock span, coarse on purpose: two units are enough to judge a move. */
export function formatElapsed(seconds) {
  const total = Math.max(0, Math.round(seconds));
  if (total < MINUTE) return "0m";
  if (total < HOUR) return `${Math.floor(total / MINUTE)}m`;
  if (total < DAY) {
    const hours = Math.floor(total / HOUR);
    const minutes = Math.floor((total % HOUR) / MINUTE);
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (total < YEAR) {
    const days = Math.floor(total / DAY);
    const hours = Math.floor((total % DAY) / HOUR);
    return hours ? `${days}d ${hours}h` : `${days}d`;
  }
  const years = Math.floor(total / YEAR);
  const days = Math.floor((total % YEAR) / DAY);
  return days ? `${years}y ${days}d` : `${years}y`;
}

/* Two lines: what the move was, then how far it ran. The bar count is the
 * market-time measure; the elapsed span is wall clock and so includes weekends
 * and holidays on D1 and W1. */
export function measurementLines(measurement, instrument) {
  if (!measurement) return [];
  const percent = measurement.percentChange > 0 ? "+" : "";
  return [
    `${formatSignedPrice(measurement.priceChange, instrument)} ` +
      `(${percent}${measurement.percentChange.toFixed(2)}%)`,
    `${measurement.barCount} ${measurement.barCount === 1 ? "bar" : "bars"} · ` +
      formatElapsed(measurement.elapsedSeconds),
  ];
}
