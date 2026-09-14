/* Tests for default chart framing. Dev-time only (Node is not an app
 * dependency); CI and developers run:  node tests/js/run_viewport.mjs */

import {
  DEFAULT_DISPLAY_LIMIT,
  DEFAULT_ZOOM_BARS,
  defaultVisibleLogicalRange,
  latestRightOffset,
} from "../../web/chart/viewport.js";

let failures = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.error(`FAIL ${name}: ${a} != ${b}`);
  }
}

check("default zoom is 200 bars", DEFAULT_ZOOM_BARS, 200);
check("display limit default is re-exported", DEFAULT_DISPLAY_LIMIT, 5000);

check("empty series returns null", defaultVisibleLogicalRange(0, 0), null);
check("missing bar count returns null", defaultVisibleLogicalRange(null, 0), null);

check(
  "deep series frames the last 200 bars",
  defaultVisibleLogicalRange(5000, 0),
  { from: 4800, to: 4999 },
);

check(
  "deep series reserves the right offset",
  defaultVisibleLogicalRange(5000, 5),
  { from: 4800, to: 5004 },
);

check(
  "short series frames every bar",
  defaultVisibleLogicalRange(80, 0),
  { from: 0, to: 79 },
);

check(
  "exactly 200 bars frames the whole series",
  defaultVisibleLogicalRange(200, 0),
  { from: 0, to: 199 },
);

check(
  "exactly 200 bars with offset",
  defaultVisibleLogicalRange(200, 3),
  { from: 0, to: 202 },
);

check("latest offset leaves 10% of view to the right", latestRightOffset({ from: 0, to: 200 }), 20);
check("latest offset preserves a 40-bar zoom", latestRightOffset({ from: 100, to: 140 }), 4);
check("latest offset handles a missing range", latestRightOffset(null), 0);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all viewport checks pass");
