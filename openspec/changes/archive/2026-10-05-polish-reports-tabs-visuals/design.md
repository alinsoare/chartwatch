## Context

The reports page (`web/reports/`) renders by rebuilding the dashboard DOM from state on every change: `render.js` builds tab, filter, summary and table markup (mostly template strings assigned to `innerHTML`), and `reports.css` layers a small set of rules over the shared `web/styles.css` (also used by the chart page). The original `xtb-reports` project produced a static HTML page with a richer visual vocabulary (stat strip, underline tabs, star/semaphore glyphs, TP cards) and toggled pre-rendered rows with inline JS. See `proposal.md` for motivation.

Constraints:
- Computation modules (`rank.js`, `ladder.js`, `summary.js`, `screener.js`, `settings.js`, `parse.js`) must not change.
- `render.js` exports `sortRows` and `visibleTpLevels`, used by `tests/js/run_reports_ladder.mjs`; their behavior must not change.
- The page has no build step and no framework; plain ES modules and CSS only.
- Element ids that `app.js` and `render.js` query (`#report-summary`, `#tab-bar`, `#tab-panels`, `#category-filters`, `#fresh-*`, `#import-error`, `#storage-notice`, `#recon-notice`) must keep working.

## Goals / Non-Goals

**Goals:**
- Make the four tabs and the header area faster to scan: sign-aware numbers, badges for stars/signals/flags, TP cards, consistent table styling.
- Keep visual changes entirely in `reports.css` and the markup produced by `render.js`.
- Remove the unescaped-`innerHTML` hazard while touching those templates.

**Non-Goals:**
- No new columns, no changed sort semantics, no change to which TP levels are shown, no new computed values.
- No theming system, light mode, or print stylesheet.
- No changes to `web/styles.css` or the chart page.
- No attempt to reproduce xtb-reports' pre-rendered/row-toggling architecture.

## Decisions

**1. Style through `reports.css` scoped under `body.reports-page`, reusing existing tokens.**
The shared sheet already defines `--up`, `--down`, `--warn`, `--accent`, `--bg-raised`, `--border`. New classes (`.stat`, `.chip`, `.badge-*`, `.tp-card`, `.pos`/`.neg`) are defined only in `reports.css`. Alternative: add tokens to `styles.css`; rejected because it risks chart-page regressions for no gain. xtb-reports' palette (`#3ddc84`, `#ff6b6b`) is not adopted; chartwatch's teal/red keeps the two pages visually coherent.

**2. Small formatting/cell helpers in `render.js`, with one `esc()` applied at every interpolation.**
Helpers: `esc`, signed-EUR formatter with thousands separators, a sign-class function, `starsCell`, `signalCell`, `naCell(reason)`, `flagChips`. Escaping at the single template boundary is simpler and safer than auditing each field. Alternative: build DOM nodes with `textContent` everywhere; safer by construction but a much larger rewrite of working code. Chosen approach keeps diffs small; the spec's safe-rendering scenario is the guard.

**3. Display formatting changes, values do not.**
Formatters only change presentation (`+1,234.56 EUR`); they receive the same numbers the old formatters did. Sort keys (`sortValue`, `_sort`) are untouched, so sorting behaves identically. Taxes continue to be shown as the same figure the summary computes; it is only styled as a cost (the computed amount is not negated or altered).

**4. Sort indicator in a CSS-styled element, not appended to the label text.**
Header text stays constant; the indicator is a separate span, so columns do not jitter and the label remains the accessible name. Click handling and `onHeaderSort` stay as they are.

**5. Tabs: `role="tablist"` / `role="tab"` / `role="tabpanel"`, `aria-selected`, roving `tabindex`; count in a pill span.**
Left/right arrow handling already exists and is retained. Default tab remains Open ladders (matches current behavior; the delta spec is aligned to it). Alternative: switch to ranking-first per the old spec and xtb-reports; rejected by the user.

**6. Ladders: keep the table, restyle the pair of rows.**
The parent row and its `projections-row` stay a table row pair (keeps column sorting simple). Visual grouping comes from CSS (heavier border above each ladder, shared background), not from converting to a card list. TP lines become `.tp-card` blocks with a left-edge state colour: reached (positive), pending (negative), below-floor (warn, driven by the existing `min-net-profit-floor` flag), plan (neutral). The recommendation/screener text is a separate callout under the cards. Recommendation badge text follows the spec tiers (`RECOMMENDED`, `RECOMMENDED+`, `RECOMMENDED++`) from the existing `recommendedBadge` value; the old "tier N" wording is replaced. Alternative: card list instead of table; rejected because it would abandon sortable columns.

**7. "Show all" reuses the existing filter plumbing.**
The control mutates `filterSet` and calls the same `onFilterChange` that checkboxes use, so persistence and re-render follow the existing path. No new state.

**8. Responsive behavior via CSS only.**
Tables sit in a scroll container (`overflow-x: auto`) with a sticky header; the stat strip wraps. Alternative: collapse columns on narrow widths; rejected as it changes content, not just look.

## Risks / Trade-offs

- [Sticky header needs a scroll container; page-level scroll can defeat it] → Give the table container a viewport-relative max height with vertical scroll, and verify in the browser.
- [Restyling could silently drop information (e.g. a basis phrase on a TP line)] → Keep the existing text builders (`formatTpLine` content) as the source of line text and only wrap parts in spans; verify against the ladders scenarios visually and with `run_reports_ladder.mjs`.
- [Escaping could double-escape values already containing entities] → Report text is plain text from the xlsx parser, not HTML; apply `esc()` exactly once at interpolation and check a name with `&`.
- [Colour-only cues exclude some users] → Signals keep their text label, stars keep a numeric text alternative, flags are text chips.
- [Visual verification needs a sample report in the browser] → Use the sample xlsx under `~/xtb-reports/reports/`; if the file picker cannot be driven by tooling, verify DOM/CSS from a seeded session or manual import.
