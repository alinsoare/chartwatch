/* Golden-fixture tests for the JS FVG port. Dev-time only (Node is not an app
 * dependency); CI and developers run:  node tests/js/run_fixtures.mjs
 *
 * Compares, against values recorded from the reference Python implementation:
 * - SMA-seeded EMA arrays (strict tolerance: seeding bugs surface here first),
 * - the stochastic array,
 * - the zones themselves (times exact, prices to tolerance),
 * - the insufficient-history warning.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fvgZones, lowHighStochastic, smaSeededEma } from "../../web/indicators/fvg.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, "..", "fixtures", "fvg");

const ABS_TOL = 1e-9;
const REL_TOL = 1e-9;

let failures = 0;

function fail(fixture, message) {
  failures += 1;
  console.error(`FAIL ${fixture}: ${message}`);
}

function close(a, b) {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= Math.max(ABS_TOL, REL_TOL * Math.max(Math.abs(a), Math.abs(b)));
}

function compareSeries(fixture, label, actual, expectedWithNulls) {
  const expected = expectedWithNulls.map((v) => (v === null ? NaN : v));
  if (actual.length !== expected.length) {
    fail(fixture, `${label}: length ${actual.length} != ${expected.length}`);
    return;
  }
  for (let i = 0; i < expected.length; i++) {
    if (!close(actual[i], expected[i])) {
      fail(fixture, `${label}[${i}]: ${actual[i]} != ${expected[i]}`);
      return;
    }
  }
}

/* The fixture records the reference FvgParams (snake_case, including the
 * bar_limit the rebuild dropped); map to the JS parameter object. */
function jsParams(p) {
  return {
    rectBars: p.rect_bars,
    gapVsBar2Range: p.gap_vs_bar2_range,
    strictSwingStairs: p.strict_swing_stairs,
    bar3WickBodyMult: p.bar3_wick_body_mult,
    stochOverbought: p.stoch_overbought,
    stochOversold: p.stoch_oversold,
    minFvgPoints: p.min_fvg_points,
    maxFvgPoints: p.max_fvg_points,
    emaFast: p.ema_fast,
    emaCenter: p.ema_center,
    emaSlow: p.ema_slow,
    stochK: p.stoch_k,
    stochSlowing: p.stoch_slowing,
  };
}

const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"));
if (!files.length) {
  console.error(`no fixtures found in ${FIXTURE_DIR}; run tools/generate_fvg_fixtures.py`);
  process.exit(1);
}

for (const file of files) {
  const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf-8"));
  const name = fixture.name;
  const bars = fixture.bars;
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const params = jsParams(fixture.params);

  for (const [period, expected] of Object.entries(fixture.ema)) {
    compareSeries(name, `ema${period}`, smaSeededEma(closes, Number(period)), expected);
  }
  compareSeries(
    name,
    "stoch",
    lowHighStochastic(highs, lows, closes, params.stochK, params.stochSlowing),
    fixture.stoch,
  );

  const { zones, warning } = fvgZones(bars, fixture.point_size, params);

  if ((warning || null) !== (fixture.warning || null)) {
    fail(name, `warning ${JSON.stringify(warning)} != ${JSON.stringify(fixture.warning)}`);
  }
  if (zones.length !== fixture.zones.length) {
    fail(name, `zone count ${zones.length} != ${fixture.zones.length}`);
  } else {
    for (let i = 0; i < zones.length; i++) {
      const got = zones[i];
      const want = fixture.zones[i];
      const exact = ["direction", "time_from", "time_to", "label_time"];
      const approx = ["price_low", "price_high", "label_price"];
      for (const key of exact) {
        if (got[key] !== want[key]) {
          fail(name, `zone[${i}].${key}: ${got[key]} != ${want[key]}`);
        }
      }
      for (const key of approx) {
        if (!close(got[key], want[key])) {
          fail(name, `zone[${i}].${key}: ${got[key]} != ${want[key]}`);
        }
      }
    }
  }

  if (!failures) {
    console.log(`ok ${name}: ${zones.length} zones match`);
  }
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log(`all ${files.length} fixtures pass`);
