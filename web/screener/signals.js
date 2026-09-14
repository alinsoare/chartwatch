import { FVG_PARAMS, fvgZones } from "../indicators/fvg.js";
import { MACD_PARAMS, macdArrays } from "../indicators/macd.js";
import { obZones, OB_PARAMS } from "../indicators/ob.js";
import { computeSwingStructure } from "../indicators/ob-structure.js";
import { currentDayBar, intervalsOverlap, lastCompletedIndex } from "./bars.js";

export const FVG_MIN_BARS = FVG_PARAMS.emaSlow + 3;
export const MACD_MIN_BARS = MACD_PARAMS.slow + MACD_PARAMS.signal;
export const PIVOT_MIN_BARS = OB_PARAMS.pivotBars * 3 + 1;

export function touchBullishD1Fvg(bars, pointSize) {
  if (!bars?.length) return { ok: false, insufficient: true };
  if (bars.length < FVG_MIN_BARS) return { ok: false, insufficient: true };

  const dayBar = currentDayBar(bars);
  if (!dayBar) return { ok: false, insufficient: false };

  const { zones } = fvgZones(bars, pointSize);
  const newestTs = bars[bars.length - 1].time;

  for (const zone of zones) {
    if (zone.direction !== "bullish") continue;
    if (zone.time_to < newestTs) continue;
    if (intervalsOverlap(dayBar.low, dayBar.high, zone.price_low, zone.price_high)) {
      return { ok: true, insufficient: false };
    }
  }
  return { ok: false, insufficient: false };
}

export function touchDemandD1Ob(bars, pointSize) {
  if (!bars?.length) return { ok: false, insufficient: true };
  if (bars.length < PIVOT_MIN_BARS) return { ok: false, insufficient: true };

  const dayBar = currentDayBar(bars);
  if (!dayBar) return { ok: false, insufficient: false };

  const { zones } = obZones(bars, pointSize);
  for (const zone of zones) {
    if (zone.direction !== "demand") continue;
    if (!zone.open) continue;
    if (intervalsOverlap(dayBar.low, dayBar.high, zone.price_low, zone.price_high)) {
      return { ok: true, insufficient: false };
    }
  }
  return { ok: false, insufficient: false };
}

// Histogram below zero matches the chart colour rule (v < 0 is red; v >= 0 is up).
export const MACD_HISTOGRAM_ZERO = 0;

export function isMacdRedMorningStarTrough(h2, h1, h0) {
  return (
    h2 > h1 &&
    h1 < h0 &&
    h2 < MACD_HISTOGRAM_ZERO &&
    h1 < MACD_HISTOGRAM_ZERO &&
    h0 < MACD_HISTOGRAM_ZERO
  );
}

export function macdNegativeTrough(bars) {
  if (bars.length < MACD_MIN_BARS) return { ok: false, insufficient: true };

  const { histogram } = macdArrays(bars);
  const k = lastCompletedIndex(bars);

  const positions = [
    { h2: k - 2, h1: k - 1, h0: k },
    { h2: k - 1, h1: k, h0: k + 1 },
  ];

  for (const { h2, h1, h0 } of positions) {
    const v2 = histogram[h2];
    const v1 = histogram[h1];
    const v0 = histogram[h0];
    if (v0 === undefined || v1 === undefined || v2 === undefined) continue;
    if (Number.isNaN(v0) || Number.isNaN(v1) || Number.isNaN(v2)) continue;
    if (isMacdRedMorningStarTrough(v2, v1, v0)) {
      return { ok: true, insufficient: false };
    }
  }

  return { ok: false, insufficient: false };
}

export function selectDistanceTarget(bars, pointSize, windowHigh, windowStart) {
  if (windowHigh == null || windowStart == null) {
    return { target: null, branch: null, insufficient: false };
  }

  if (bars.length < PIVOT_MIN_BARS) {
    return { target: windowHigh, branch: "window", insufficient: true };
  }

  const { pivots } = computeSwingStructure(bars, pointSize, OB_PARAMS);
  for (let i = pivots.length - 1; i >= 0; i--) {
    const pivot = pivots[i];
    if (pivot.isHigh && pivot.isConfirmed) {
      if (pivot.barTime >= windowStart) {
        return { target: pivot.high, branch: "pivot", insufficient: false };
      }
      break;
    }
  }

  return { target: windowHigh, branch: "window", insufficient: false };
}
