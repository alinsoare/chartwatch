/* Tests for AUTO vertical-scale price-range arithmetic. Dev-time only (Node is
 * not an app dependency); CI and developers run:  node tests/js/run_auto_scale.mjs */

import {
  AUTO_SCALE_FLAT_ABSOLUTE_FLOOR,
  AUTO_SCALE_MARGIN,
  visiblePriceRange,
} from "../../web/chart/auto-scale.js";

let failures = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.error(`FAIL ${name}: ${a} != ${b}`);
  }
}

check("margin constant is 10%", AUTO_SCALE_MARGIN, 0.1);

const normalBars = [
  { low: 100, high: 110 },
  { low: 105, high: 120 },
  { low: 95, high: 115 },
];

check(
  "normal window uses low of lows and high of highs",
  visiblePriceRange(normalBars, { from: 0, to: 2 }),
  { minValue: 95, maxValue: 120 },
);

const wideSlice = [
  { low: 50, high: 60 },
  { low: 100, high: 110 },
  { low: 105, high: 120 },
];

check(
  "a narrow window excludes off-screen extremes",
  visiblePriceRange(wideSlice, { from: 1, to: 2 }),
  { minValue: 100, maxValue: 120 },
);

check(
  "a range past the last bar clamps to the final bar",
  visiblePriceRange(wideSlice, { from: 1, to: 9 }),
  { minValue: 100, maxValue: 120 },
);

const flatBars = [
  { low: 100, high: 100 },
  { low: 100, high: 100 },
];
const flatHalf = Math.max(100 * 0.0005, AUTO_SCALE_FLAT_ABSOLUTE_FLOOR);

check(
  "a flat window expands symmetrically around the price",
  visiblePriceRange(flatBars, { from: 0, to: 1 }),
  { minValue: 100 - flatHalf, maxValue: 100 + flatHalf },
);

check(
  "a zero-price flat window uses the absolute floor",
  visiblePriceRange([{ low: 0, high: 0 }], { from: 0, to: 0 }),
  {
    minValue: -AUTO_SCALE_FLAT_ABSOLUTE_FLOOR,
    maxValue: AUTO_SCALE_FLAT_ABSOLUTE_FLOOR,
  },
);

check(
  "non-finite values are skipped when usable bars remain",
  visiblePriceRange(
    [{ low: Number.NaN, high: 100 }, { low: 90, high: 110 }],
    { from: 0, to: 1 },
  ),
  { minValue: 90, maxValue: 110 },
);

check(
  "an all-unusable window returns null",
  visiblePriceRange(
    [{ low: Number.NaN, high: Number.POSITIVE_INFINITY }],
    { from: 0, to: 0 },
  ),
  null,
);

check("an empty bar array returns null", visiblePriceRange([], { from: 0, to: 1 }), null);
check("a missing range returns null", visiblePriceRange(normalBars, null), null);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all auto scale checks pass");
