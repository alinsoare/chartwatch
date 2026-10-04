import { createEnsureScreenerChecked } from "../../web/reports/screenerCheck.js";

let failures = 0;

function fail(msg) {
  failures += 1;
  console.error(`FAIL ${msg}`);
}

async function testDedupeSingleFetch() {
  let fetchCount = 0;
  const ensure = createEnsureScreenerChecked({
    fetchScreenerData: async () => {
      fetchCount += 1;
      await new Promise((r) => setTimeout(r, 15));
      return {
        screener: { symbols: {} },
        catalog: { symbols: [] },
        fetchedAt: "2026-01-01T12:00:00.000Z",
      };
    },
    saveScreenerBundle: async () => {},
    onSuccess: () => {},
    onFailure: () => {},
  });

  const [a, b] = await Promise.all([ensure(), ensure()]);
  if (fetchCount !== 1) {
    fail(`dedupe expected 1 fetch, got ${fetchCount}`);
  }
  if (!a?.fetchedAt || a !== b) {
    fail("dedupe callers should share the same resolved bundle");
  }
}

async function testFailureKeepsPriorBundle() {
  let saved = null;
  let failureMsg = null;
  const prior = {
    screener: { symbols: { X: { score: 1 } } },
    catalog: { symbols: [] },
    fetchedAt: "2025-06-01T00:00:00.000Z",
  };
  let sessionBundle = { ...prior };

  const ensure = createEnsureScreenerChecked({
    fetchScreenerData: async () => {
      throw new Error("network down");
    },
    saveScreenerBundle: async (bundle) => {
      saved = bundle;
      sessionBundle = bundle;
    },
    onSuccess: (bundle) => {
      sessionBundle = bundle;
    },
    onFailure: (err) => {
      failureMsg = err.message;
    },
  });

  try {
    await ensure();
  } catch {
    /* expected */
  }

  if (failureMsg !== "network down") {
    fail(`onFailure not called: ${failureMsg}`);
  }
  if (saved !== null) {
    fail("saveScreenerBundle should not run on fetch failure");
  }
  if (sessionBundle.fetchedAt !== prior.fetchedAt) {
    fail("cached screener bundle should remain unchanged after failure");
  }
}

async function testRetryJoinsInFlight() {
  let fetchCount = 0;
  const ensure = createEnsureScreenerChecked({
    fetchScreenerData: async () => {
      fetchCount += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        screener: {},
        catalog: {},
        fetchedAt: "2026-02-01T00:00:00.000Z",
      };
    },
    saveScreenerBundle: async () => {},
    onSuccess: () => {},
    onFailure: () => {},
  });

  const first = ensure();
  const retry = ensure({ force: true });
  await Promise.all([first, retry]);
  if (fetchCount !== 1) {
    fail(`retry while in flight expected 1 fetch, got ${fetchCount}`);
  }
}

await testDedupeSingleFetch();
await testFailureKeepsPriorBundle();
await testRetryJoinsInFlight();

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all reports screener-check checks pass");
