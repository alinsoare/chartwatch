## Context

Periodic refresh is a leaf feature layered on top of the existing sync path, not something other capabilities depend on: the UI checkbox calls the same `startSync()` path a manual sync button does, just with an extra `periodic` flag; the backend's `periodic` flag only gates a freshness-skip check inside `SyncRunner` before it does the same per-symbol/per-timeframe work as any other run. See `proposal.md` - Why for the motivation, and the `sync` / `charting` / `release-publishing` deltas under `specs/` for the exact requirement changes.

## Goals / Non-Goals

**Goals:**
- Delete the periodic-refresh control, its timer/state machine, and the backend flag/skip-logic it drove, without touching the manual sync path (sync-all, sync-selected, full refresh) or the CI schedule.
- Remove the feature from every layer at once (UI, API, runner, tests, README, specs, config context) so no dangling reference or dead code survives the change.
- Keep the sync API and `SyncRunner` behaving, for every remaining caller, exactly as a *manual* sync behaves today (always fetches every timeframe; no skip check ever ran for a manual sync anyway).

**Non-Goals:**
- No change to the manual sync UX, the full-refresh option, or any indicator/charting behavior unrelated to sync.
- No API version bump or compatibility shim for the removed `periodic` field — this is being treated as removing an optional, off-by-default, dev-only flag, not a breaking contract that external callers depend on.
- No change to CI's twice-daily scheduled sync or its workflow definition.

## Decisions

- **Remove outright rather than deprecate.** The flag is dev-mode-only, off by default, session-only, and never reaches the published site — there is no persisted state or external contract to migrate away from gracefully. A hard removal (reject the field, delete the control) is simpler than a deprecation period and matches how `openspec/specs/sync/spec.md`'s own "Depth parameters are refused" precedent treats withdrawn request fields: refuse rather than silently ignore.
  - *Alternative considered*: keep `periodic` as an accepted-but-ignored field on the API for backward compatibility. Rejected — there's no external client depending on it (it's the project's own dev UI), and keeping a no-op field would leave exactly the kind of dead surface this change is trying to eliminate.
- **Delete `_cannot_have_a_new_bar` and `skipped_timeframes` together with `periodic`.** Both only exist to support periodic refresh's freshness-skip behavior; nothing else reads `skipped_timeframes` on progress. Removing them alongside `periodic` avoids leaving an unreachable code path.
- **Update `openspec/config.yaml`'s project context as part of implementation, not as a spec delta.** `config.yaml`'s `context:` block is guidance fed to future AI-driven proposals, not a spec file — the OpenSpec schema doesn't version it. It currently describes periodic refresh as part of the offline-first constraint (lines ~24-25); `tasks.md` includes a task to edit it directly so future changes aren't proposed against a stale description of what "offline-first" permits.
- **Order of removal**: strip UI wiring and backend flag/logic first (they're independent), then tests, then docs/specs/config — deleting code before its tests avoids a window where tests reference removed symbols, and updating docs last avoids describing behavior that's still mid-removal.

## Risks / Trade-offs

- [Risk] Deleting `SyncRunner`'s `periodic` parameter and `_cannot_have_a_new_bar` logic could silently change behavior for a caller nobody noticed still passes `periodic=True` (e.g., a script or another test file not listed in the proposal). → Mitigation: grep the whole repo (not just the files named in the proposal) for `periodic`, `PERIODIC_REFRESH_MS`, `_cannot_have_a_new_bar`, and `skipped_timeframes` before deleting, and run the full test suite (`uv run pytest`, plus the `node tests/js/*.mjs` fixtures) after.
- [Risk] Removing the API field could break a request that still sends `periodic` in its JSON body if the request model rejects unknown fields strictly. → Mitigation: confirm the sync request model's extra-field policy during implementation; since this is the project's own dev UI (no external clients), any such request site is inside this repo and gets updated in the same change.
- [Trade-off] No compatibility shim means anyone with a stale `git stash` or branch that still calls the old `startSync(..., { periodic })` signature will need to rebase past this change rather than degrade gracefully. Acceptable given the flag's dev-only, off-by-default nature.
