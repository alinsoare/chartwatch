import { columnarToBars, currentPrice } from "./bars.js";
import { computeRange } from "./range.js";
import {
  FVG_MIN_BARS,
  MACD_MIN_BARS,
  macdNegativeTrough,
  PIVOT_MIN_BARS,
  selectDistanceTarget,
  touchBullishD1Fvg,
  touchDemandD1Ob,
} from "./signals.js";

export const WEIGHT_TRIGGER = 1;
export const DISTANCE_BANDS = [0.03, 0.05, 0.08];
export const SOURCE_FVG_D1 = "FVG D1";
export const SOURCE_OB_D1 = "OB D1";
export const SOURCE_MACD = "MACD";
export const SOURCE_DISTANCE = "distance";

export function scoreDistance(distance) {
  if (distance == null || distance <= DISTANCE_BANDS[0]) return 0;
  if (distance <= DISTANCE_BANDS[1]) return 1;
  if (distance <= DISTANCE_BANDS[2]) return 2;
  return 3;
}

export function markCount(score) {
  if (score <= 0) return 0;
  if (score === 1) return 1;
  if (score <= 3) return 2;
  if (score <= 5) return 3;
  return 4;
}

function emptyResult(status, rangePct = null, positionPct = null, headroomPct = null) {
  return {
    status,
    score: 0,
    marks: 0,
    reasons: [],
    rangePct,
    positionPct,
    headroomPct,
  };
}

function barsFromSeries(seriesByTimeframe) {
  return {
    h1: Array.isArray(seriesByTimeframe.h1)
      ? seriesByTimeframe.h1
      : columnarToBars(seriesByTimeframe.h1),
    d1: Array.isArray(seriesByTimeframe.d1)
      ? seriesByTimeframe.d1
      : columnarToBars(seriesByTimeframe.d1),
  };
}

export function scoreInstrument({
  enabled,
  seriesByTimeframe,
  pointSize,
  signalOverrides = {},
}) {
  if (!enabled) return emptyResult("not-screened");

  const bars = barsFromSeries(seriesByTimeframe);
  const price = currentPrice(bars);
  const { high, windowStart, rangePct, positionPct, headroomPct } = computeRange(bars.d1, price);

  if (bars.d1.length < Math.max(FVG_MIN_BARS, MACD_MIN_BARS, PIVOT_MIN_BARS)) {
    return emptyResult("insufficient-history", rangePct, positionPct, headroomPct);
  }

  const reasons = [];
  let score = 0;
  let triggerFired = false;

  const fvg = signalOverrides.fvgD1 ?? touchBullishD1Fvg(bars.d1, pointSize);
  if (fvg.insufficient) {
    return emptyResult("insufficient-history", rangePct, positionPct, headroomPct);
  }
  if (fvg.ok) {
    triggerFired = true;
    score += WEIGHT_TRIGGER;
    reasons.push({ rule: "Bullish D1 FVG touch", points: WEIGHT_TRIGGER, source: SOURCE_FVG_D1 });
  }

  const ob = signalOverrides.obD1 ?? touchDemandD1Ob(bars.d1, pointSize);
  if (ob.insufficient) {
    return emptyResult("insufficient-history", rangePct, positionPct, headroomPct);
  }
  if (ob.ok) {
    triggerFired = true;
    score += WEIGHT_TRIGGER;
    reasons.push({ rule: "Demand D1 OB touch", points: WEIGHT_TRIGGER, source: SOURCE_OB_D1 });
  }

  const macd = signalOverrides.macd ?? macdNegativeTrough(bars.d1);
  if (macd.insufficient) {
    return emptyResult("insufficient-history", rangePct, positionPct, headroomPct);
  }
  if (macd.ok) {
    triggerFired = true;
    score += WEIGHT_TRIGGER;
    reasons.push({
      rule: "D1 MACD negative trough",
      points: WEIGHT_TRIGGER,
      source: SOURCE_MACD,
    });
  }

  if (triggerFired) {
    const distanceSel =
      signalOverrides.distance ??
      selectDistanceTarget(bars.d1, pointSize, high, windowStart);
    if (distanceSel.insufficient) {
      return emptyResult("insufficient-history", rangePct, positionPct, headroomPct);
    }
    if (distanceSel.target != null && price != null) {
      const distance = (distanceSel.target - price) / price;
      const distancePoints = scoreDistance(distance);
      if (distancePoints > 0) {
        score += distancePoints;
        const rule =
          distanceSel.branch === "pivot" ? "D1 pivot distance" : "30d high distance";
        reasons.push({ rule, points: distancePoints, source: SOURCE_DISTANCE });
      }
    }
  }

  return {
    status: "screened",
    score,
    marks: markCount(score),
    reasons,
    rangePct,
    positionPct,
    headroomPct,
  };
}
