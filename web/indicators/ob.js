/* Order Block scanner, ported from an external source indicator (OB detection
 * stage).
 *
 * Chronological, oldest-first. The newest stored bar stands in for the
 * source's forming bar — the still-open newest bar of a live chart.
 *
 * Sanctioned deviations (parity scoped to H4+ where skip filter is inert):
 * - InpLookbackBars cap dropped: every displayed bar is scanned.
 * - All detected demand zones are drawn (source history mode); no trend-bias filter.
 * - No show-history switch: full history is always displayed.
 * - Supply zones are detected but never drawn (rendering deviation only).
 * - Skip-bar interval dropped: every bar is eligible on every timeframe.
 * - Only the source's fresh-load path is reproduced (no incremental per-bar path).
 */

import {
  computeSwingStructure,
  IMPULSE,
} from "./ob-structure.js";
import { PIVOT_LABEL_COLOR, ZONE_PALETTE } from "./palette.js";
import { registerIndicator } from "./registry.js";

/* Source defaults. Dropped vs source: lookback cap (full-history scan), display/trend
 * filters (all demand zones drawn; no show-history switch), supply rendering
 * (detected for parity, demand-only on chart), skip-bar interval (parity H4+).
 *
 * Verified parity: XAUUSD D1, 338 bars — 16/16 pivots and 13/13 zones exact.
 *
 * Intraday spot-check (historical), XAUUSD M15, newest 2000 of
 * 10,761 exported bars: 105 pivots and 77 zones match exactly. Two caveats came out of
 * it, both recorded here because they are easy to rediscover the hard way:
 *
 * 1. The comparison only works over the source's own 2000-bar lookback. That cap does
 *    not just hide older pivots, it decides where the source indicator's structure seeds from, so
 *    handing the port the full series compares two runs that began at different points
 *    (403 port pivots against 107, all cascade from the seed). D1 needed none of this
 *    because 338 bars sit under the cap.
 * 2. The run could NOT confirm that intraday divergence traces to the dropped skip
 *    window, because the window was never in effect on the exported chart: the source
 *    indicator itself placed 4 pivots on bars opening inside [23:30, 01:00). XAUUSD also has no bars at
 *    all in 23:30-23:59 on that feed (a market break), so the window reduces to
 *    00:00-01:00 there and this instrument is a poor probe for it either way.
 *
 * So sub-H4 output remains outside the parity claim on principle, not because a
 * divergence was observed and excused: none was.
 *
 * Not exercised by either fixture: the confirmation gate. XAUUSD carries digits=3, so
 * confirmPoints=50 is $0.05 against a ~$100 daily range and every pivot confirms
 * trivially. The retracement threshold and the "more extreme bar in between" rejection
 * need a fixture on an instrument where that distance actually bites. */
export const OB_PARAMS = {
  pivotBars: 3,
  confirmPoints: 50,
  validityScanCap: 500,
};

export const OB_COLORS = ZONE_PALETTE;

function barIndexByTime(times, t) {
  return times.indexOf(t);
}

