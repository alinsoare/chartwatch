/* Coordinate helpers shared by everything that paints on the chart.
 *
 * Chart-free and DOM-free: the time scale is handed in, so the modules that
 * use this stay importable by the dev-time Node harnesses.
 */

/* timeToCoordinate returns null outside the visible range; a partially visible
 * shape still needs its off-screen edge, so clamp it to the pane side the time
 * falls beyond. */
export function xCoordinate(time, timeScale, visible, width) {
  const coordinate = timeScale.timeToCoordinate(time);
  if (coordinate !== null) return coordinate;
  if (time <= visible.from) return 0;
  if (time >= visible.to) return width;
  return null;
}

/* logicalToCoordinate returns null outside the visible range; clamp to the pane
 * edge the logical index falls beyond, matching xCoordinate's contract. */
export function xCoordinateLogical(logical, timeScale, visibleLogical, width) {
  const coordinate = timeScale.logicalToCoordinate(logical);
  if (coordinate !== null) return coordinate;
  if (!visibleLogical) return null;
  if (logical <= visibleLogical.from) return 0;
  if (logical >= visibleLogical.to) return width;
  return null;
}
