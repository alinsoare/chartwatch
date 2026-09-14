/* Price formatting shared by the crosshair legend and the chart tools, so a
 * measurement never disagrees with the readout above it.
 *
 * Precision comes from the instrument's point size, which the catalog already
 * carries (0.01 -> 2 decimals). DOM-free, so Node harnesses can import it.
 */

const DEFAULT_POINT_SIZE = 0.01;
const MAX_DECIMALS = 8;

export function priceDecimals(pointSize) {
  const size = Number.isFinite(pointSize) && pointSize > 0 ? pointSize : DEFAULT_POINT_SIZE;
  return Math.min(MAX_DECIMALS, Math.max(0, Math.round(-Math.log10(size))));
}

export function formatPrice(value, instrument) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(priceDecimals(instrument?.point_size));
}

/* Explicit "+" on a gain; a loss already carries its minus sign. */
export function formatSignedPrice(value, instrument) {
  const text = formatPrice(value, instrument);
  return Number.isFinite(value) && value > 0 ? `+${text}` : text;
}