function detectBetweenPivots(
  firstPivot,
  secondPivot,
  firstIdx,
  secondIdx,
  lookForSellZone,
  pivotBoundary,
  opens,
  highs,
  lows,
  closes,
  times,
  lastBreakBarTime,
  n,
) {
  let scanEndTime = secondPivot.barTime;
  if (lastBreakBarTime > 0 && scanEndTime > lastBreakBarTime) {
    scanEndTime = lastBreakBarTime;
  }

  const firstJs = firstPivot.barIndex;
  const secondJs = barIndexByTime(times, scanEndTime);
  if (firstJs < 0 || secondJs < 0) return [];

  const olderJs = Math.min(firstJs, secondJs);
  const newerJs = Math.max(firstJs, secondJs);
  const temp = [];

  for (let js = olderJs - 1; js <= newerJs - 1; js++) {
    if (js < 0 || js >= n - 1) continue;

    if (!lookForSellZone && highs[js] >= pivotBoundary) continue;
    if (lookForSellZone && lows[js] <= pivotBoundary) continue;

    const isMatch = lookForSellZone
      ? closes[js] > opens[js]
      : closes[js] < opens[js];
    if (!isMatch) continue;

    temp.push({
      isSellZone: lookForSellZone,
      barIndex: js,
      barTime: times[js],
      high: highs[js],
      low: lows[js],
      open: opens[js],
      close: closes[js],
      isShadowed: false,
      isFromImpulse: secondPivot.moveType === IMPULSE,
      patternPivot1: firstIdx,
      patternPivot2: secondIdx,
      pivotConfirmTime: secondPivot.confirmationTime,
      pivotEndTime: secondPivot.barTime,
      firstPivot,
      secondPivot,
    });
  }

  if (!temp.length) return [];

  for (let i = 0; i < temp.length; i++) {
    for (let j = i + 1; j < temp.length; j++) {
      const iSell = temp[i].close > temp[i].open;
      const jSell = temp[j].close > temp[j].open;
      if (iSell !== jSell) continue;
      const touch =
        temp[j].high >= temp[i].low && temp[j].low <= temp[i].high;
      if (touch) {
        temp[i].isShadowed = true;
        break;
      }
    }
  }

  const zones = [];
  for (const ob of temp) {
    if (ob.isShadowed) continue;
    if (!lookForSellZone && ob.high >= pivotBoundary) continue;
    if (lookForSellZone && ob.low <= pivotBoundary) continue;
    if (!ob.isFromImpulse) continue;

    const obSize = ob.high - ob.low;
    let distanceToOB;
    if (lookForSellZone) {
      distanceToOB = ob.low - ob.secondPivot.low;
    } else {
      distanceToOB = ob.secondPivot.high - ob.high;
    }
    if (distanceToOB <= 0 || 2 * obSize >= distanceToOB) continue;

    zones.push(ob);
  }
  return zones;
}

function getObValidityEndTime(
  ob,
  pivots,
  pending,
  bosOccurred,
  closes,
  times,
  validityScanCap,
  n,
) {
  if (pivots.length < 2) return times[n - 1];

  const lastPivot = pivots[pivots.length - 1];
  const pendingTime = pending?.barTime ?? 0;

  if (ob.pivotEndTime === lastPivot.barTime) return times[n - 1];
  // Unreachable through the current search path (pending OBs need bosOccurred),
  // but matches the source: open-ended only while a break is active.
  if (bosOccurred && pending && ob.pivotEndTime === pendingTime) return times[n - 1];

  const firstPivot = pivots[ob.patternPivot1];
  const secondPivot = pivots[ob.patternPivot2];
  if (!firstPivot || !secondPivot) {
    for (let p = 0; p < pivots.length; p++) {
      if (pivots[p].barTime === ob.pivotEndTime && p + 1 < pivots.length) {
        return pivots[p + 1].confirmationTime;
      }
    }
    return times[n - 1];
  }

  const startJs = barIndexByTime(times, ob.pivotConfirmTime);
  if (startJs < 0) return times[n - 1];

  const lastCompletedJs = n - 2;
  const scanEndJs = Math.min(lastCompletedJs, startJs + validityScanCap);

  if (!ob.isSellZone) {
    const lLow = firstPivot.low;
    const hHigh = secondPivot.high;
    for (let js = startJs + 1; js <= scanEndJs; js++) {
      if (closes[js] < lLow) return times[js];
      if (closes[js] > hHigh) return times[js];
    }
  } else {
    const hHigh = firstPivot.high;
    const lLow = secondPivot.low;
    for (let js = startJs + 1; js <= scanEndJs; js++) {
      if (closes[js] > hHigh) return times[js];
      if (closes[js] < lLow) return times[js];
    }
  }

  for (let p = 0; p < pivots.length; p++) {
    if (pivots[p].barTime === ob.pivotEndTime && p + 1 < pivots.length) {
      return pivots[p + 1].confirmationTime;
    }
  }
  return times[n - 1];
}

