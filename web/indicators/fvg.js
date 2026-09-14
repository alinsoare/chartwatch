/* Fair Value Gap scanner, ported from an external source indicator.
 *
 * Chronological, oldest-first: the pattern is bar1 -> bar2 -> bar3 in time
 * order, bar3 newest. The newest stored bar stands in for the source's
 * forming bar — the still-open newest bar of a live chart — and is never
 * bar3. Two deliberate deviations from the source:
 *
 * - The recent-bars scan cap (`InpBarLimit`, 120) is dropped — the scan covers
 *   every stored bar past the slow-EMA warm-up, so all detected zones are
 *   visible at once.
 * - Displacement rules read close-to-open-spaces. When two same-type bars are
 *   adjacent and the later opens beyond the earlier's close, the interval
 *   between those prices is credited to the later bar's body and range — the
 *   move from the previous close to this close, not the drawn open-to-close
 *   segment. Body dominance, bar3's wick limit, and the gap-vs-bar2-range
 *   ratio use these extended measures; the gap itself, zone edges, and drawing
 *   still read recorded OHLC.
 * - Bearish zones are detected but never drawn (rendering deviation only).
 */

import { lowHighStochastic, smaSeededEma } from "./series-math.js";
import { ZONE_PALETTE } from "./palette.js";
import { registerIndicator } from "./registry.js";

/* Every tunable in one place; mirrors the source indicator's inputs and
 * their defaults (minus the dropped bar limit). */
export const FVG_PARAMS = {
  rectBars: 14, // zone validity window drawn forward from bar1
  gapVsBar2Range: 0.3, // 0 disables the ratio rule
  strictSwingStairs: true,
  bar3WickBodyMult: 10.0, // 0 disables
  stochOverbought: 80.0,
  stochOversold: 20.0,
  minFvgPoints: 50.0,
  maxFvgPoints: 0.0, // 0 disables
  emaFast: 13,
  emaCenter: 89,
  emaSlow: 377,
  stochK: 21,
  stochSlowing: 9,
};

export const FVG_COLORS = {
  bullish: ZONE_PALETTE.demand,
  bearish: ZONE_PALETTE.supply,
};

/* Which pattern directions the EMA 13/89/377 regime allows at bar3.
 * A literal transcription of the original branch ladder; the branches are
 * exclusive and their order matters. */
function searchDirections(fast, center, slow) {
  if (Number.isNaN(fast) || Number.isNaN(center) || Number.isNaN(slow)) {
    return [false, false];
  }
  if (fast > center && center > slow) return [true, false];
  if (fast < center && center < slow) return [false, true];
  if (center < fast && fast < slow) return [false, true];
  if (slow < fast && fast < center) return [true, false];
  if ((fast < slow && slow < center) || (center < slow && slow < fast)) {
    return [true, true];
  }
  return [false, false];
}

function gapMeetsMidRangeRule(gap, bar2Range, ratio) {
  if (bar2Range <= 0 || gap <= 0) return false;
  if (ratio <= 0) return true;
  return gap > bar2Range * ratio;
}

function barDirection(open, close) {
  if (close > open) return 1;
  if (close < open) return -1;
  return 0;
}

/* Later bar carries a space when it shares type with its predecessor (neutral
 * borrows the other's direction; two neutrals produce none) and opens beyond
 * the predecessor's close in that direction. */
export function hasCloseToOpenSpace(bars, index) {
  if (index <= 0) return false;
  const prev = bars[index - 1];
  const bar = bars[index];
  let dir = barDirection(prev.open, prev.close);
  const barDir = barDirection(bar.open, bar.close);
  if (dir === 0) dir = barDir;
  else if (barDir !== 0 && barDir !== dir) return false;
  if (dir === 0) return false;
  if (dir > 0) return bar.open > prev.close;
  return bar.open < prev.close;
}

export function spaceExtendedBody(bars, index) {
  const bar = bars[index];
  if (index > 0 && hasCloseToOpenSpace(bars, index)) {
    return Math.abs(bar.close - bars[index - 1].close);
  }
  return Math.abs(bar.close - bar.open);
}

export function spaceExtendedRange(bars, index) {
  const bar = bars[index];
  let low = bar.low;
  let high = bar.high;
  if (index > 0 && hasCloseToOpenSpace(bars, index)) {
    const prevClose = bars[index - 1].close;
    low = Math.min(low, prevClose);
    high = Math.max(high, prevClose);
  }
  return high - low;
}

/* Scan bars (oldest-first {time, open, high, low, close}) for FVG patterns.
 * Returns { zones, warning }; zones oldest-first. */
