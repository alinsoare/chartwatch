## Why

The reports page works but looks plain next to the original `xtb-reports` dashboard: P/L figures are uncoloured and unsigned, stars and signals are bare text, tables are dense and left-aligned, ladder compliance is a comma-joined string, and take-profit lines are plain bullets. Report text (instrument names, categories) is also interpolated into HTML without escaping. The reference dashboard has several presentation patterns worth borrowing, and the chartwatch page should improve on them rather than copy them.

## What Changes

- **MODIFIED** `report-dashboard` presentation of the header area: summary shown as a compact stat strip with signed, sign-coloured P/L (taxes always shown as a cost), freshness indicators as chips, reconciliation and subset notes as banners, and a category filter bar with a "Show all" shortcut when any category is hidden.
- **MODIFIED** `report-dashboard` tabs: underline-style tab bar with accessible tab/tabpanel semantics and a count pill per tab. Tab order and the default selected tab stay as the page behaves today (Open ladders first and selected); the spec text is aligned to that.
- **ADDED** table presentation rules for all four tabs: numeric columns right-aligned with tabular figures, sticky header with visible sort indicator, hover highlight, signed and coloured P/L, stars shown as filled/empty glyphs, signal as a coloured badge, uncalibrated cells shown as "n/a" with an explanatory tooltip, and styled empty states and section notes.
- **ADDED** ladder presentation rules: compliance flags as one chip per flag (or a "Compliant" chip when none), take-profit lines as cards with a state-coloured edge, an ACTIVE badge and a tiered RECOMMENDED badge, and recommendation/screener notes as a distinct callout.
- **ADDED** safe rendering: all report-derived text (names, tickers, categories, flags) is HTML-escaped before display.
- **No change** to parsing, ranking, ladder projection, screener resolution, summary computation, settings, caching, or the set of columns per tab. Every displayed number keeps its computed value; only its formatting and styling change.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `report-dashboard`: presentation requirements for summary, filter bar, tabs, tables, and ladder take-profit lines; safe rendering of report text.

## Impact

- `web/reports/reports.css` (restyle), `web/reports/render.js` (markup and formatting helpers; `sortRows` and `visibleTpLevels` exports unchanged), and possibly `web/reports/index.html` (minor structure).
- `web/styles.css` (shared with the chart page) is not touched.
- No backend, data, parser, ranking, ladder, or screener changes; existing `tests/js/run_reports_*.mjs` continue to apply.
