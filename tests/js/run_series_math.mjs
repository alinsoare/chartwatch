/* Unit tests for shared EMA/stochastic helpers. Dev-time only:
 *   node tests/js/run_series_math.mjs
 */

import { smaSeededEmaFromSeries } from "../../web/indicators/series-math.js";

let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

function assertClose(a, b, label) {
  if (Math.abs(a - b) > 1e-12) {
    fail(`${label}: ${a} != ${b}`);
    return false;
  }
  return true;
}

// Seed index: first defined value at firstValid + period - 1.
{
  const values = [NaN, NaN, 10, 20, 30, 40, 50];
  const out = smaSeededEmaFromSeries(values, 3, 2);
  if (!Number.isNaN(out[0]) || !Number.isNaN(out[1]) || !Number.isNaN(out[2]) || !Number.isNaN(out[3])) {
    fail(`seed index: expected NaN before index 4, got ${out.slice(0, 5)}`);
  }
  if (!assertClose(out[4], 20, "seed index")) {
    // mean(10, 20, 30) at indices 2..4
  }
}

// Seed value: SMA of the first `period` defined values.
{
  const values = [1, 2, 3, 4, 5, 6];
  const out = smaSeededEmaFromSeries(values, 3, 0);
  if (!assertClose(out[2], 2, "seed value")) {
    // mean(1, 2, 3)
  }
}

// NaN-prefixed input must not poison the output.
{
  const values = [NaN, NaN, NaN, 100, 200, 300, 400];
  const out = smaSeededEmaFromSeries(values, 3, 3);
  if (!Number.isNaN(out[0]) || !Number.isNaN(out[2]) || !Number.isNaN(out[4])) {
    fail(`NaN prefix: warm-up not NaN: ${out.slice(0, 6)}`);
  }
  if (!assertClose(out[5], 200, "NaN prefix seed")) {
    // mean(100, 200, 300)
  }
  if (!Number.isFinite(out[6])) {
    fail(`NaN prefix: expected finite EMA at index 6, got ${out[6]}`);
  }
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("ok series-math helpers");
