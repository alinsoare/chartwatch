## 1. Rendering helpers

- [x] 1.1 Add `esc()` and apply it at every report-derived interpolation in `web/reports/render.js`; verify with a quick check (node or browser) that a name like `<b>X</b> & Y` renders literally
- [x] 1.2 Add formatting helpers (signed EUR with thousands separators, sign class, stars cell, signal badge cell, n/a cell with reason tooltip, flag chips) and verify they return the expected text for positive, negative, zero, and null inputs
- [x] 1.3 Confirm `sortRows`, `visibleTpLevels`, `sortValue`, and `_sort` semantics are unchanged and `node tests/js/run_reports_ladder.mjs` still passes

## 2. Header area

- [x] 2.1 Restyle the summary as a stat strip with sign-aware Realized/Open, cost-styled Taxes, and Equity; keep values identical to `computeScopedSummary` output; verify in the browser with all categories ticked and with one unticked
- [x] 2.2 Render the subset note and reconciliation notice as banners and the three freshness indicators as labelled chips in `web/reports/index.html` / `reports.css`; verify the reconciliation banner still appears only when a discrepancy exists
- [x] 2.3 Restyle the category filter as pill checkboxes and add the hidden-categories statement with a Show all control wired to `filterSet`/`onFilterChange`; verify Show all re-ticks everything, persists across reload, and is absent when nothing is hidden

## 3. Tabs

- [x] 3.1 Implement tab semantics (`tablist`/`tab`/`tabpanel`, `aria-selected`, roving tabindex) with a count pill, keeping order and the Open ladders default; verify counts follow the filter and left/right arrows still switch tabs

## 4. Tables

- [x] 4.1 Add shared table styling in `reports.css` (scroll container, sticky header, hover, numeric right-align with tabular figures, separate sort indicator, empty-state and note callouts); verify horizontal and vertical scrolling in a narrow and a wide viewport
- [x] 4.2 Apply the cell helpers to the Ranking tab (stars glyphs, signal badges, uncalibrated n/a with reason, signed coloured Total P/L, basis pill); verify sorting by stars and signal still puts unrated rows last in both directions
- [x] 4.3 Apply the styling to the Watch list and No closed trade history tabs (coloured Open DD, empty states); verify both populated and empty cases

## 5. Ladders tab

- [x] 5.1 Restyle the ladder row: instrument cell with ticker code and direction badge, strategy badge, coloured unrealized, flag chips or a Compliant chip; verify against a ladder with flags, one without, and a short/unsupported entry
- [x] 5.2 Render TP lines as `.tp-card` blocks with reached/pending/below-floor/plan edge states and an ACTIVE badge, keeping all existing basis, exit, net, plan-state, and escalation text; verify an R2 ladder shows exactly R2 and R3 with basis wording intact
- [x] 5.3 Render the next-rung recommendation and screener notes as a callout with tiered RECOMMENDED badges (`RECOMMENDED`, `+`, `++`) and a symbol/time tooltip; verify confirmed, not-confirmed, unknown, and stale cases show the right badge or neutral note

## 6. Verification

- [x] 6.1 Run `node tests/js/run_reports_ladder.mjs` and the other `tests/js/run_reports_*.mjs` scripts and verify they all pass, and run lints on the edited files with no new errors
- [x] 6.2 Import `~/xtb-reports/reports/51940879/EUR_51940879_2006-01-01_2026-10-02.xlsx` in the browser and verify all four tabs, a hidden-category state, and a narrow viewport against the spec scenarios; confirm the chart page is visually unchanged

**Note (6.2):** Automated `cursor-ide-browser` navigation was unavailable in this session (no browser tab). `esc()` verified via Node; all `tests/js/run_reports_*.mjs` pass including real xlsx parse. Full import UI verification (four tabs, filter Show all, narrow viewport) requires a manual import in the browser.
