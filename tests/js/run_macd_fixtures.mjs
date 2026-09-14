/* Golden-fixture tests for the JS MACD port. Dev-time only:
 *   node tests/js/run_macd_fixtures.mjs
 *
 * Feeds the port the fixture bar series and compares main, signal and
 * histogram value by value within tolerance. Warm-up positions encoded as
 * null are skipped; first-defined indices are asserted exactly.
 *
 * Regenerate fixtures: uv run python tools/generate_macd_fixtures.py
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { macdArrays, MACD_PARAMS } from "../../web/indicators/macd.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, "..", "fixtures", "macd");

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

function oracleValue(values, index, firstIndex) {
  if (index < firstIndex) return NaN;
  const v = values[index];
  if (v === 0 && index < firstIndex) return NaN;
  return v;
}

function compareArray(fixture, label, actual, expected, firstIndex) {
  if (actual.length !== expected.length) {
    fail(fixture, `${label}: length ${actual.length} != ${expected.length}`);
    return;
  }
  for (let i = 0; i < expected.length; i++) {
    if (i < firstIndex) continue;
    const want = oracleValue(expected, i, firstIndex);
    const got = actual[i];
    if (!close(got, want)) {
      fail(fixture, `${label}[${i}]: ${got} != ${want}`);
      return;
    }
  }
}

function assertFirstIndex(fixture, label, actual, expectedFirst) {
  const idx = actual.findIndex((v) => !Number.isNaN(v));
  if (idx !== expectedFirst) {
    fail(fixture, `${label} first index ${idx} != ${expectedFirst}`);
  }
}

let files = [];
if (existsSync(FIXTURE_DIR)) {
  files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"));
}
if (!files.length) {
  console.error(
    `no fixtures found in ${FIXTURE_DIR}; run: uv run python tools/generate_macd_fixtures.py`,
  );
  process.exit(1);
}

for (const file of files) {
  const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf-8"));
  const name = fixture.name;
  const bars = fixture.bars;
  const params = {
    fast: fixture.params?.fast ?? MACD_PARAMS.fast,
    slow: fixture.params?.slow ?? MACD_PARAMS.slow,
    signal: fixture.params?.signal ?? MACD_PARAMS.signal,
  };

  const { main, signal, histogram } = macdArrays(bars, params);

  const mainFirst = fixture.main_first ?? params.slow - 1;
  const signalFirst = fixture.signal_first ?? mainFirst + params.signal - 1;
  const histFirst = fixture.hist_first ?? signalFirst;

  assertFirstIndex(name, "main", main, mainFirst);
  assertFirstIndex(name, "signal", signal, signalFirst);
  assertFirstIndex(name, "histogram", histogram, histFirst);

  compareArray(name, "main", main, fixture.main, mainFirst);
  compareArray(name, "signal", signal, fixture.signal, signalFirst);
  compareArray(name, "histogram", histogram, fixture.histogram, histFirst);

  if (!failures) {
    console.log(`ok ${name}: ${bars.length} bars compared from index ${mainFirst}/${signalFirst}`);
  }
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log(`all ${files.length} fixtures pass`);