export function fvgZones(bars, pointSize, params = FVG_PARAMS) {
  const n = bars.length;

  // The source refuses to signal until the slow EMA has data; mirror that and say so,
  // because a chart with no zones is otherwise indistinguishable from a chart
  // with no qualifying patterns.
  const minBars = params.emaSlow + 3;
  if (n < minBars) {
    return {
      zones: [],
      warning:
        `insufficient history for EMA ${params.emaSlow}: ` +
        `need at least ${minBars} bars, have ${n}`,
    };
  }

  const opens = bars.map((b) => b.open);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const closes = bars.map((b) => b.close);
  const times = bars.map((b) => b.time);

  const emaFast = smaSeededEma(closes, params.emaFast);
  const emaCenter = smaSeededEma(closes, params.emaCenter);
  const emaSlow = smaSeededEma(closes, params.emaSlow);
  const stoch = lowHighStochastic(highs, lows, closes, params.stochK, params.stochSlowing);

  const point = pointSize > 0 ? pointSize : 0.01;
  const labelOffset = 10 * point;

  // bar3 candidates: newest stored bar excluded (the source's forming bar), and
  // bar3 needs the slow EMA seeded at its index plus two earlier bars.
  const j3Newest = n - 2;
  const j3Oldest = Math.max(2, params.emaSlow - 1);
  if (j3Newest < j3Oldest) {
    return { zones: [], warning: "no scannable bars inside the EMA warm-up window" };
  }

  const zones = [];
  for (let j3 = j3Oldest; j3 <= j3Newest; j3++) {
    const j2 = j3 - 1;
    const j1 = j3 - 2;

    const o1 = opens[j1], h1 = highs[j1], l1 = lows[j1], c1 = closes[j1];
    const o2 = opens[j2], h2 = highs[j2], l2 = lows[j2], c2 = closes[j2];
    const o3 = opens[j3], h3 = highs[j3], l3 = lows[j3], c3 = closes[j3];

    const body1 = spaceExtendedBody(bars, j1);
    const body2 = spaceExtendedBody(bars, j2);
    const body3 = spaceExtendedBody(bars, j3);
    if (body2 < body1 || body2 < body3) continue;
    const bar2Range = spaceExtendedRange(bars, j2);

    const [searchBullish, searchBearish] = searchDirections(
      emaFast[j3], emaCenter[j3], emaSlow[j3],
    );
    if (!searchBullish && !searchBearish) continue;

    const bullishMid = c2 > o2;
    const bearishMid = c2 < o2;

    const hhHl = h1 < h2 && h2 < h3 && l1 < l2 && l2 < l3;
    const lhLl = h1 > h2 && h2 > h3 && l1 > l2 && l2 > l3;
    const bullSwing = params.strictSwingStairs ? hhHl : h1 < h3 && l1 < l3;
    const bearSwing = params.strictSwingStairs ? lhLl : h1 > h3 && l1 > l3;

    let match = false;
    let isBearish = false;
    if (searchBullish && bullishMid && bullSwing) {
      const gap = l3 - h1;
      if (gapMeetsMidRangeRule(gap, bar2Range, params.gapVsBar2Range)) {
        match = true;
        isBearish = false;
      }
    }
    if (!match && searchBearish && bearishMid && bearSwing) {
      const gap = l1 - h3;
      if (gapMeetsMidRangeRule(gap, bar2Range, params.gapVsBar2Range)) {
        match = true;
        isBearish = true;
      }
    }

    if (match && params.bar3WickBodyMult > 0) {
      const upperWick3 = h3 - Math.max(o3, c3);
      const lowerWick3 = Math.min(o3, c3) - l3;
      const wickLimit = params.bar3WickBodyMult * Math.max(spaceExtendedBody(bars, j3), point);
      if (isBearish && lowerWick3 > wickLimit) match = false;
      else if (!isBearish && upperWick3 > wickLimit) match = false;
    }

    if (match) {
      for (const jx of [j1, j2, j3]) {
        const k = stoch[jx];
        // NaN: same as the original skipping bars outside the copied range.
        if (Number.isNaN(k)) continue;
        if (!isBearish && k > params.stochOverbought) match = false;
        else if (isBearish && k < params.stochOversold) match = false;
      }
    }

    if (!match) continue;

    let zoneLow;
    let zoneHigh;
    if (isBearish) {
      zoneLow = h3;
      zoneHigh = l1;
    } else {
      zoneLow = h1;
      zoneHigh = l3;
    }
    if (zoneLow > zoneHigh) [zoneLow, zoneHigh] = [zoneHigh, zoneLow];

    const fvgPoints = (zoneHigh - zoneLow) / point;
    if (fvgPoints < params.minFvgPoints) continue;
    if (params.maxFvgPoints > 0 && fvgPoints > params.maxFvgPoints) continue;

    const jRight = Math.min(j1 + params.rectBars, n - 1);
    zones.push({
      direction: isBearish ? "bearish" : "bullish",
      time_from: times[j1],
      time_to: times[jRight],
      price_low: zoneLow,
      price_high: zoneHigh,
      label_time: times[j3],
      label_price: isBearish ? lows[j3] - labelOffset : highs[j3] + labelOffset,
    });
  }

  return { zones, warning: null };
}

/* Exported for the dev-time test harness. */
export { lowHighStochastic, smaSeededEma };

registerIndicator({
  id: "fvg",
  label: "FVG",
  minBars: FVG_PARAMS.emaSlow + 3,
  compute(bars, instrument) {
    const { zones, warning } = fvgZones(bars, instrument?.point_size ?? 0.01);
    const drawables = [];
    for (const zone of zones) {
      if (zone.direction !== "bullish") continue;
      const color = FVG_COLORS[zone.direction];
      drawables.push({
        type: "rect",
        timeFrom: zone.time_from,
        timeTo: zone.time_to,
        priceLow: zone.price_low,
        priceHigh: zone.price_high,
        color,
      });
      drawables.push({
        type: "label",
        time: zone.label_time,
        price: zone.label_price,
        text: "FVG",
        color,
        baseline: zone.direction === "bearish" ? "top" : "bottom",
      });
    }
    return { drawables, warning };
  },
});
