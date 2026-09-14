/* Accumulation screener unit tests. Dev-time only; run: node tests/js/run_screener.mjs */

import {
  columnarToBars,
  currentDayBar,
  currentPrice,
  intervalsOverlap,
  lastCompletedIndex,
} from "../../web/screener/bars.js";
import { computeRange } from "../../web/screener/range.js";
import {
  isMacdRedMorningStarTrough,
  macdNegativeTrough,
  selectDistanceTarget,
} from "../../web/screener/signals.js";
import {
  DISTANCE_BANDS,
  markCount,
  scoreDistance,
  scoreInstrument,
  SOURCE_DISTANCE,
  SOURCE_FVG_D1,
  SOURCE_MACD,
  SOURCE_OB_D1,
  WEIGHT_TRIGGER,
} from "../../web/screener/score.js";

let failures = 0;

function check(name, actual, expected) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    console.error(`FAIL ${name}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}

function checkDeep(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.error(`FAIL ${name}: ${a} != ${b}`);
  }
}

function checkTrue(name, condition) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

function bar(time, open, high, low, close) {
  return { time, open, high, low, close };
}

function makeBars(count, start = 1_700_000_000, step = 86400, base = 100) {
  return Array.from({ length: count }, (_, i) =>
    bar(start + i * step, base + i, base + i + 2, base + i - 1, base + i + 1),
  );
}

function tuneWindowTail(d1Bars, { high, low, close }) {
  for (let i = d1Bars.length - 31; i < d1Bars.length - 1; i++) {
    d1Bars[i] = bar(d1Bars[i].time, low, high, low, close);
  }
  d1Bars[d1Bars.length - 1] = bar(
    d1Bars[d1Bars.length - 1].time,
    close,
    high,
    low,
    close,
  );
  return d1Bars;
}

function makeScanSeries(d1Len, h1Len = 5) {
  const mk = (n, step) => Array.from({ length: n }, (_, i) => bar(1_700_000_000 + i * step, 100, 120, 100, 110));
  return { d1: mk(d1Len, 86400), h1: mk(h1Len, 3600) };
}

/* ---------- conventions ---------- */

const fiveBars = [
  bar(1, 10, 12, 9, 11),
  bar(2, 11, 13, 10, 12),
  bar(3, 12, 14, 11, 13),
  bar(4, 13, 15, 12, 14),
  bar(5, 14, 16, 13, 15),
];
check("lastCompletedIndex", lastCompletedIndex(fiveBars), 3);
checkDeep("currentDayBar is newest stored bar", currentDayBar(fiveBars), fiveBars[4]);

check(
  "currentPrice picks freshest timeframe",
  currentPrice({
    d1: [bar(1, 1, 2, 0.5, 1)],
    h1: [bar(100, 2, 3, 1.5, 2.5)],
  }),
  2.5,
);

check("interval overlap on shared interior", intervalsOverlap(10, 20, 15, 25), true);
check("wick touch at zone edge counts", intervalsOverlap(100, 105, 105, 110), true);
check("disjoint intervals do not overlap", intervalsOverlap(10, 20, 30, 40), false);

const columnar = { t: [1, 2], o: [1, 2], h: [2, 3], l: [0.5, 1.5], c: [1.5, 2.5] };
checkDeep("columnarToBars", columnarToBars(columnar), [
  bar(1, 1, 2, 0.5, 1.5),
  bar(2, 2, 3, 1.5, 2.5),
]);

checkTrue(
  "wick into zone and close outside still overlaps",
  intervalsOverlap(98, 106, 100, 105),
);

/* ---------- MACD negative trough ---------- */

check(
  "negative-territory trough fires",
  isMacdRedMorningStarTrough(-0.42, -0.61, -0.35),
  true,
);
check(
  "rising triple above zero does not fire",
  isMacdRedMorningStarTrough(0.1, 0.2, 0.3),
  false,
);
check(
  "trough with newest above zero does not fire",
  isMacdRedMorningStarTrough(-0.15, -0.05, 0.08),
  false,
);
check(
  "still-falling triple does not fire",
  isMacdRedMorningStarTrough(-0.2, -0.4, -0.6),
  false,
);
check(
  "flat pair below zero does not fire",
  isMacdRedMorningStarTrough(-0.3, -0.3, -0.2),
  false,
);
check(
  "exact zero newest bar does not fire",
  isMacdRedMorningStarTrough(-0.1, -0.3, 0),
  false,
);

const macdBars = makeBars(80, 1_700_000_000, 3600, 50);
const macdResult = macdNegativeTrough(macdBars);
check("macd negative trough is boolean", typeof macdResult.ok, "boolean");
check("short macd series is insufficient", macdNegativeTrough(makeBars(10)).insufficient, true);

const flatMacdBars = makeBars(80, 1_700_000_000, 3600, 50);
for (let i = 0; i < flatMacdBars.length; i++) {
  flatMacdBars[i] = bar(flatMacdBars[i].time, 50, 50.5, 49.5, 50);
}
check("flat histogram does not count as negative trough", macdNegativeTrough(flatMacdBars).ok, false);

/* ---------- distance bands ---------- */

check("distance at or below 3% scores 0", scoreDistance(0.03), 0);
check("distance exactly 5% scores 1", scoreDistance(0.05), 1);
check("distance exactly 8% scores 2", scoreDistance(0.08), 2);
check("distance above 8% scores 3", scoreDistance(0.14), 3);
check("distance bands constant", DISTANCE_BANDS.join(","), "0.03,0.05,0.08");

/* ---------- range and position ---------- */

const d1Window = [
  bar(1_700_000_000, 90, 100, 80, 95),
  bar(1_700_086_400, 95, 110, 85, 100),
  bar(1_700_172_800, 100, 120, 90, 105),
];
const rangeAtBottom = computeRange(d1Window, 82);
checkDeep("range arithmetic", {
  rangePct: Number(rangeAtBottom.rangePct?.toFixed(4)),
  positionPct: Number(rangeAtBottom.positionPct?.toFixed(4)),
}, { rangePct: 0.5, positionPct: 0.05 });
check(
  "windowStart is newest bar time minus 30 days",
  rangeAtBottom.windowStart,
  d1Window[2].time - 30 * 86400,
);

const flatRange = [
  bar(1_700_000_000, 100, 100, 100, 100),
  bar(1_700_086_400, 100, 100, 100, 100),
];
const zeroRange = computeRange(flatRange, 100);
check("zero-range window yields null rangePct", zeroRange.rangePct, null);
check("zero-range window yields null positionPct", zeroRange.positionPct, null);
check("zero-range window yields null headroomPct", zeroRange.headroomPct, null);

const headroomWindow = [bar(1_700_000_000, 100, 140, 100, 136)];
const atNinetyPct = computeRange(headroomWindow, 136);
check("headroom example range is 40%", Number(atNinetyPct.rangePct?.toFixed(4)), 0.4);
check("headroom example position is 90%", Number(atNinetyPct.positionPct?.toFixed(4)), 0.9);
check("headroom is (high - price) / price", atNinetyPct.headroomPct, (140 - 136) / 136);

const atLow = computeRange(headroomWindow, 100);
check("headroom at the low equals the range", atLow.headroomPct, atLow.rangePct);

const aboveHigh = computeRange(headroomWindow, 145);
checkTrue(
  "headroom above the window high is negative and unclamped",
  aboveHigh.headroomPct != null && aboveHigh.headroomPct < 0,
);
check("headroom above high is (high - price) / price", aboveHigh.headroomPct, (140 - 145) / 145);

check("no bars yields null headroomPct", computeRange([], 100).headroomPct, null);
check("no price yields null headroomPct", computeRange(headroomWindow, null).headroomPct, null);

check(
  "not-screened has null headroomPct",
  scoreInstrument({ enabled: false, seriesByTimeframe: {}, pointSize: 0.01 }).headroomPct,
  null,
);

const insufficient = scoreInstrument({
  enabled: true,
  pointSize: 0.01,
  seriesByTimeframe: { d1: makeBars(5), h1: makeBars(5) },
});
check("insufficient-history carries headroomPct key", "headroomPct" in insufficient, true);

/* ---------- mark buckets ---------- */

check("mark buckets at 0", markCount(0), 0);
check("mark buckets at 1", markCount(1), 1);
check("mark buckets at 2", markCount(2), 2);
check("mark buckets at 3", markCount(3), 2);
check("mark bucket at 4", markCount(4), 3);
check("mark bucket at 5", markCount(5), 3);
check("mark bucket at 6", markCount(6), 4);

/* ---------- score composition ---------- */

const gateOpenD1 = tuneWindowTail(makeBars(400, 1_700_000_000, 86400, 100), {
  high: 110,
  low: 100,
  close: 102,
});

const fullConfluence = scoreInstrument({
  enabled: true,
  pointSize: 0.01,
  seriesByTimeframe: makeScanSeries(400),
  signalOverrides: {
    fvgD1: { ok: true, insufficient: false },
    obD1: { ok: true, insufficient: false },
    macd: { ok: true, insufficient: false },
    distance: { target: 125, branch: "window", insufficient: false },
  },
});
check("full confluence score", fullConfluence.score, 6);
check("full confluence marks", fullConfluence.marks, 4);
checkDeep("full confluence reasons", fullConfluence.reasons, [
  { rule: "Bullish D1 FVG touch", points: 1, source: SOURCE_FVG_D1 },
  { rule: "Demand D1 OB touch", points: 1, source: SOURCE_OB_D1 },
  { rule: "D1 MACD negative trough", points: 1, source: SOURCE_MACD },
  { rule: "30d high distance", points: 3, source: SOURCE_DISTANCE },
]);
check(
  "full confluence source names are distinct",
  new Set(fullConfluence.reasons.map((r) => r.source)).size,
  4,
);

const pivotBranch = scoreInstrument({
  enabled: true,
  pointSize: 0.01,
  seriesByTimeframe: makeScanSeries(400),
  signalOverrides: {
    fvgD1: { ok: true, insufficient: false },
    obD1: { ok: false, insufficient: false },
    macd: { ok: false, insufficient: false },
    distance: { target: 114, branch: "pivot", insufficient: false },
  },
});
checkTrue(
  "pivot branch audit wording",
  pivotBranch.reasons.some((r) => r.rule === "D1 pivot distance" && r.source === SOURCE_DISTANCE),
);

const oneTriggerNear = scoreInstrument({
  enabled: true,
  pointSize: 0.01,
  seriesByTimeframe: makeScanSeries(400),
  signalOverrides: {
    fvgD1: { ok: false, insufficient: false },
    obD1: { ok: true, insufficient: false },
    macd: { ok: false, insufficient: false },
    distance: { target: 111, branch: "window", insufficient: false },
  },
});
check("one trigger with near target scores 1", oneTriggerNear.score, 1);
check("near target earns no distance points", oneTriggerNear.reasons.length, 1);

const noTriggerFar = scoreInstrument({
  enabled: true,
  pointSize: 0.01,
  seriesByTimeframe: makeScanSeries(400),
  signalOverrides: {
    fvgD1: { ok: false, insufficient: false },
    obD1: { ok: false, insufficient: false },
    macd: { ok: false, insufficient: false },
    distance: { target: 140, branch: "window", insufficient: false },
  },
});
check("no trigger means score 0 regardless of distance", noTriggerFar.score, 0);
check("no trigger records no distance", noTriggerFar.reasons.length, 0);
check("no trigger carries no mark", noTriggerFar.marks, 0);
checkTrue(
  "no trigger still reports three figures",
  noTriggerFar.rangePct != null &&
    noTriggerFar.positionPct != null &&
    noTriggerFar.headroomPct != null,
);

const quietInstrument = scoreInstrument({
  enabled: true,
  pointSize: 0.01,
  seriesByTimeframe: {
    d1: gateOpenD1,
    h1: makeBars(400, 1_700_000_000, 3600, 100),
  },
  signalOverrides: {
    fvgD1: { ok: false, insufficient: false },
    obD1: { ok: false, insufficient: false },
    macd: { ok: false, insufficient: false },
  },
});
check("quiet instrument is screened with score 0", quietInstrument.status, "screened");
check("quiet instrument scores 0", quietInstrument.score, 0);
check("quiet instrument has no marks", quietInstrument.marks, 0);
check("quiet instrument names no source", quietInstrument.reasons.length, 0);
checkTrue("quiet instrument keeps range figures", quietInstrument.rangePct != null);

const highHeadroomD1 = tuneWindowTail(makeBars(400, 1_700_000_000, 86400, 100), {
  high: 120,
  low: 100,
  close: 102,
});
const lowHeadroomD1 = tuneWindowTail(makeBars(400, 1_700_000_000, 86400, 100), {
  high: 120,
  low: 100,
  close: 110,
});
const sharedOverrides = {
  fvgD1: { ok: false, insufficient: false },
  obD1: { ok: false, insufficient: false },
  macd: { ok: false, insufficient: false },
};
const highHeadroomScore = scoreInstrument({
  enabled: true,
  pointSize: 0.01,
  seriesByTimeframe: { d1: highHeadroomD1, h1: makeBars(5) },
  signalOverrides: sharedOverrides,
});
const lowHeadroomScore = scoreInstrument({
  enabled: true,
  pointSize: 0.01,
  seriesByTimeframe: { d1: lowHeadroomD1, h1: makeBars(5) },
  signalOverrides: sharedOverrides,
});
checkTrue(
  "different headroom does not change score when no trigger fires",
  highHeadroomScore.headroomPct !== lowHeadroomScore.headroomPct &&
    highHeadroomScore.score === lowHeadroomScore.score,
);

const shortH1 = scoreInstrument({
  enabled: true,
  pointSize: 0.01,
  seriesByTimeframe: makeScanSeries(420, 3),
  signalOverrides: sharedOverrides,
});
check(
  "short H1 does not cause insufficient history",
  shortH1.status,
  "screened",
);

const distanceTarget = selectDistanceTarget(
  makeBars(400),
  0.01,
  120,
  1_700_000_000,
);
checkTrue(
  "distance target selector returns a branch",
  distanceTarget.branch === "pivot" || distanceTarget.branch === "window",
);

checkDeep(
  "disabled instrument is not screened",
  scoreInstrument({ enabled: false, seriesByTimeframe: {}, pointSize: 0.01 }).status,
  "not-screened",
);

checkDeep(
  "insufficient history is reported",
  scoreInstrument({
    enabled: true,
    pointSize: 0.01,
    seriesByTimeframe: { d1: makeBars(5), h1: makeBars(5) },
  }).status,
  "insufficient-history",
);

check("trigger weight constant", WEIGHT_TRIGGER, 1);
check("FVG D1 source label", SOURCE_FVG_D1, "FVG D1");
check("OB D1 source label", SOURCE_OB_D1, "OB D1");
check("MACD source label", SOURCE_MACD, "MACD");
check("distance source label", SOURCE_DISTANCE, "distance");
check(
  "weights plus top distance band sum to 6",
  WEIGHT_TRIGGER * 3 + 3,
  6,
);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all screener checks pass");
