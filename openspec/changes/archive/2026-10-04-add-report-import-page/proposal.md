## Why

Personal XTB account analysis currently lives in a separate repo (`xtb-reports`): a Python CLI that parses a manually-exported `.xlsx`, ranks every trade category, projects averaging-down ladders, and writes a static `docs/index.html`. It has to be re-run locally every time the report changes, and it has no home next to the instrument data chartwatch already screens. Bringing it into chartwatch as a dedicated page — parsed and cached entirely client-side — lets the two tools share one site and one screener data source, with no server, no re-run step, and no personal data ever touching the repo.

## What Changes

- Add a new, separate page (`web/reports/`) alongside the existing chart page, published as part of the static site but empty by default: nothing to import, nothing cached, until the user acts. The chart page gains one link to it, and it links back.
- Add a file-picker import flow that unzips and parses an XTB `.xlsx` export entirely in the browser (native `DecompressionStream('deflate-raw')`, no bundler, no third-party parsing library), re-deriving the Closed Positions / Open Positions / Cash Operations handling, metadata extraction, and partial-close-aware dedup the Python tool uses today. All three sheets are required.
- Add client-side ranking (profit velocity + win rate stars, semaphore, capped watch list, no-history list) and the full ladder projection rule set (per-rung blended averages, staged-plan vs current-position bases, per-level net profit, plan state, reached/pending, sell-now, time-escalating net TP floor, trigger re-anchoring, next-rung recommendation, concentration cap, ladder budget, min-net-profit floor) ported from the Python reference's specs, rendered directly to the DOM in tabbed sections.
- Ship every strategy and ranking constant in one settings module, seeded with the user's current strategy values; no settings UI in this version.
- Anchor every time-dependent figure to the report's own as-of date rather than page-view time.
- Add an explicit, user-pressed "check screener" control that fetches chartwatch's own `screener-scores.json` and `catalog.json` (same-origin, relative) to confirm next-rung RECOMMENDED badges — never fetched implicitly on load. Tickers resolve verbatim, then via catalog aliases, then via a same-listing suffix table whose hits must be confirmed by instrument-name match against the catalog.
- Cache the parsed report, filter selection, and last screener/catalog payloads in IndexedDB; rankings and ladders are recomputed on every load. A new import replaces the cached report after confirmation (v1: single account, no multi-file merge).
- **BREAKING** (for the source project, not chartwatch): `xtb-reports` is not migrated with history; this is a fresh implementation. The old repo is left as-is/archived and is not a dependency of this change.

## Capabilities

### New Capabilities
- `report-parser`: client-side `.xlsx` ingestion — unzip/inflate, sheet extraction, metadata (account, period/as-of date, stated totals), Closed/Open/Cash parsing, partial-close-aware dedup, equity derivation.
- `report-ranking`: per-ticker metrics, profit-velocity/win-rate star rating, semaphore, ranking order, capped watch list, no-history list; constants from the settings module.
- `ladder-projection`: the complete averaging-down ladder rule set, time anchoring to the as-of date, and button-triggered screener confirmation with catalog-backed, name-confirmed ticker resolution.
- `report-dashboard`: the page itself — empty initial state, import control, two-way nav link, IndexedDB caching with recompute-on-load and replace semantics, tabbed rendering with sort semantics, basis labels, escalation and ACTIVE/RECOMMENDED markers, category filtering, freshness indicators.

### Modified Capabilities
- None. `release-publishing`'s static export already copies `web/` wholesale (`shutil.copytree(WEB_DIR, out_dir)`), so no requirement there changes to carry the new page along.

## Impact

- New code under `web/reports/` plus four new spec capabilities, and one nav link added to `web/index.html`. No changes to `src/chartwatch/`, `tools/`, the sync pipeline, or the release workflow.
- No new runtime or dev dependencies (no bundler, no Node packages, no CDN parsing library).
- No personal account data enters the repo: the imported file and all derived state live only in the visiting browser's IndexedDB. The shipped settings module does carry the user's strategy parameters, which are not account data.
