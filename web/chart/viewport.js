/* Default chart framing: which bars are visible vs which are available.
 *
 * The display limit (see settings.js) bounds how many bars are loaded into the
 * chart and pannable; the default zoom bounds how many of those are visible at
 * once when the view is presented afresh. Chart-free and DOM-free so the
 * arithmetic is testable outside a browser.
 */

import { DEFAULT_DISPLAY_LIMIT } from "../settings.js";

/** Bars visible in the initial view when a series is presented afresh. */
export const DEFAULT_ZOOM_BARS = 200;
export const LATEST_RIGHT_MARGIN = 0.1;

/** Re-exported so the two limits sit together: available vs visible. */
export { DEFAULT_DISPLAY_LIMIT };

/** Turn a bar count and the time scale's right offset into a visible logical
 *  range for the default zoom. Returns null when there are no bars. */
export function defaultVisibleLogicalRange(barCount, rightOffset, zoomBars = DEFAULT_ZOOM_BARS) {
  if (!barCount || barCount <= 0) return null;

  const lastIndex = barCount - 1;
  const visibleBars = Math.min(barCount, zoomBars);
  return {
    from: barCount - visibleBars,
    to: lastIndex + rightOffset,
  };
}

/** Return the logical-bar offset that places the newest bar at the requested
 * fraction of the chart width while preserving the current zoom span. */
export function latestRightOffset(
  logicalRange,
  rightMargin = LATEST_RIGHT_MARGIN,
) {
  if (
    !logicalRange ||
    !Number.isFinite(logicalRange.from) ||
    !Number.isFinite(logicalRange.to) ||
    logicalRange.to <= logicalRange.from ||
    !Number.isFinite(rightMargin) ||
    rightMargin < 0 ||
    rightMargin >= 1
  ) {
    return 0;
  }
  return (logicalRange.to - logicalRange.from) * rightMargin;
}
