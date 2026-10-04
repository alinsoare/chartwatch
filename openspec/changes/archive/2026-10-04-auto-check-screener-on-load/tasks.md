## 1. Remove the manual control

- [x] 1.1 Remove the `#screener-btn` button markup from `web/reports/index.html` and verify no `screener-btn` id remains anywhere under `web/reports/`
- [x] 1.2 Remove the `screenerBtn` element reference, its `click` listener, and the `screenerBtn.disabled` toggles from `web/reports/app.js` and verify no `screenerBtn` reference remains in the file
- [x] 1.3 Remove any `#screener-btn`-specific styling from `web/reports/reports.css`, if present, and verify the page still renders without layout errors (manual check or existing render test)

## 2. Automatic screener-check orchestration

- [x] 2.1 Add an `ensureScreenerChecked()` orchestrator in `web/reports/app.js` (or a small new module) that calls `fetchScreenerData()`, persists the result via `saveScreenerBundle()`, and rebuilds the dashboard — reusing an in-flight promise instead of starting a second fetch when called again before the first resolves
- [x] 2.2 Call `ensureScreenerChecked()` from `boot()` unconditionally, on every page load, before the cached-report early-return — and verify via a manual load with a cached report that a screener/catalog fetch fires, and via a load with no cached report (empty state) that a fetch fires too and its result is cached (via `saveScreenerBundle()`) ready for the next import
- [x] 2.3 Call `ensureScreenerChecked()` from `handleImport()` after every successful import, and verify a fresh import triggers a screener/catalog fetch with no button press — including when it follows shortly after a boot-time load (if the boot fetch already resolved, import starts its own new fetch; if the boot fetch is still in flight, import joins it per the in-flight guard)
- [x] 2.4 Verify the overlapping-trigger case — an import landing while a boot-time check is in flight — results in exactly one network request for `screener-scores.json`/`catalog.json` (e.g. a scripted test or manual network-panel check)

## 3. Failure handling and retry

- [x] 3.1 On a failed automatic check, surface a dismissible notice via the existing `ui.showError`/notice pattern in `web/reports/render.js`, naming the failure, and verify the previously cached screener confirmation (if any) remains displayed unchanged
- [x] 3.2 Add a retry action to the failure notice that calls `ensureScreenerChecked({ force: true })`, and verify pressing retry while another check is in flight does not start a second concurrent fetch
- [x] 3.3 Verify dismissing the failure notice does not clear or alter the cached screener/catalog data

## 4. Tests

- [x] 4.1 Review `tests/js/run_reports_ladder.mjs` and `tests/js/run_reports_settings.mjs` for any assertions tied to the removed button or its handler, and update/remove them so the suites pass against the new code (`node tests/js/run_reports_ladder.mjs`, `node tests/js/run_reports_settings.mjs`)
- [x] 4.2 Add test coverage (new or extended `tests/js/` script) for `ensureScreenerChecked()`'s dedupe behavior — two near-simultaneous calls result in exactly one underlying fetch — and for the failure path leaving cached data intact
- [x] 4.3 Run the full reports test suite (`run_reports_ladder.mjs`, `run_reports_settings.mjs`, `run_reports_xlsx.mjs`) and confirm all pass

## 5. Documentation

- [x] 5.1 Update `README.md`'s "Data on disk" bullet under "XTB report analysis" to describe the automatic on-load/on-import screener check, removing the "fetched only when you press **Check screener**" wording
- [x] 5.2 Search `README.md`, `web/index.html`, and `openspec/` (outside this change and its specs) for any other "Check screener" / check-screener-button wording and update or remove it
- [x] 5.3 Update `openspec/config.yaml`'s project context to state that the reports page's screener check is always fetched on every page load and after every import, unconditionally (including when no report is cached or imported yet) — a scoped, named exception to the offline-first "no fetch on load/view" rule, limited to this one control; the chart page's market-data sync is unaffected and remains button-only

## 6. Validation

- [x] 6.1 Run `openspec validate auto-check-screener-on-load --strict` and resolve any reported issues
- [ ] 6.2 Manually walk through: fresh empty page (screener/catalog fetch fires and caches even with nothing to show yet), import a report (auto-check fires, ladders show confirmation), reload the page (cached confirmation shows immediately, background re-check fires), simulate a fetch failure (notice + retry works, cached data stays)
