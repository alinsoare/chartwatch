import { scoreInstrument } from "./score.js";

export const SCAN_CACHE_KEY = "chartwatch.scan-cache";
export const SCAN_CACHE_VERSION = 9;

export function buildCacheKey(symbols) {
  return symbols
    .map((s) => `${s.ticker}:${s.last_sync_utc ?? ""}`)
    .sort()
    .join("|");
}

function readCache(storage, key) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SCAN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== SCAN_CACHE_VERSION) return null;
    if (parsed.key !== key) return null;
    return parsed.scores;
  } catch {
    return null;
  }
}

function writeCache(storage, key, scores) {
  if (!storage) return false;
  try {
    storage.setItem(
      SCAN_CACHE_KEY,
      JSON.stringify({ version: SCAN_CACHE_VERSION, key, scores }),
    );
    return true;
  } catch {
    return false;
  }
}

function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function runScan({ catalog, storage, getJSON, onProgress, onScore }) {
  const symbols = catalog.symbols || [];
  const key = buildCacheKey(symbols);

  const cached = readCache(storage, key);
  if (cached) {
    for (const [symbol, result] of Object.entries(cached)) {
      onScore?.(symbol, result);
    }
    onProgress?.({ done: symbols.length, total: symbols.length, cached: true });
    return cached;
  }

  const scanBars = await getJSON("data/scan-bars.json");
  const bySymbol = Object.fromEntries(symbols.map((s) => [s.ticker, s]));
  const scores = {};
  const total = symbols.length;

  for (let done = 0; done < symbols.length; done++) {
    const entry = symbols[done];
    let result;
    try {
      if (!entry.enabled) {
        result = scoreInstrument({
          enabled: false,
          seriesByTimeframe: {},
          pointSize: entry.point_size,
        });
      } else {
        const series = scanBars.symbols?.[entry.ticker] ?? {};
        result = scoreInstrument({
          enabled: true,
          seriesByTimeframe: series,
          pointSize: bySymbol[entry.ticker]?.point_size ?? 0.01,
        });
      }
    } catch {
      result = {
        status: "insufficient-history",
        score: 0,
        marks: 0,
        reasons: [],
        rangePct: null,
        positionPct: null,
        headroomPct: null,
      };
    }

    scores[entry.ticker] = result;
    onScore?.(entry.ticker, result);
    onProgress?.({ done: done + 1, total, cached: false });
    await yieldToMain();
  }

  writeCache(storage, key, scores);
  return scores;
}
