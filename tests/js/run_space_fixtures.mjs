/* Hand-checked fixtures for FVG close-to-open-space rules. Dev-time only:
 *   node tests/js/run_space_fixtures.mjs
 *
 * Each case is named after the rule it exercises; assertions are explicit
 * rather than opaque golden blobs. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fvgZones,
  hasCloseToOpenSpace,
  spaceExtendedBody,
  spaceExtendedRange,
} from "../../web/indicators/fvg.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES_PATH = join(HERE, "..", "fixtures", "fvg-spaces", "cases.json");

const ABS_TOL = 1e-9;

let failures = 0;

function fail(caseName, message) {
  failures += 1;
  console.error(`FAIL ${caseName}: ${message}`);
}

function close(a, b) {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= Math.max(ABS_TOL, ABS_TOL * Math.max(Math.abs(a), Math.abs(b)));
}

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

const DEFAULT_PARAMS = {
  bar_limit: 1000000000,
  rect_bars: 14,
  gap_vs_bar2_range: 0,
  strict_swing_stairs: false,
  bar3_wick_body_mult: 0,
  stoch_overbought: 200,
  stoch_oversold: -100,
  min_fvg_points: 0,
  max_fvg_points: 0,
  ema_fast: 2,
  ema_center: 3,
  ema_slow: 5,
  stoch_k: 3,
  stoch_slowing: 1,
};

function warmupBars(count = 5) {
  const bars = [];
  for (let i = 0; i < count; i++) {
    bars.push({
      time: i * 3600,
      open: 100,
      high: 100.2,
      low: 99.8,
      close: 100,
    });
  }
  return bars;
}

const fixture = JSON.parse(readFileSync(CASES_PATH, "utf-8"));

for (const testCase of fixture.cases) {
  const name = testCase.name;
  const bars = testCase.bars ?? [...warmupBars(), ...testCase.triplet_bars];
  const params = jsParams({ ...DEFAULT_PARAMS, ...testCase.params });

  if (testCase.rule === "close-to-open-space") {
    for (const check of testCase.checks) {
      const got = hasCloseToOpenSpace(bars, check.index);
      if (got !== check.has_space) {
        fail(name, `index ${check.index}: hasSpace ${got} != ${check.has_space}`);
      }
    }
    if (testCase.extended_body != null) {
      const got = spaceExtendedBody(bars, testCase.extended_body.index);
      if (!close(got, testCase.extended_body.value)) {
        fail(name, `extended body ${got} != ${testCase.extended_body.value}`);
      }
    }
    if (testCase.extended_range != null) {
      const got = spaceExtendedRange(bars, testCase.extended_range.index);
      if (!close(got, testCase.extended_range.value)) {
        fail(name, `extended range ${got} != ${testCase.extended_range.value}`);
      }
    }
  } else if (testCase.rule === "body-dominance") {
    const j3 = bars.length - 2;
    const j2 = j3 - 1;
    const j1 = j3 - 2;
    const recorded = [j1, j2, j3].map((j) => Math.abs(bars[j].close - bars[j].open));
    const extended = [j1, j2, j3].map((j) => spaceExtendedBody(bars, j));
    const domRecorded = recorded[1] >= recorded[0] && recorded[1] >= recorded[2];
    const domExtended = extended[1] >= extended[0] && extended[1] >= extended[2];
    if (domRecorded !== testCase.recorded_dominance_passes) {
      fail(
        name,
        `recorded dominance ${domRecorded} != ${testCase.recorded_dominance_passes}`,
      );
    }
    if (domExtended !== testCase.extended_dominance_passes) {
      fail(
        name,
        `extended dominance ${domExtended} != ${testCase.extended_dominance_passes}`,
      );
    }
    const { zones } = fvgZones(bars, fixture.point_size, params);
    if (zones.length !== testCase.zone_count) {
      fail(name, `zone count ${zones.length} != ${testCase.zone_count}`);
    }
  } else if (testCase.rule === "bar3-wick-limit") {
    const j3 = bars.length - 2;
    const bar = bars[j3];
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const recordedBody = Math.abs(bar.close - bar.open);
    const extendedBody = spaceExtendedBody(bars, j3);
    const mult = params.bar3WickBodyMult;
    const recordedPass = upperWick <= mult * Math.max(recordedBody, fixture.point_size);
    const extendedPass = upperWick <= mult * Math.max(extendedBody, fixture.point_size);
    if (recordedPass !== testCase.recorded_wick_passes) {
      fail(name, `recorded wick pass ${recordedPass} != ${testCase.recorded_wick_passes}`);
    }
    if (extendedPass !== testCase.extended_wick_passes) {
      fail(name, `extended wick pass ${extendedPass} != ${testCase.extended_wick_passes}`);
    }
    const { zones } = fvgZones(bars, fixture.point_size, params);
    if (zones.length !== testCase.zone_count) {
      fail(name, `zone count ${zones.length} != ${testCase.zone_count}`);
    }
  } else if (testCase.rule === "gap-vs-bar2-range") {
    const j3 = bars.length - 2;
    const j2 = j3 - 1;
    const j1 = j3 - 2;
    const gap = bars[j3].low - bars[j1].high;
    const recordedRange = bars[j2].high - bars[j2].low;
    const extendedRange = spaceExtendedRange(bars, j2);
    const ratio = params.gapVsBar2Range;
    const recordedPass = gap > recordedRange * ratio;
    const extendedPass = gap > extendedRange * ratio;
    if (recordedPass !== testCase.recorded_gap_passes) {
      fail(name, `recorded gap pass ${recordedPass} != ${testCase.recorded_gap_passes}`);
    }
    if (extendedPass !== testCase.extended_gap_passes) {
      fail(name, `extended gap pass ${extendedPass} != ${testCase.extended_gap_passes}`);
    }
    const { zones } = fvgZones(bars, fixture.point_size, params);
    if (zones.length !== testCase.zone_count) {
      fail(name, `zone count ${zones.length} != ${testCase.zone_count}`);
    }
  } else if (testCase.rule === "zone-recorded-prices") {
    const { zones } = fvgZones(bars, fixture.point_size, params);
    if (zones.length !== 1) {
      fail(name, `expected 1 zone, got ${zones.length}`);
      continue;
    }
    const j1 = bars.length - 4;
    const j3 = bars.length - 2;
    const zone = zones[0];
    if (!close(zone.price_low, bars[j1].high)) {
      fail(name, `price_low ${zone.price_low} != bar1 high ${bars[j1].high}`);
    }
    if (!close(zone.price_high, bars[j3].low)) {
      fail(name, `price_high ${zone.price_high} != bar3 low ${bars[j3].low}`);
    }
  } else {
    fail(name, `unknown rule ${testCase.rule}`);
  }

  if (!failures) {
    console.log(`ok ${name}`);
  }
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log(`all ${fixture.cases.length} space cases pass`);
