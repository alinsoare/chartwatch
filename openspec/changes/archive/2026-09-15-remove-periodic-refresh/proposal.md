## Why

The "Periodic refresh (dev mode only)" feature — the **auto 15m** checkbox that runs an incremental sync every 15 minutes while switched on — adds meaningful surface area (a dev-only UI control, a `periodic` flag threading through the sync API and `SyncRunner`, freshness-skipping logic, and dedicated tests) for a capability the project no longer wants. It never existed on the published static site, and CI's twice-daily scheduled sync already keeps the published snapshot fresh without any client-side timer. Removing it simplifies the sync surface to the controls that matter (sync-all, sync-selected, full refresh) and eliminates a whole class of behavior (session-only auto-off, drop-while-running, per-timeframe freshness skipping) that has to be documented, tested, and kept correct for no remaining benefit.

## What Changes

- **BREAKING**: Remove the periodic-refresh UI control (`#periodic-refresh-control` / `#periodic-refresh`, "auto 15m") from the dev UI, including its styling and all JS wiring (`PERIODIC_REFRESH_MS`, `periodicTimer`, `setPeriodicRefresh()`, the `beforeunload` cleanup, and related event listeners).
- **BREAKING**: Remove the `periodic` flag from the sync API request model and from `SyncRunner`, along with the "cannot yet have a new bar" timeframe-skipping logic and the `skipped_timeframes` progress field it produced.
- Remove all periodic-refresh-specific tests (`test_periodic_flag_reaches_the_runner` in `tests/test_api.py`, the entire `TestPeriodicSkipping` class in `tests/test_sync.py`, and any related assertions elsewhere).
- Remove the "Periodic refresh (dev mode only)" section and all other mentions of periodic refresh / "auto 15m" from `README.md`.
- Update the `sync` capability spec to remove the "Optional periodic refresh" and "A periodic refresh skips timeframes that cannot have a new bar" requirements, and to state that a sync control press is the only user-initiated trigger in the app.
- Update the `charting` capability spec to remove periodic-refresh from the settings-persistence requirement and from the sync-controls requirement (sync controls become sync-all, sync-selected, full refresh — no periodic-refresh control).
- Update the `release-publishing` capability spec to simplify its references to a periodic-refresh control, since the control no longer exists to exclude from the published site.
- No change to: manual sync controls (sync-all, sync-selected, full refresh), the CI twice-daily scheduled sync, offline-first chart viewing, or full-refresh checkbox behavior.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `sync`: Remove the "Optional periodic refresh" and "A periodic refresh skips timeframes that cannot have a new bar" requirements; update "Sync runs only on explicit user action" so a periodic refresh is no longer listed as a trigger.
- `charting`: Replace "Sync controls in the UI" with "Manual sync controls in the UI" (drops the periodic-refresh-control scenario, keeps sync-all/sync-selected/full-refresh); remove periodic-refresh from the "User settings persist across reloads" requirement's text.
- `release-publishing`: Simplify "The published site is a passive snapshot" so it no longer calls out excluding a periodic-refresh control that no longer exists in the app.

## Impact

- **UI (`web/`)**: `index.html` (remove the control markup), `app.js` (remove `PERIODIC_REFRESH_MS`, `periodicTimer`, `periodicRefresh`/`periodicRefreshControl` element refs, `setPeriodicRefresh()`, the `periodic` option on `startSync()`, related event listeners and `beforeunload` cleanup, and related comments), `styles.css` (remove `#periodic-refresh-control.on` styling).
- **Backend (`src/chartwatch/`)**: `api.py` (remove `periodic` field from the sync request model and its pass-through to the runner), `sync.py` (remove the `periodic` parameter from `SyncRunner`, the `_cannot_have_a_new_bar` skipping logic, the `skipped_timeframes` progress field, and related module-docstring mentions).
- **Tests**: `tests/test_api.py` (remove `test_periodic_flag_reaches_the_runner`), `tests/test_sync.py` (remove the `TestPeriodicSkipping` class and any other periodic-related assertions).
- **Docs**: `README.md` (remove the "Periodic refresh (dev mode only)" section and all "auto 15m" / periodic-refresh mentions, including the offline-first intro paragraph and the settings-persistence note).
- **OpenSpec**: `openspec/specs/sync/spec.md`, `openspec/specs/charting/spec.md`, `openspec/specs/release-publishing/spec.md` all lose periodic-refresh requirements/references; `openspec/config.yaml`'s project context (which currently describes periodic refresh as part of the offline-first constraint) should be updated during implementation to reflect that a sync control press is the only in-app trigger.
- No API version bump is planned; this is treated as removing an already-optional, dev-only, off-by-default feature rather than a versioned contract change.
