/* Drag-pan suppression for chart tools.
 *
 * A tool that listens for clicks has to switch drag-panning off first, because
 * lightweight-charts emits a click at the end of a drag and the tool would read
 * that as a deliberate one.
 *
 * Switching it back on is the part that needs care, and the reason this lives in
 * its own module: `chart.options()` returns the chart's live options object, and
 * `applyOptions` merges into it in place. Saving `chart.options().handleScroll`
 * and restoring it later therefore saves a reference to the object the next line
 * mutates, so the "previous" value reads back as the suppressed one. With a
 * single chart for the lifetime of the page, that leaves the chart unpannable
 * until a reload. Copying the flags before applying anything is what makes the
 * restore mean what it says.
 *
 * Covered by tests/js/run_scroll_lock.mjs, against a stub that reproduces both
 * behaviours; the interaction itself is only checkable by hand.
 */

function copyAxisFlag(value) {
  return typeof value === "object" && value !== null ? { ...value } : value;
}

function priceAxisOff(value) {
  if (value === true) return { time: true, price: false };
  if (typeof value === "object" && value !== null) return { ...value, price: false };
  return value;
}

/* Disables drag-panning and returns the function that puts it back. */
export function suppressDragPan(chart) {
  const previous = { ...chart.options().handleScroll };
  chart.applyOptions({ handleScroll: { ...previous, pressedMouseMove: false } });

  let restored = false;
  return function restore() {
    if (restored) return; // a stale undo must not overwrite a later change
    restored = true;
    chart.applyOptions({ handleScroll: previous });
  };
}

/* Disables price-axis drag scaling and double-click reset while AUTO is on. */
export function suppressPriceAxisScale(chart) {
  const live = chart.options().handleScale;
  const previous = {
    ...live,
    axisPressedMouseMove: copyAxisFlag(live.axisPressedMouseMove),
    axisDoubleClickReset: copyAxisFlag(live.axisDoubleClickReset),
  };
  chart.applyOptions({
    handleScale: {
      ...previous,
      axisPressedMouseMove: priceAxisOff(previous.axisPressedMouseMove),
      axisDoubleClickReset: priceAxisOff(previous.axisDoubleClickReset),
    },
  });

  let restored = false;
  return function restore() {
    if (restored) return;
    restored = true;
    chart.applyOptions({ handleScale: previous });
  };
}
