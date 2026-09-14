/* Screener row rendering unit tests. Dev-time only; run: node tests/js/run_render.mjs */

import {
  renderMarks,
  renderSourceNames,
  renderScreenerRow,
} from "../../web/screener/render.js";
import { scoreInstrument } from "../../web/screener/score.js";
import {
  SOURCE_DISTANCE,
  SOURCE_FVG_D1,
  SOURCE_MACD,
  SOURCE_OB_D1,
} from "../../web/screener/score.js";

let failures = 0;

function countMarkSpans(html) {
  return (html.match(/<span class="screener-mark"><\/span>/g) ?? []).length;
}

function countSourceSpans(html) {
  return (html.match(/<span class="screener-source">/g) ?? []).length;
}

function check(name, actual, expected) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    console.error(`FAIL ${name}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}

function checkTrue(name, condition) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const symbol = {
  ticker: "TEST.US",
  asset_class: "stock",
  name: "Test Instrument",
};

const fullReasons = [
  { rule: "Bullish D1 FVG touch", points: 1, source: SOURCE_FVG_D1 },
  { rule: "Demand D1 OB touch", points: 1, source: SOURCE_OB_D1 },
  { rule: "D1 MACD negative trough", points: 1, source: SOURCE_MACD },
  { rule: "30d high distance", points: 3, source: SOURCE_DISTANCE },
];

/* ---------- renderMarks ---------- */

check("renderMarks with 0 marks", renderMarks(0, fullReasons), "");

const oneMark = renderMarks(1, [{ rule: "Bullish D1 FVG touch", points: 1 }]);
checkTrue("one mark emits one dot span", countMarkSpans(oneMark) === 1);
checkTrue(
  "one mark tooltip carries rule and points",
  oneMark.includes('title="Bullish D1 FVG touch: 1"'),
);

const fourMarks = renderMarks(4, fullReasons);
checkTrue("four marks emit four dot spans", countMarkSpans(fourMarks) === 4);
checkTrue(
  "four marks tooltip carries all rules",
  fourMarks.includes("Bullish D1 FVG touch: 1") &&
    fourMarks.includes("Demand D1 OB touch: 1") &&
    fourMarks.includes("D1 MACD negative trough: 1") &&
    fourMarks.includes("30d high distance: 3"),
);

const escapedMarks = renderMarks(1, [{ rule: 'Rule <with> "quotes"', points: 1 }]);
checkTrue(
  "renderMarks escapes tooltip HTML",
  escapedMarks.includes('title="Rule &lt;with&gt; &quot;quotes&quot;: 1"'),
);

/* ---------- renderSourceNames ---------- */

check("renderSourceNames empty", renderSourceNames([]), "");

const multiSources = renderSourceNames(fullReasons);
checkTrue(
  "renderSourceNames emits one span per reason",
  countSourceSpans(multiSources) === 4,
);
checkTrue(
  "renderSourceNames preserves order",
  multiSources.indexOf(SOURCE_FVG_D1) <
    multiSources.indexOf(SOURCE_OB_D1) &&
    multiSources.indexOf(SOURCE_OB_D1) < multiSources.indexOf(SOURCE_MACD) &&
    multiSources.indexOf(SOURCE_MACD) < multiSources.indexOf(SOURCE_DISTANCE),
);

const escapedSources = renderSourceNames([{ source: 'A <tag> & "quote"' }]);
checkTrue(
  "renderSourceNames escapes source text",
  escapedSources.includes("A &lt;tag&gt; &amp; &quot;quote&quot;"),
);

/* ---------- renderScreenerRow ---------- */

const fullRow = renderScreenerRow(symbol, {
  status: "screened",
  score: 6,
  marks: 4,
  reasons: fullReasons,
  rangePct: 0.1234,
  positionPct: 0.5678,
  headroomPct: 0.0294,
});
checkTrue(
  "full confluence row has marks inline with symbol code",
  fullRow.includes('<span class="symbol-code">TEST.US<span class="screener-marks"'),
);
checkTrue("full confluence row has four mark spans", countMarkSpans(fullRow) === 4);
checkTrue(
  "full confluence row has four source spans in order",
  countSourceSpans(fullRow) === 4 &&
    fullRow.includes(`>${SOURCE_FVG_D1}<`) &&
    fullRow.includes(`>${SOURCE_OB_D1}<`) &&
    fullRow.includes(`>${SOURCE_MACD}<`) &&
    fullRow.includes(`>${SOURCE_DISTANCE}<`),
);
checkTrue(
  "full confluence row shows range, position and headroom figures",
  fullRow.includes("30d range 12.3%") &&
    fullRow.includes("position 56.8%") &&
    fullRow.includes("headroom 2.9%"),
);

const quietRow = renderScreenerRow(symbol, {
  status: "screened",
  score: 0,
  marks: 0,
  reasons: [],
  rangePct: 0.1,
  positionPct: 0.2,
  headroomPct: 0.05,
});
checkTrue("quiet row has no marks", countMarkSpans(quietRow) === 0);
checkTrue("quiet row has no source names", !quietRow.includes("screener-sources"));
checkTrue(
  "quiet row still shows range, position and headroom figures",
  quietRow.includes("30d range 10.0%") &&
    quietRow.includes("position 20.0%") &&
    quietRow.includes("headroom 5.0%"),
);

const negativeHeadroomRow = renderScreenerRow(symbol, {
  status: "screened",
  score: 0,
  marks: 0,
  reasons: [],
  rangePct: 0.1,
  positionPct: 0.95,
  headroomPct: -0.012,
});
checkTrue(
  "negative headroom is rendered with its sign",
  negativeHeadroomRow.includes("headroom -1.2%"),
);

const nullHeadroomRow = renderScreenerRow(symbol, {
  status: "screened",
  score: 0,
  marks: 0,
  reasons: [],
  rangePct: 0.1,
  positionPct: 0.2,
  headroomPct: null,
});
checkTrue(
  "null headroom renders as em dash beside real range and position",
  nullHeadroomRow.includes("30d range 10.0%") &&
    nullHeadroomRow.includes("position 20.0%") &&
    nullHeadroomRow.includes("headroom —"),
);

const notScreenedRow = renderScreenerRow(symbol, {
  status: "not-screened",
  score: 0,
  marks: 0,
  reasons: [],
  rangePct: null,
  positionPct: null,
});
checkTrue("not-screened row shows state text", notScreenedRow.includes("not screened"));
checkTrue("not-screened row has no marks", countMarkSpans(notScreenedRow) === 0);
checkTrue("not-screened row has no sources", !notScreenedRow.includes("screener-sources"));

const insufficientNoWindowRow = renderScreenerRow(symbol, {
  status: "insufficient-history",
  score: 0,
  marks: 0,
  reasons: [],
  rangePct: null,
  positionPct: null,
  headroomPct: null,
});
checkTrue(
  "insufficient-history without a window shows state text",
  insufficientNoWindowRow.includes("insufficient history"),
);
checkTrue(
  "insufficient-history without a window has no figures line",
  !insufficientNoWindowRow.includes("screener-figures"),
);

const insufficientWithWindowRow = renderScreenerRow(symbol, {
  status: "insufficient-history",
  score: 0,
  marks: 0,
  reasons: [],
  rangePct: 0.1,
  positionPct: 0.2,
  headroomPct: 0.05,
});
checkTrue(
  "insufficient-history with window figures shows range, position and headroom",
  insufficientWithWindowRow.includes("30d range 10.0%") &&
    insufficientWithWindowRow.includes("position 20.0%") &&
    insufficientWithWindowRow.includes("headroom 5.0%"),
);

/* ---------- equal score, different sources ---------- */

const fvgDistanceRow = renderScreenerRow(symbol, {
  status: "screened",
  score: 3,
  marks: 2,
  reasons: [
    { rule: "Bullish D1 FVG touch", points: 1, source: SOURCE_FVG_D1 },
    { rule: "30d high distance", points: 2, source: SOURCE_DISTANCE },
  ],
  rangePct: 0.1,
  positionPct: 0.2,
});

const allTriggersRow = renderScreenerRow(symbol, {
  status: "screened",
  score: 3,
  marks: 2,
  reasons: [
    { rule: "Bullish D1 FVG touch", points: 1, source: SOURCE_FVG_D1 },
    { rule: "Demand D1 OB touch", points: 1, source: SOURCE_OB_D1 },
    { rule: "D1 MACD negative trough", points: 1, source: SOURCE_MACD },
  ],
  rangePct: 0.1,
  positionPct: 0.2,
});

check(
  "equal-score rows share mark count",
  countMarkSpans(fvgDistanceRow),
  countMarkSpans(allTriggersRow),
);
checkTrue(
  "equal-score rows differ in source text",
  fvgDistanceRow.includes(`>${SOURCE_DISTANCE}<`) &&
    !allTriggersRow.includes(`>${SOURCE_DISTANCE}<`) &&
    allTriggersRow.includes(`>${SOURCE_OB_D1}<`),
);

/* ---------- symbol browser row states ---------- */

function rowHasThreeFigures(html) {
  return (
    html.includes("screener-figures") &&
    html.includes("30d range") &&
    html.includes("position") &&
    html.includes("headroom")
  );
}

function makeScanSeries(d1Len, h1Len) {
  const bar = (time) => ({ time, open: 100, high: 120, low: 100, close: 110 });
  const mk = (n, step) => Array.from({ length: n }, (_, i) => bar(1_700_000_000 + i * step));
  return { d1: mk(d1Len, 86400), h1: mk(h1Len, 3600) };
}

const screenedResult = scoreInstrument({
  enabled: true,
  pointSize: 0.01,
  seriesByTimeframe: makeScanSeries(420, 420),
  signalOverrides: {
    fvgD1: { ok: false, insufficient: false },
    obD1: { ok: false, insufficient: false },
    macd: { ok: false, insufficient: false },
  },
});
const quietHtml = renderScreenerRow(symbol, screenedResult);
checkTrue("screened quiet row shows three labelled figures", rowHasThreeFigures(quietHtml));
checkTrue("screened quiet row has no marks", countMarkSpans(quietHtml) === 0);

const shortWarmupResult = scoreInstrument({
  enabled: true,
  pointSize: 0.01,
  seriesByTimeframe: makeScanSeries(200, 420),
});
const partialHistoryHtml = renderScreenerRow(symbol, shortWarmupResult);
checkTrue(
  "insufficient-history with a 30d window shows three figures",
  shortWarmupResult.status === "insufficient-history" &&
    shortWarmupResult.rangePct != null &&
    rowHasThreeFigures(partialHistoryHtml),
);

const notScreenedResult = scoreInstrument({
  enabled: false,
  seriesByTimeframe: {},
  pointSize: 0.01,
});
const notScreenedHtml = renderScreenerRow(symbol, notScreenedResult);
checkTrue(
  "not-screened row keeps state text instead of figures",
  notScreenedHtml.includes("not screened") && !notScreenedHtml.includes("screener-figures"),
);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all render checks pass");