export function obZones(bars, pointSize, params = OB_PARAMS, structure = null) {
  const n = bars.length;
  const minBars = params.pivotBars * 3 + 1;
  if (n < minBars) {
    return {
      zones: [],
      structure: null,
      warning:
        `insufficient history for OB pivots: need at least ${minBars} bars, have ${n}`,
    };
  }

  const struct =
    structure ??
    computeSwingStructure(bars, pointSize, {
      pivotBars: params.pivotBars,
      confirmPoints: params.confirmPoints,
    });

  if (struct.warning) {
    return { zones: [], structure: struct, warning: struct.warning };
  }

  const pivots = struct.pivots;
  if (pivots.length < 2) {
    return {
      zones: [],
      structure: struct,
      warning: "no confirmed swing structure found",
    };
  }

  const opens = bars.map((b) => b.open);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const closes = bars.map((b) => b.close);
  const times = bars.map((b) => b.time);

  const rawZones = [];

  for (let i = 0; i < pivots.length - 1; i++) {
    const firstPivot = pivots[i];
    const secondPivot = pivots[i + 1];
    let lookForSellZone = false;
    let pivotBoundary = 0;

    if (!firstPivot.isHigh && secondPivot.isHigh) {
      lookForSellZone = false;
      for (let p = i - 1; p >= 0; p--) {
        if (pivots[p].isHigh) {
          pivotBoundary = pivots[p].high;
          break;
        }
      }
    } else if (firstPivot.isHigh && !secondPivot.isHigh) {
      lookForSellZone = true;
      for (let p = i - 1; p >= 0; p--) {
        if (!pivots[p].isHigh) {
          pivotBoundary = pivots[p].low;
          break;
        }
      }
    } else {
      continue;
    }

    if (pivotBoundary === 0) continue;

    rawZones.push(
      ...detectBetweenPivots(
        firstPivot,
        secondPivot,
        i,
        i + 1,
        lookForSellZone,
        pivotBoundary,
        opens,
        highs,
        lows,
        closes,
        times,
        struct.lastBreakBarTime,
        n,
      ),
    );
  }

  if (struct.bosOccurred && struct.pending && pivots.length >= 1) {
    const lastConfirmed = pivots[pivots.length - 1];
    const pending = { ...struct.pending, moveType: IMPULSE };
    if (lastConfirmed.isHigh !== pending.isHigh) {
      const lookForSell = lastConfirmed.isHigh;
      let boundary = 0;
      for (let p = pivots.length - 2; p >= 0; p--) {
        if (pivots[p].isHigh === pending.isHigh) {
          boundary = pending.isHigh ? pivots[p].high : pivots[p].low;
          break;
        }
      }
      if (boundary !== 0) {
        rawZones.push(
          ...detectBetweenPivots(
            lastConfirmed,
            pending,
            pivots.length - 1,
            pivots.length,
            lookForSell,
            boundary,
            opens,
            highs,
            lows,
            closes,
            times,
            struct.lastBreakBarTime,
            n,
          ),
        );
      }
    }
  }

  const zones = [];
  for (const ob of rawZones) {
    const timeTo = getObValidityEndTime(
      ob,
      pivots,
      struct.pending,
      struct.bosOccurred,
      closes,
      times,
      params.validityScanCap,
      n,
    );
    zones.push({
      direction: ob.isSellZone ? "supply" : "demand",
      time: ob.barTime,
      time_to: timeTo,
      open: timeTo === times[n - 1],
      price_low: ob.low,
      price_high: ob.high,
      label_time: ob.barTime,
      label_price: ob.isSellZone ? ob.high : ob.low,
    });
  }

  return { zones, structure: struct, warning: null };
}

registerIndicator({
  id: "ob",
  label: "OB",
  minBars: OB_PARAMS.pivotBars * 3 + 1,
  compute(bars, instrument) {
    const pointSize = instrument?.point_size ?? 0.01;
    const { zones, structure, warning } = obZones(bars, pointSize);
    const drawables = [];
    for (const zone of zones) {
      if (zone.direction !== "demand") continue;
      const color = OB_COLORS[zone.direction];
      drawables.push({
        type: "rect",
        timeFrom: zone.time,
        timeTo: zone.time_to,
        priceLow: zone.price_low,
        priceHigh: zone.price_high,
        color,
        style: "fill",
      });
      drawables.push({
        type: "label",
        time: zone.label_time,
        price: zone.label_price,
        text: "OB",
        color,
        baseline: zone.direction === "supply" ? "top" : "bottom",
      });
    }
    if (structure?.pivots?.length) {
      for (const pivot of structure.pivots) {
        drawables.push({
          type: "label",
          time: pivot.barTime,
          price: pivot.isHigh ? pivot.high : pivot.low,
          text: pivot.isHigh ? "H" : "L",
          color: PIVOT_LABEL_COLOR,
          baseline: pivot.isHigh ? "bottom" : "top",
          align: "center",
          offset: 4,
          emphasis: true,
        });
      }
    }
    return { drawables, warning };
  },
});
