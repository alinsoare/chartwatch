## 1. Backend: sync API and runner

- [x] 1.1 Remove the `periodic: bool = False` field from the sync request model in `src/chartwatch/api.py` and stop passing it through to the runner; verify `uv run pytest tests/test_api.py` passes with no reference to `periodic` remaining in the file
- [x] 1.2 Remove the `periodic` parameter from `SyncRunner` throughout `src/chartwatch/sync.py`, along with the `_cannot_have_a_new_bar` skipping logic and the `skipped_timeframes` field on progress; update the module docstring to drop periodic-refresh mentions; verify `rg -n "periodic|skipped_timeframes|_cannot_have_a_new_bar" src/chartwatch/` returns no matches

## 2. Backend: tests

- [x] 2.1 Remove `test_periodic_flag_reaches_the_runner` from `tests/test_api.py`; verify `uv run pytest tests/test_api.py` passes
- [x] 2.2 Remove the entire `TestPeriodicSkipping` class and any other periodic-related assertions from `tests/test_sync.py`; verify `uv run pytest tests/test_sync.py` passes
- [x] 2.3 Run the full backend suite and confirm no leftover references: `uv run pytest` passes and `rg -n "periodic" tests/` returns no matches

## 3. Frontend: UI markup and styling

- [x] 3.1 Remove the `#periodic-refresh-control` label and `#periodic-refresh` checkbox ("auto 15m") from `web/index.html`; verify the sync controls render with only sync-all, sync-selected, and full-refresh by loading the dev UI
- [x] 3.2 Remove the `#periodic-refresh-control.on` styling rule(s) from `web/styles.css`; verify `rg -n "periodic" web/styles.css` returns no matches

## 4. Frontend: JS logic

- [x] 4.1 Remove `PERIODIC_REFRESH_MS`, `periodicTimer`, the `periodicRefresh`/`periodicRefreshControl` element references, and `setPeriodicRefresh()` from `web/app.js`
- [x] 4.2 Remove the `periodic` option from `startSync(..., { periodic })` calls and its handling inside the sync-start path in `web/app.js`
- [x] 4.3 Remove periodic-refresh event listeners (checkbox change handler) and the `beforeunload` cleanup logic tied to `periodicTimer` from `web/app.js`
- [x] 4.4 Remove remaining comments referencing periodic refresh in `web/app.js`; verify `rg -n "periodic|PERIODIC_REFRESH|auto 15m" web/` returns no matches and manual sync (sync-all, sync-selected, full refresh) still works when exercised in the dev UI

## 5. Documentation

- [x] 5.1 Remove "a periodic refresh you switch on for the current session" from the offline-first intro paragraph in `README.md` (around line 9)
- [x] 5.2 Remove the "auto 15m" mention from the settings-persistence note in `README.md` (around lines 106-107)
- [x] 5.3 Delete the entire "## Periodic refresh (dev mode only)" section from `README.md` (around lines 111-126)
- [x] 5.4 Verify no other mentions of "auto 15m" or "periodic refresh" remain: `rg -n -i "periodic refresh|auto 15m" README.md` returns no matches

## 6. OpenSpec main specs and project context

- [x] 6.1 Apply the `sync` capability delta to `openspec/specs/sync/spec.md`: update "Sync runs only on explicit user action" and remove the "Optional periodic refresh" and "A periodic refresh skips timeframes that cannot have a new bar" requirements
- [x] 6.2 Apply the `charting` capability delta to `openspec/specs/charting/spec.md`: update "User settings persist across reloads" to drop periodic-refresh references, and replace "Sync controls in the UI" with "Manual sync controls in the UI"
- [x] 6.3 Apply the `release-publishing` capability delta to `openspec/specs/release-publishing/spec.md`: simplify "The published site is a passive snapshot" to drop the periodic-refresh-control callout
- [x] 6.4 Update `openspec/config.yaml`'s project `context:` block (around lines 24-25) so it no longer describes a user-switchable periodic refresh as part of the offline-first constraint; verify `rg -n -i "periodic"` across `openspec/specs/` and `openspec/config.yaml` returns no matches outside this change's own `openspec/changes/remove-periodic-refresh/` directory

## 7. Final verification

- [x] 7.1 Run the full verification sweep: `uv run pytest`, `node tests/js/run_fixtures.mjs`, `node tests/js/run_space_fixtures.mjs`, `node tests/js/run_macd_fixtures.mjs`, `node tests/js/run_series_math.mjs`, `node tests/js/run_measure.mjs`, `node tests/js/run_settings.mjs`, `node tests/js/run_scroll_lock.mjs`, `node tests/js/run_viewport.mjs`, `node tests/js/run_auto_scale.mjs`, `node tests/js/run_screener.mjs` all pass
- [x] 7.2 Run `rg -n -i "periodic" --glob '!openspec/changes/remove-periodic-refresh/**'` across the repository and confirm zero remaining matches
- [x] 7.3 Manually exercise the dev UI (`uv run chartwatch serve`) to confirm sync-all, sync-selected, and full-refresh still work end-to-end with no periodic-refresh control present
