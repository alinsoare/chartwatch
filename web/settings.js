/* Persisted user settings, and the display-limit rule they share with the toolbar.
 *
 * Everything lives in one versioned JSON object under one localStorage key: a
 * single key cannot leave the app half-restored, and the version lets a future
 * shape change discard old data rather than misinterpret it.
 *
 * Two rules this module exists to keep honest:
 * - The storage object is a parameter, never `window.localStorage` reached for
 *   directly, so the whole module is testable outside a browser.
 * - Every read and write is wrapped. A browser that denies storage *throws* on
 *   access rather than returning null, and a settings feature must never be able
 *   to stop the chart from loading.
 */

export const SETTINGS_KEY = "chartwatch.settings";
// Still 1: new filter keys are additive; restoreSettings already defaults absent keys.
export const SETTINGS_VERSION = 1;

/** Display limit meaning "every stored bar". A word, not 0 or an empty field,
 *  both of which the spec requires to be refused. */
export const SHOW_ALL = "all";
export const DEFAULT_DISPLAY_LIMIT = 5000;

export const DEFAULT_SORT_ORDER = "default";
export const VALID_SORT_ORDERS = new Set(["default", "score", "symbol", "name", "headroom"]);

export const DEFAULT_SETTINGS = Object.freeze({
  displayLimit: DEFAULT_DISPLAY_LIMIT,
  autoScale: true,
  symbol: null,
  timeframe: null,
  indicators: [],
  search: "",
  assetClass: "",
  quoteCurrency: "",
  exchange: "",
  compatibleOnly: false,
  enabledOnly: false,
  sortOrder: DEFAULT_SORT_ORDER,
});

/* ---------- Display limit ---------- */

/** Parse a display limit. Returns a positive integer, `SHOW_ALL`, or null when
 *  the value is refused (zero, negative, fractional, or not a number). */
export function parseDisplayLimit(raw) {
  if (raw === SHOW_ALL) return SHOW_ALL;
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw !== "string") return null;

  const text = raw.trim().toLowerCase();
  if (text === SHOW_ALL) return SHOW_ALL;
  // A digits-only test, not Number(): it rejects "", " ", "-5", "1.5" and "12abc",
  // all of which Number() either accepts or turns into a misleading NaN.
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value > 0 ? value : null;
}

export function limitToText(limit) {
  return limit === SHOW_ALL ? SHOW_ALL : String(limit);
}

/** The most recent `limit` bars of a series, or all of them. */
export function applyDisplayLimit(bars, limit) {
  if (!Array.isArray(bars)) return [];
  if (limit === SHOW_ALL || bars.length <= limit) return bars;
  return bars.slice(bars.length - limit);
}

/* ---------- Storage ---------- */

/** The browser's localStorage, or null where it is denied or absent. */
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Whatever was stored, as a plain object. Defaults on anything unreadable:
 *  storage denied, absent, corrupt JSON, or written by an older version. */
export function readSettings(storage) {
  let raw = null;
  try {
    raw = storage?.getItem(SETTINGS_KEY) ?? null;
  } catch {
    return {};
  }
  if (!raw) return {};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};
  if (parsed.version !== SETTINGS_VERSION) return {};
  const settings = parsed.settings;
  return settings && typeof settings === "object" ? settings : {};
}

/** Persist settings. Silently does nothing where storage is unavailable —
 *  losing a preference is not worth an error state. */
export function writeSettings(storage, settings) {
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, settings }));
    return true;
  } catch {
    return false;
  }
}

/** Validate stored settings against live data, field by field.
 *
 * `live` carries what the app has actually loaded: `symbols` from the catalog,
 * `timeframes` from the contract, `indicatorIds` from the registry. A field that
 * no longer resolves falls back to its default without abandoning the rest, so a
 * renamed instrument costs the user their selection and nothing else.
 */
function restoreListFilter(raw, list, defaultValue) {
  if (typeof raw !== "string") return defaultValue;
  if (!raw) return defaultValue;
  return list.includes(raw) ? raw : defaultValue;
}

export function restoreSettings(stored, live = {}) {
  const source = stored && typeof stored === "object" ? stored : {};
  const symbols = live.symbols || [];
  const timeframes = live.timeframes || [];
  const indicatorIds = live.indicatorIds || [];
  const assetClasses = live.assetClasses || [];
  const currencies = live.currencies || [];
  const exchanges = live.exchanges || [];

  return {
    displayLimit: parseDisplayLimit(source.displayLimit) ?? DEFAULT_SETTINGS.displayLimit,
    autoScale:
      typeof source.autoScale === "boolean" ? source.autoScale : DEFAULT_SETTINGS.autoScale,
    symbol: symbols.includes(source.symbol) ? source.symbol : DEFAULT_SETTINGS.symbol,
    timeframe: timeframes.includes(source.timeframe)
      ? source.timeframe
      : DEFAULT_SETTINGS.timeframe,
    indicators: Array.isArray(source.indicators)
      ? source.indicators.filter((id) => indicatorIds.includes(id))
      : [...DEFAULT_SETTINGS.indicators],
    search: typeof source.search === "string" ? source.search : DEFAULT_SETTINGS.search,
    assetClass: restoreListFilter(
      source.assetClass,
      assetClasses,
      DEFAULT_SETTINGS.assetClass,
    ),
    quoteCurrency: restoreListFilter(
      source.quoteCurrency,
      currencies,
      DEFAULT_SETTINGS.quoteCurrency,
    ),
    exchange: restoreListFilter(source.exchange, exchanges, DEFAULT_SETTINGS.exchange),
    compatibleOnly:
      typeof source.compatibleOnly === "boolean"
        ? source.compatibleOnly
        : DEFAULT_SETTINGS.compatibleOnly,
    enabledOnly:
      typeof source.enabledOnly === "boolean"
        ? source.enabledOnly
        : DEFAULT_SETTINGS.enabledOnly,
    sortOrder: VALID_SORT_ORDERS.has(source.sortOrder)
      ? source.sortOrder
      : DEFAULT_SETTINGS.sortOrder,
  };
}
