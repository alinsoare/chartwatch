/* Tests for drag-pan suppression and its undo. Dev-time only (Node is not an
 * app dependency); CI and developers run:  node tests/js/run_scroll_lock.mjs
 *
 * The bug this guards against was not in the logic but in what the saved value
 * referred to: lightweight-charts hands out its live options object and merges
 * into it in place, so saving `chart.options().handleScroll` saved a view of the
 * suppressed state and "restoring" it left the chart unpannable until a reload.
 *
 * The stub below therefore reproduces those two behaviours rather than
 * pretending options are immutable — and asserts that it does, because a stub
 * that quietly started returning copies would pass against the original bug and
 * this file would be worthless.
 */

import { suppressDragPan, suppressPriceAxisScale } from "../../web/chart-tools/scroll-lock.js";

let failures = 0;

function check(name, actual, expected) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    console.error(`FAIL ${name}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}

/* Mirrors the library's merge: recurse into an existing nested object and assign
 * into it, rather than replacing it. */
function mergeInPlace(target, patch) {
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    const existing = target[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing !== undefined &&
      typeof existing === "object" &&
      existing !== null &&
      !Array.isArray(existing)
    ) {
      mergeInPlace(existing, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function stubChart(handleScroll = {}, handleScale = {}) {
  const options = {
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
      ...handleScroll,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: true,
      axisDoubleClickReset: true,
      ...handleScale,
    },
  };
  return {
    options: () => options, // live reference, exactly as the library does
    applyOptions: (patch) => mergeInPlace(options, patch),
  };
}

const panning = (chart) => chart.options().handleScroll.pressedMouseMove;

/* ---------- the stub reproduces the trap ---------- */

{
  const chart = stubChart();
  const live = chart.options().handleScroll;
  chart.applyOptions({ handleScroll: { pressedMouseMove: false } });
  check("options() hands back a live reference", live.pressedMouseMove, false);
  check("the nested object is merged, not replaced", chart.options().handleScroll, live);

  // The original bug, spelled out: saving without copying saves nothing.
  const naive = chart.options().handleScroll;
  chart.applyOptions({ handleScroll: { ...naive, pressedMouseMove: false } });
  check("saving the reference captures the suppressed value", naive.pressedMouseMove, false);
}

/* ---------- suppress and restore ---------- */

{
  const chart = stubChart();
  check("panning starts enabled", panning(chart), true);

  const restore = suppressDragPan(chart);
  check("suppressed while the tool is active", panning(chart), false);

  restore();
  check("restored when the tool deactivates", panning(chart), true);
}

{
  const chart = stubChart();
  for (let i = 0; i < 3; i += 1) suppressDragPan(chart)();
  check("repeated round trips leave panning on", panning(chart), true);
}

/* ---------- the other scroll flags are left alone ---------- */

{
  const chart = stubChart({ mouseWheel: false });
  const restore = suppressDragPan(chart);
  check("an unrelated flag survives suppression", chart.options().handleScroll.mouseWheel, false);
  check("touch drag is untouched while suppressed", chart.options().handleScroll.horzTouchDrag, true);

  restore();
  check("an unrelated flag is not switched back on", chart.options().handleScroll.mouseWheel, false);
  check("touch drag is untouched after restore", chart.options().handleScroll.horzTouchDrag, true);
  check("only panning was restored", panning(chart), true);
}

/* ---------- a stale undo is inert ---------- */

{
  const chart = stubChart();
  const restore = suppressDragPan(chart);
  restore();
  chart.applyOptions({ handleScroll: { pressedMouseMove: false } }); // someone else's change
  restore();
  check("a second call does not overwrite a later change", panning(chart), false);
}

/* ---------- price-axis scale suppression ---------- */

const priceDrag = (chart) => chart.options().handleScale.axisPressedMouseMove;
const priceReset = (chart) => chart.options().handleScale.axisDoubleClickReset;

{
  const chart = stubChart();
  check("price drag starts enabled", priceDrag(chart), true);

  const restore = suppressPriceAxisScale(chart);
  checkDeep("price drag is off while suppressed", priceDrag(chart), { time: true, price: false });
  checkDeep("price reset is off while suppressed", priceReset(chart), { time: true, price: false });

  restore();
  check("price drag is restored", priceDrag(chart), true);
  check("price reset is restored", priceReset(chart), true);
}

{
  const chart = stubChart({}, { axisPressedMouseMove: { time: false, price: true } });
  const restore = suppressPriceAxisScale(chart);
  checkDeep("an object flag is copied before suppression", priceDrag(chart), { time: false, price: false });
  restore();
  checkDeep("the pre-suppression object is restored", priceDrag(chart), { time: false, price: true });
}

{
  const chart = stubChart();
  const restore = suppressPriceAxisScale(chart);
  restore();
  restore();
  check("a second price-axis restore is a no-op", priceDrag(chart), true);
}

{
  const chart = stubChart();
  const restore = suppressPriceAxisScale(chart);
  restore();
  chart.applyOptions({ handleScale: { axisPressedMouseMove: { time: true, price: false } } });
  restore();
  checkDeep(
    "a stale price-axis restore does not overwrite a later change",
    priceDrag(chart),
    { time: true, price: false },
  );
}

function checkDeep(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.error(`FAIL ${name}: ${a} != ${b}`);
  }
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all scroll lock checks pass");
