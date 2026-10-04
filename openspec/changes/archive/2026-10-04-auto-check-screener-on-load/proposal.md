## Why

The reports page gates screener confirmation behind a manual "Check screener" button: a user who imports a report, or returns to a cached one, sees every next-rung recommendation as unconfirmed until they remember to press it. That is one extra step on a page whose whole point is "import and read your ladders," and it is easy to forget — leaving confirmed recommendations looking identical to unconfirmed ones. Running the screener check automatically whenever the page has a report to show (on cache restore, and right after a fresh import) removes that step and keeps the badges in sync with the data the user is already looking at, with no loss of the existing cache-first behavior (a cached screener payload still renders immediately; the auto-check only refreshes it).

## What Changes

- **BREAKING**: Remove the "Check screener" button (`#screener-btn`) from the reports page and all of its click-handler logic in `app.js`.
- The reports page SHALL trigger a screener-catalog fetch automatically instead of on a button press, on every page load — whether or not a report is cached or restored from IndexedDB — and again right after each report finishes importing. A load with no cached report still fetches and caches the screener/catalog payload, so the data is ready to apply as soon as a report is later imported.
- The automatic check SHALL still render whatever screener data is already cached immediately (no flash of "unknown"), then update in place once the automatic fetch resolves — preserving today's "last-checked data shown immediately, refreshed by the next check" behavior, just without the user having to ask for the refresh.
- A failed automatic fetch SHALL leave the previously cached screener/catalog payloads in place and surface the failure as a dismissible notice (replacing the button's disabled-state failure path), with a manual retry affordance (since there is no longer a button to press again).
- Overlapping triggers (e.g. an import landing while a boot-time check is still in flight) SHALL NOT start a second concurrent fetch; the in-flight check SHALL be awaited/reused instead.
- Update `README.md`'s "Data on disk" bullet (and any other doc text naming the **Check screener** control) to describe the new automatic-check behavior.

## Capabilities

### New Capabilities
_None._

### Modified Capabilities
- `ladder-projection`: Replace "Get screener confirmation only on an explicit user action" with a requirement that the screener-confirmation fetch runs automatically on every page load (whether or not a report is cached) and after every import, instead of behind a user-pressed control — while keeping same-origin relative fetch paths, browser-side caching of the fetched payloads, failure-keeps-last-good-data behavior, and the staleness/resolution requirements unchanged.
- `report-dashboard`: Remove the "check-screener control" from the fixed-header inventory (the header now shows summary, import control, freshness indicators, and category filter only); update the caching requirement's "after a screener check" trigger wording to match the new automatic triggers (load-with-cached-report, post-import) instead of a button press; add the no-duplicate-concurrent-fetch behavior and the failure/retry affordance to the relevant requirements.

## Impact

- **UI (`web/reports/`)**: `index.html` (remove the `#screener-btn` button markup), `app.js` (remove the `screenerBtn` element reference and its click listener; add automatic invocation of the screener fetch from `boot()` after a cached report is restored and from `handleImport()` after a successful import; add in-flight-fetch guarding; add a failure notice with a retry action), `render.js` (replace the button-driven failure path with the new failure notice / retry UI), `reports.css` (drop `#screener-btn`-specific styling if any, add styling for the failure/retry notice if new).
- **Tests (`tests/js/`)**: review `run_reports_ladder.mjs` and `run_reports_settings.mjs` for any assumptions tied to a manual trigger (none of the current screener logic tests appear to call the button handler directly, since `fetchScreenerData`/`attachScreenerToLadders` in `screener.js` are pure functions already exercised independently of the button) — add/adjust coverage for the new auto-trigger-on-load/import behavior and the no-duplicate-fetch guard if that logic moves into a testable module.
- **Docs**: `README.md`'s "Data on disk" bullet under "XTB report analysis" currently states screener data is "fetched only when you press **Check screener** — not on load or import"; this is now the opposite and must be rewritten. `openspec/specs/ladder-projection/spec.md` and `openspec/specs/report-dashboard/spec.md` get delta specs per above.
- **Project convention note**: `openspec/config.yaml`'s project context states a non-negotiable offline-first rule for this app — no network call "triggered merely by loading/viewing" — framed around the chart page's market-data sync. That rule was also applied to this exact screener control by name in `ladder-projection`'s current requirement ("never on page load, on import, or periodically"). This proposal reverses that specific rule for the reports page's screener check: the screener is now always fetched on every page load and on every import, unconditionally, regardless of whether a report is cached. This does not touch chart-page market-data sync, which remains button-only and unaffected. This change updates `openspec/config.yaml`'s context note to state the exception explicitly (see `tasks.md`).
