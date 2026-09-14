/* build-screener-scores.mjs unit tests. Dev-time only; run: node tests/js/run_build_screener_scores.mjs */

import { buildScreenerScores } from "../../scripts/build-screener-scores.mjs";
import { SCAN_CACHE_VERSION } from "../../web/screener/scan.js";
import { scoreInstrument } from "../../web/screener/score.js";

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

function bar(time, open, high, low, close) {
  return { time, open, high, low, close };
}

const catalog = {
  generated_utc: "2026-09-07T12:00:00+00:00",
  symbols: [
    {
      ticker: "ENABLED.DE",
      enabled: true,
      point_size: 0.01,
    },
    {
      ticker: "DISABLED.US",
      enabled: false,
      point_size: 0.01,
    },
    {
      ticker: "SHORT.DE",
      enabled: true,
      point_size: 0.01,
    },
  ],
};

const scanBars = {
  generated_utc: "2026-09-07T12:00:00+00:00",
  symbols: {
    "ENABLED.DE": {
      d1: Array.from({ length: 5 }, (_, i) => bar(1_700_000_000 + i * 86400, 100, 120, 100, 110)),
      h1: Array.from({ length: 5 }, (_, i) => bar(1_700_000_000 + i * 3600, 100, 120, 100, 110)),
    },
    "SHORT.DE": {
      d1: Array.from({ length: 5 }, (_, i) => bar(1_700_000_000 + i * 86400, 100, 120, 100, 110)),
      h1: Array.from({ length: 5 }, (_, i) => bar(1_700_000_000 + i * 3600, 100, 120, 100, 110)),
    },
  },
};

const payload = buildScreenerScores(catalog, scanBars);

check("generated_utc comes from catalog", payload.generated_utc, catalog.generated_utc);
check("scoring_model_version matches SCAN_CACHE_VERSION", payload.scoring_model_version, SCAN_CACHE_VERSION);
check("symbol_count", payload.symbol_count, 3);
check("enabled_count", payload.enabled_count, 2);
check("screened_count", payload.screened_count, 0);

for (const entry of catalog.symbols) {
  const expected = !entry.enabled
    ? scoreInstrument({ enabled: false, seriesByTimeframe: {}, pointSize: entry.point_size })
    : scoreInstrument({
        enabled: true,
        seriesByTimeframe: scanBars.symbols?.[entry.ticker] ?? {},
        pointSize: entry.point_size,
      });
  checkDeep(`${entry.ticker} matches scoreInstrument()`, payload.symbols[entry.ticker], expected);
}

check("disabled symbol is not-screened", payload.symbols["DISABLED.US"].status, "not-screened");
check(
  "insufficient-history symbol is reported",
  payload.symbols["SHORT.DE"].status,
  "insufficient-history",
);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all build-screener-scores checks pass");
