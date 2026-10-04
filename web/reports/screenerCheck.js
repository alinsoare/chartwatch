/**
 * Orchestrates screener/catalog fetch with at-most-one in-flight request.
 */
export function createEnsureScreenerChecked(deps) {
  let inFlight = null;

  return async function ensureScreenerChecked(_opts = {}) {
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const bundle = await deps.fetchScreenerData();
        await deps.saveScreenerBundle(bundle);
        deps.onSuccess?.(bundle);
        return bundle;
      } catch (err) {
        deps.onFailure?.(err);
        throw err;
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  };
}
