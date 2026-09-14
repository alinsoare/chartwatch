/* Visible-window price range for the AUTO vertical-scale toggle.
 *
 * Chart-free and DOM-free so the arithmetic is testable outside a browser.
 * The right price scale's scaleMargins supply the 10% headroom; this module
 * returns only the min/max of the visible bars' lows and highs.
 */

/** Fraction of pane height reserved above the high and below the low. */
export const AUTO_SCALE_MARGIN = 0.1;

/** Minimum half-span for a flat window when price is zero or tiny. */
export const AUTO_SCALE_FLAT_ABSOLUTE_FLOOR = 1e-8;

const FLAT_RATIO = 0.0005;

/** Derive `{ minValue, maxValue }` from visible bars, or `null` when the
 *  clamped window has no usable prices. */
export function visiblePriceRange(bars, logicalRange) {
  if (!Array.isArray(bars) || !bars.length || !logicalRange) return null;

  const start = Math.max(0, Math.floor(logicalRange.from));
  const end = Math.min(bars.length - 1, Math.floor(logicalRange.to));
  if (start > end) return null;

  let minLow = Infinity;
  let maxHigh = -Infinity;

  for (let i = start; i <= end; i += 1) {
    const bar = bars[i];
    const low = bar?.low;
    const high = bar?.high;
    if (!Number.isFinite(low) || !Number.isFinite(high)) continue;
    if (low < minLow) minLow = low;
    if (high > maxHigh) maxHigh = high;
  }

  if (!Number.isFinite(minLow) || !Number.isFinite(maxHigh)) return null;

  if (minLow === maxHigh) {
    const halfSpan = Math.max(Math.abs(minLow) * FLAT_RATIO, AUTO_SCALE_FLAT_ABSOLUTE_FLOOR);
    return { minValue: minLow - halfSpan, maxValue: minLow + halfSpan };
  }

  return { minValue: minLow, maxValue: maxHigh };
}
