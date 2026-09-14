import { RANGE_WINDOW_DAYS } from "./bars.js";

const SECONDS_PER_DAY = 86400;

/** 30-day D1 window: highest high, lowest low, range %, position % and headroom %. */
export function computeRange(d1Bars, price) {
  if (!d1Bars?.length || price == null) {
    return {
      high: null,
      low: null,
      windowStart: null,
      rangePct: null,
      positionPct: null,
      headroomPct: null,
    };
  }

  const newestTs = d1Bars[d1Bars.length - 1].time;
  const windowStart = newestTs - RANGE_WINDOW_DAYS * SECONDS_PER_DAY;
  const inWindow = d1Bars.filter((b) => b.time >= windowStart);
  if (!inWindow.length) {
    return {
      high: null,
      low: null,
      windowStart: null,
      rangePct: null,
      positionPct: null,
      headroomPct: null,
    };
  }

  const high = Math.max(...inWindow.map((b) => b.high));
  const low = Math.min(...inWindow.map((b) => b.low));
  const span = high - low;
  if (span <= 0) {
    return {
      high,
      low,
      windowStart,
      rangePct: null,
      positionPct: null,
      headroomPct: null,
    };
  }

  // Headroom is measured over the current price, not the window's low — same convention as
  // the distance component in score.js: (high − price) / price.
  const headroomPct = (high - price) / price;

  return {
    high,
    low,
    windowStart,
    rangePct: span / low,
    positionPct: (price - low) / span,
    headroomPct,
  };
}
