const DB_NAME = "chartwatch-reports";
const DB_VERSION = 1;
const STORE = "reports";

let memoryFallback = null;
let storageDenied = false;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

const CACHE_KEY = "report-v1";

export function isStorageDenied() {
  return storageDenied;
}

export function serializeReport(parsed, categoryFilter) {
  return {
    version: 1,
    metadata: {
      ...parsed.metadata,
      periodStart: parsed.metadata.periodStart?.toISOString?.() ?? null,
      periodEnd: parsed.metadata.periodEnd?.toISOString?.() ?? null,
      asOf: parsed.metadata.asOf?.toISOString?.() ?? null,
    },
    closedTrades: parsed.closedTrades.map((t) => ({
      ...t,
      openAt: t.openAt?.toISOString?.() ?? null,
      closeAt: t.closeAt?.toISOString?.() ?? null,
    })),
    openLegs: parsed.openLegs.map((l) => ({
      ...l,
      openAt: l.openAt?.toISOString?.() ?? null,
    })),
    cashFlows: parsed.cashFlows.map((c) => ({
      ...c,
      time: c.time?.toISOString?.() ?? null,
    })),
    taxEntries: parsed.taxEntries,
    categoryFilter,
  };
}

function normalizeEquityMetadata(metadata) {
  const md = { ...metadata };
  if (
    md.openPositionValue != null &&
    md.freeCash != null &&
    (md.equity == null || md.equityUndeterminable)
  ) {
    md.equity = md.freeCash + md.openPositionValue;
    md.equityUndeterminable = null;
  }
  return md;
}

export function deserializeReport(stored) {
  if (!stored || stored.version !== 1) return null;
  const iso = (s) => (s ? new Date(s) : null);
  return {
    ok: true,
    metadata: normalizeEquityMetadata({
      ...stored.metadata,
      periodStart: iso(stored.metadata.periodStart),
      periodEnd: iso(stored.metadata.periodEnd),
      asOf: iso(stored.metadata.asOf),
    }),
    closedTrades: stored.closedTrades.map((t) => ({
      ...t,
      openAt: iso(t.openAt),
      closeAt: iso(t.closeAt),
    })),
    openLegs: stored.openLegs.map((l) => ({
      ...l,
      openAt: iso(l.openAt),
    })),
    cashFlows: stored.cashFlows.map((c) => ({
      ...c,
      time: iso(c.time),
    })),
    taxEntries: stored.taxEntries,
  };
}

export async function loadCache() {
  try {
    const raw = await idbGet(CACHE_KEY);
    if (!raw || raw.version !== 1) return null;
    return raw;
  } catch {
    storageDenied = true;
    return memoryFallback;
  }
}

export async function saveCache(payload) {
  const record = { version: 1, ...payload };
  try {
    await idbSet(CACHE_KEY, record);
    memoryFallback = record;
    return { ok: true, persisted: true };
  } catch {
    storageDenied = true;
    memoryFallback = record;
    return { ok: true, persisted: false };
  }
}

export async function saveReport(parsed, categoryFilter, screenerBundle) {
  const report = serializeReport(parsed, categoryFilter);
  const existing = (await loadCache()) ?? {};
  return saveCache({
    report,
    screener: screenerBundle ?? existing.screener ?? null,
  });
}

export async function saveScreenerBundle(bundle) {
  const existing = (await loadCache()) ?? {};
  return saveCache({
    report: existing.report ?? null,
    screener: bundle,
  });
}
