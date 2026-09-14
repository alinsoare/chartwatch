/* Scan cache invalidation unit tests. Dev-time only; run: node tests/js/run_scan_cache.mjs */

import {
  buildCacheKey,
  runScan,
  SCAN_CACHE_KEY,
  SCAN_CACHE_VERSION,
} from "../../web/screener/scan.js";

let failures = 0;

function check(name, actual, expected) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    console.error(`FAIL ${name}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}

function checkTrue(name, condition) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

function bar(time, open, high, low, close) {
  return { time, open, high, low, close };
}

function makeBars(count, start = 1_700_000_000, step = 86400, base = 100) {
  return Array.from({ length: count }, (_, i) =>
    bar(start + i * step, base + i, base + i + 2, base + i - 1, base + i + 1),
  );
}

function tuneWindowTail(d1Bars, { high, low, close }) {
  for (let i = d1Bars.length - 31; i < d1Bars.length - 1; i++) {
    d1Bars[i] = bar(d1Bars[i].time, low, high, low, close);
  }
  d1Bars[d1Bars.length - 1] = bar(
    d1Bars[d1Bars.length - 1].time,
    close,
    high,
    low,
    close,
  );
  return d1Bars;
}

const catalog = {
  symbols: [
    {
      ticker: "CACHE.US",
      enabled: true,
      point_size: 0.01,
      last_sync_utc: "2026-01-01T00:00:00Z",
    },
  ],
};

const cacheKey = buildCacheKey(catalog.symbols);
const store = {};
const storage = {
  getItem(key) {
    return store[key] ?? null;
  },
  setItem(key, value) {
    store[key] = value;
  },
};

store[SCAN_CACHE_KEY] = JSON.stringify({
  version: 7,
  key: cacheKey,
  scores: {
    "CACHE.US": {
      status: "screened",
      score: 1,
      marks: 1,
      reasons: [{ rule: "Eligibility gate", points: 1, source: "gate" }],
      rangePct: 0.1,
      positionPct: 0.2,
    },
  },
});

let getJsonCalls = 0;
const gateOpenD1 = tuneWindowTail(makeBars(400, 1_700_000_000, 86400, 100), {
  high: 110,
  low: 100,
  close: 102,
});

const getJSON = async (path) => {
  getJsonCalls += 1;
  check("getJSON path", path, "data/scan-bars.json");
  return {
    symbols: {
      "CACHE.US": {
        d1: gateOpenD1,
        h1: makeBars(400, 1_700_000_000, 3600, 100),
      },
    },
  };
};

const scores = await runScan({ catalog, storage, getJSON });

check("stale cache triggers recompute", getJsonCalls, 1);
checkTrue("recomputed result is returned", scores["CACHE.US"] != null);
check(
  "recomputed quiet instrument scores 0 under new model",
  scores["CACHE.US"].score,
  0,
);
checkTrue(
  "recomputed result does not carry old gate source",
  !scores["CACHE.US"].reasons.some((r) => r.source === "gate"),
);
checkTrue(
  "fresh cache is written at current version",
  (() => {
    const parsed = JSON.parse(store[SCAN_CACHE_KEY]);
    return parsed.version === SCAN_CACHE_VERSION;
  })(),
);
check("cache version is bumped", SCAN_CACHE_VERSION, 9);

store[SCAN_CACHE_KEY] = JSON.stringify({
  version: 8,
  key: cacheKey,
  scores: {
    "CACHE.US": {
      status: "screened",
      score: 2,
      marks: 2,
      reasons: [{ rule: "Old model", points: 2, source: "legacy" }],
      rangePct: 0.1,
      positionPct: 0.2,
      headroomPct: 0.3,
    },
  },
});

let v8GetJsonCalls = 0;
const v8GetJSON = async (path) => {
  v8GetJsonCalls += 1;
  return {
    symbols: {
      "CACHE.US": {
        d1: gateOpenD1,
        h1: makeBars(400, 1_700_000_000, 3600, 100),
      },
    },
  };
};

const v8Storage = {
  getItem(key) {
    return store[key] ?? null;
  },
  setItem(key, value) {
    store[key] = value;
  },
};

await runScan({ catalog, storage: v8Storage, getJSON: v8GetJSON });
check("version 8 cache triggers recompute", v8GetJsonCalls, 1);
checkTrue(
  "version 8 cache is rewritten at current version",
  JSON.parse(store[SCAN_CACHE_KEY]).version === SCAN_CACHE_VERSION,
);

const warmStore = { [SCAN_CACHE_KEY]: store[SCAN_CACHE_KEY] };
const warmStorage = {
  getItem(key) {
    return warmStore[key] ?? null;
  },
  setItem(key, value) {
    warmStore[key] = value;
  },
};

let warmGetJsonCalls = 0;
const warmGetJSON = async () => {
  warmGetJsonCalls += 1;
  return { symbols: {} };
};

await runScan({ catalog, storage: warmStorage, getJSON: warmGetJSON });
check("warm cache does not call getJSON again", warmGetJsonCalls, 0);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all scan cache checks pass");
