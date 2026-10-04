# report-dashboard Specification

## Purpose
A dedicated chartwatch page, separate from the chart page, that starts empty and lets a user import an XTB report, caches the parsed report in the browser, recomputes rankings and ladders on every load, and renders them client-side in tabbed sections with a persistent category filter.

## Requirements

### Requirement: The page is empty until the user imports a report

On first visit, and on any visit where the browser holds no cached report, the page SHALL show no instrument, ranking, or ladder data and SHALL present only the import control. The page SHALL NOT ship with, fetch, or display any pre-loaded or example report data.

#### Scenario: First visit is empty

- **WHEN** a user loads the page for the first time, with nothing in the browser's cache
- **THEN** no trades, rankings, or ladders are shown, and the import control is the primary element on the page

#### Scenario: Cleared browser storage returns to empty

- **WHEN** the user clears site data and reloads the page
- **THEN** the page shows the same empty state as a first visit

### Requirement: The chart page and the reports page link to each other

The chart page SHALL carry one link to the reports page, and the reports page SHALL carry one link back to the chart page.

#### Scenario: Navigating between pages

- **WHEN** a user follows the link from either page
- **THEN** the other page loads, with no other change to the chart page's behavior

### Requirement: A successful import renders the full dashboard

Once a report is imported and parsed (per `report-parser`), the system SHALL compute rankings (`report-ranking`) and ladders (`ladder-projection`) and render: a portfolio summary (realized P/L, open P/L, taxes paid, closed-trade count, open-leg count, and — only when present — the parsed-versus-stated reconciliation discrepancy), a sortable ranking table, an open-ladders section, a watch list, and a no-history section — all client-side, with no page reload.

#### Scenario: Import renders every section

- **WHEN** a valid XTB report is imported
- **THEN** the summary, ranking table, open-ladders section, watch list, and no-history section all populate from that import

#### Scenario: Reconciliation notice only when needed

- **WHEN** the parsed total matches the stated total within one cent
- **THEN** no reconciliation notice is rendered

### Requirement: Present sections as tabs below a fixed header

The summary, import control, freshness indicators, and category filter SHALL stay visible above a tab bar. There SHALL be no check-screener (or other manual screener-trigger) control in the header — screener confirmation runs automatically per `ladder-projection`. Below the header the page SHALL present four tabs in this order — Open ladders & TP projections, Instrument ranking, Watch list, No closed trade history — showing one section at a time without reloading, with Open ladders & TP projections selected on every load (selection not persisted). Each tab label SHALL carry the count of rows visible under the current filter (ladders, not table rows, for the ladders tab) and update when the filter changes; the count SHALL be visually distinct from the label text. The selected tab SHALL be visually distinguished from the others and exposed to assistive technology as selected, and each section SHALL be exposed as the panel belonging to its tab. Tabs SHALL be keyboard operable with left/right arrow keys.

#### Scenario: Tab counts follow the filter

- **WHEN** the user unticks a category
- **THEN** every tab label's count drops by that category's visible rows

#### Scenario: No manual screener control in the header

- **WHEN** the dashboard header renders, with or without a cached report
- **THEN** no button or control for triggering a screener check is present anywhere on the page

#### Scenario: Selected tab is distinguishable and exposed

- **WHEN** the dashboard renders or the user switches tabs
- **THEN** exactly one tab is visually marked as selected and reported as selected to assistive technology, and the visible section is the one belonging to it

#### Scenario: Opens on the ladders tab

- **WHEN** the dashboard renders after a load, regardless of which tab was selected before the reload
- **THEN** Open ladders & TP projections is the selected tab

### Requirement: Cache the imported report in the browser and recompute on return

After a successful import, the system SHALL persist the parsed records and report metadata to the browser's IndexedDB; after each automatic screener check (per `ladder-projection`) it SHALL likewise persist the fetched screener and catalog payloads with the time they were fetched. On every load with a cached report, rankings and ladders SHALL be recomputed from the cached parsed data and the current settings module, so the dashboard restores without re-picking or re-parsing the file. Caching itself SHALL make no network request (the automatic screener check is a separate, already-specified trigger, not a side effect of reading the cache).

A storage failure (denied or unavailable IndexedDB) SHALL degrade to an in-memory-only session — the current import still renders — with a visible notice, rather than blocking the import or crashing the page.

#### Scenario: Reload restores the dashboard

- **WHEN** a user imports a report, then reloads the page
- **THEN** the dashboard renders from the cached parsed data, with no re-import required, and the only network request made is the automatic screener-and-catalog check

#### Scenario: Settings change applies to a cached report

- **WHEN** a value in the settings module changes between two loads of the same cached report
- **THEN** the second load reflects the new value without a re-import

#### Scenario: Storage denied still allows the current session to work

- **WHEN** the browser denies IndexedDB access
- **THEN** the just-imported report still renders for the current page session, and the page states that it could not cache the data for next time

### Requirement: Surface a failed automatic screener check with a retry affordance

When the automatic screener-and-catalog check (per `ladder-projection`) fails, the page SHALL show a dismissible notice naming the failure, alongside whatever previously cached confirmation is still displayed. Because there is no manual check-screener control to press again, the notice SHALL offer a retry action that re-runs the same automatic check on demand, subject to the same no-duplicate-concurrent-fetch rule as the automatic triggers.

#### Scenario: Failure notice offers retry

- **WHEN** the automatic screener check fails after an import or on load
- **THEN** the page shows a notice naming the failure and a control to retry the check

#### Scenario: Retry reuses the in-flight guard

- **WHEN** the user presses retry while an automatic check from another trigger is still in flight
- **THEN** no second concurrent fetch starts; the retry observes the outcome of the in-flight check

#### Scenario: Dismissing the notice does not clear cached data

- **WHEN** the user dismisses the failure notice
- **THEN** the previously cached screener confirmation, if any, remains displayed unchanged

### Requirement: A new import replaces the cached report

When the user imports a file while a cached report already exists, the system SHALL ask for confirmation and then replace the previously cached parsed data with the new import; it SHALL NOT merge or de-duplicate across the two imports. The cached screener and catalog payloads SHALL be kept.

#### Scenario: Re-import replaces, not merges

- **WHEN** a user with an already-cached report imports a new `.xlsx` file
- **THEN** the dashboard reflects only the new file's data once confirmed, and the previous import's data is discarded

#### Scenario: Re-import is confirmed first

- **WHEN** the user picks a new file while cached data exists
- **THEN** the system asks for confirmation before discarding the existing cached report

### Requirement: Filter instruments by category from the page

The page SHALL provide a checkbox per category present in the imported data, derived from the data itself rather than hardcoded. Unticking a category SHALL hide its rows in every section consistently. The filter selection SHALL persist in the browser across reloads of the same cached report; all categories SHALL be ticked by default when a report is first imported.

#### Scenario: Unticking hides rows everywhere

- **WHEN** the user unticks a category
- **THEN** that category's rows disappear from all sections, and other categories are unaffected

#### Scenario: Filter persists across reloads

- **WHEN** the user unticks a category, then reloads the page
- **THEN** the same category remains unticked after the cached report is restored

### Requirement: Sort the ranking table with empty values last and signals by severity

Every ranking column SHALL be sortable in both directions. A cell with no numeric value (an uncalibrated rating or signal, an undefined velocity) SHALL NOT be coerced to zero; rows whose sort cell has no value SHALL be placed after every row that has one, in both directions, keeping their relative order. The signal column SHALL sort by severity — green above amber above red — with unrated rows last in either direction. Each row SHALL state in text the percentage basis (cash outlay or posted margin) its velocity and best/worst figures rest on, and uncalibrated cells SHALL read as not-applicable rather than blank or zero.

#### Scenario: Unrated rows sort last both ways

- **WHEN** the user sorts by stars ascending and then descending
- **THEN** uncalibrated rows appear after every rated row in both orders

#### Scenario: Signal sorts by severity

- **WHEN** the user sorts by signal descending
- **THEN** green rows come first, then amber, then red, then unrated

### Requirement: Render two views per projecting ladder, every figure labelled with its basis

Each open long ladder with projections SHALL be rendered with its summary facts (instrument, strategy stating the active rung's *effective* net target, invested amount, blended average, current price, unrealized P/L, age, periods held) separate from its take-profit levels — **at most two** take-profit lines: the **active** rung and, when one exists, the **next** rung only (`active_rung + 1`). Deeper rungs (R+2 through terminal) SHALL NOT be listed in the UI even though they remain computed. Each visible line SHALL carry its gross percentage, exit price, offset from current price (on the active rung only where applicable), plan state, and projected net result — with compliance flags shown once per ladder. Every projected figure on a visible line SHALL be labelled in text with its basis — staged plan together with the cumulative amount it is measured against, or current position together with the amount held — so no bare EUR amount or exit price appears without its basis. The active rung's line SHALL carry the current-position basis only. A short position SHALL render as a single unsupported entry with no take-profit levels.

#### Scenario: Projecting ladder shows both views

- **WHEN** a long ladder with projections is rendered
- **THEN** its summary facts and its take-profit levels are both shown, with compliance flags appearing once for the ladder

#### Scenario: Basis is on every line

- **WHEN** a ladder on R2 is rendered
- **THEN** exactly two take-profit lines are shown: R2 reads as current position on the amount held, and R3 reads as staged plan on 1600 EUR; R4 and R5 are not listed

#### Scenario: Terminal active rung shows one line

- **WHEN** a ladder's active rung is R5
- **THEN** only R5's take-profit line is shown and no further rung line appears

#### Scenario: Active R1 shows current and next only

- **WHEN** a ladder's active rung is R1 and deeper rungs are computed
- **THEN** the UI lists R1 and R2 only, not R3–R5

### Requirement: Mark a take-profit level whose net target was escalated by holding time

A rendered level whose effective net target exceeds its configured target SHALL carry a text marker stating the configured target it replaced (for example "escalated from 1 %"); a level whose two targets are equal SHALL carry none. The marker SHALL use the section's neutral styling and SHALL NOT add a line to the level.

#### Scenario: Escalated terminal rung is marked

- **WHEN** a ladder's floor is 2 % and R5's configured target is 1 %
- **THEN** R5's line carries the escalation marker naming 1 %, and R4's line carries none

### Requirement: Mark the active rung and the recommended rung distinctly

The active rung's level SHALL carry a distinct **ACTIVE** marker. When a next-rung recommendation is raised and screener-confirmed, the recommended rung's level SHALL carry a **RECOMMENDED** badge tiered by `marks` — `RECOMMENDED` for 1, `RECOMMENDED+` for 2, `RECOMMENDED++` for 3; a confirmed status with `marks` 0 or absent SHALL render the base `RECOMMENDED` — distinct in word and color from the ACTIVE marker; the two SHALL never fall on the same level. When the recommendation is raised but the status is not-confirmed, unknown, or stale, no badge SHALL render; instead a short neutral note SHALL name which of the three states applies (and, for unknown, its reason), on the same line as the recommendation's tier, drawdown, and shortfall figures, which SHALL be shown exactly as if confirmed. When the ticker was matched through an alias, the badge or note SHALL expose the matched screener symbol.

#### Scenario: Markers never coincide

- **WHEN** a ladder carries both an active-rung marker and a recommended-add marker
- **THEN** the two markers fall on different levels

#### Scenario: Recommendation without confirmation is still shown, unbadged

- **WHEN** a next-rung recommendation is raised but the screener has not confirmed it (or has not been checked)
- **THEN** the recommendation's tier/shortfall/trigger-crossed facts are shown with a note naming the withheld state, but no RECOMMENDED badge is rendered

#### Scenario: Tier follows marks

- **WHEN** a confirmed recommendation's ticker has `marks` 2
- **THEN** the badge reads `RECOMMENDED+`

### Requirement: State the data's provenance and freshness

The page SHALL show the report's as-of date (which ladders are computed against), when the report was imported, and — separately — when screener confirmation data was last checked, so a user can judge each independently.

#### Scenario: Three independent indicators

- **WHEN** a report dated 2026-10-02 was imported yesterday and the screener was last checked an hour ago
- **THEN** the page shows all three distinctly, none implying another

### Requirement: Show portfolio figures as a scannable, sign-aware summary

The portfolio summary SHALL present each figure as a labelled value in a compact strip. Realized P/L and open P/L SHALL carry an explicit sign and use a positive style for gains and a negative style for losses, and zero SHALL use neither. Taxes paid SHALL always be styled as a cost. EUR amounts SHALL use thousands separators. The summary's values SHALL be exactly the figures computed for the current category filter; this requirement changes only how they are shown. The subset note and the reconciliation notice (when one applies) SHALL render as visually distinct banners separate from the figures. The three provenance indicators (report as-of, import, screener check) SHALL each render as their own labelled chip.

#### Scenario: Gains and losses are told apart at a glance

- **WHEN** realized P/L is positive and open P/L is negative
- **THEN** realized P/L renders with a leading plus sign in the positive style and open P/L with a minus sign in the negative style

#### Scenario: Taxes read as a cost

- **WHEN** taxes paid is any non-zero amount
- **THEN** it renders in the negative style

#### Scenario: Figures are unchanged by styling

- **WHEN** the same report and category filter are rendered before and after this presentation change
- **THEN** every summary figure has the same underlying value

### Requirement: Offer a one-step way to restore hidden categories

When at least one category is unticked, the category filter SHALL state which categories are hidden and SHALL offer a control that re-ticks all of them at once. When no category is hidden, neither the statement nor the control SHALL be shown. Using the control SHALL behave exactly like ticking each hidden category individually, including persistence of the selection.

#### Scenario: Show all restores every category

- **WHEN** two categories are unticked and the user activates the show-all control
- **THEN** all categories are ticked, every section shows their rows again, and the selection persists across a reload

#### Scenario: No clutter when nothing is hidden

- **WHEN** every category is ticked
- **THEN** no hidden-categories statement and no show-all control appears

### Requirement: Tables present values consistently and legibly

Every table in the four sections SHALL right-align numeric columns and use figures of equal width so that values line up in a column; keep its header row visible while the table body scrolls vertically within the viewport; indicate the active sort column and direction with a visible indicator separate from the label text; and highlight the row under the pointer. Profit and loss amounts and open drawdown percentages SHALL use the positive style for gains and the negative style for losses. Tickers SHALL be set apart from names (for example in a monospaced style). Star ratings SHALL render as filled and empty star glyphs out of five and keep their numeric value available as text alternative. Signals SHALL render as a coloured badge whose text still names the signal. A cell with no value because the category is uncalibrated or the figure is undefined SHALL read as not-applicable with an explanation of the reason available on hover or focus, and SHALL NOT be blank or zero. A section with no rows SHALL show a clearly delimited empty-state message, and explanatory notes above a table SHALL be visually distinct from table content. Wide tables SHALL scroll horizontally within their container rather than overflowing the page.

#### Scenario: Numbers line up

- **WHEN** the ranking table renders rows with differing digit counts in the trades and total P/L columns
- **THEN** those columns are right-aligned with equal-width figures

#### Scenario: Active sort is visible

- **WHEN** the user sorts a table by a column
- **THEN** that column's header shows a direction indicator and the other headers do not

#### Scenario: Uncalibrated cells explain themselves

- **WHEN** a ranking row belongs to an uncalibrated category
- **THEN** its stars and signal cells read as not-applicable and expose the reason (uncalibrated category, or no measurable velocity) on hover or focus

#### Scenario: Signal and stars are readable without colour

- **WHEN** a rated row renders
- **THEN** the signal badge's text names green, amber, or red, and the star cell exposes its numeric rating as text

#### Scenario: Empty section is explained

- **WHEN** a section has no rows under the current filter
- **THEN** a delimited empty-state message appears in place of the table

### Requirement: Present each ladder's compliance flags and take-profit lines as distinct, state-aware elements

Within the Open ladders section, each ladder's compliance flags SHALL render as one separate element per flag, with flags that need attention styled differently from informational ones, and a ladder with no flags SHALL render a positive "Compliant" element rather than an empty cell. Each visible take-profit line SHALL render as its own element visually grouped with its ladder and carrying a state indicator: the active rung SHALL be styled by whether its target is reached or pending (and distinctly when below the minimum net-profit floor), and the next rung SHALL be styled as a plan. The ACTIVE marker and the tiered RECOMMENDED badge (per the existing marker requirement) SHALL render as compact badges within their lines. A next-rung recommendation and any screener-withheld note SHALL render as a callout distinct from the take-profit lines, with the matched screener symbol and snapshot time available on hover or focus whenever the ticker was matched through the screener. The text content required by the existing requirements — basis wording, exit prices, offsets, plan states, net results, escalation marker, shortfall figures — SHALL remain present on the lines.

#### Scenario: One chip per flag

- **WHEN** a ladder carries two compliance flags
- **THEN** two separate flag elements render in its compliance cell, and no comma-joined string appears

#### Scenario: Clean ladder reads as compliant

- **WHEN** a ladder carries no compliance flags
- **THEN** its compliance cell shows a "Compliant" element

#### Scenario: Active line reflects reached or pending

- **WHEN** an active rung's exit price is at or below the current price
- **THEN** its line carries the reached style, and when it is above the current price its line carries the pending style

#### Scenario: Tiered badge on the callout

- **WHEN** a confirmed recommendation's ticker has `marks` 3
- **THEN** a `RECOMMENDED++` badge renders in the recommendation callout, and no ACTIVE marker appears on that line

#### Scenario: Withheld recommendation stays unbadged

- **WHEN** a recommendation is raised but the screener status is not-confirmed, unknown, or stale
- **THEN** the callout shows the tier, shortfall, and a neutral note naming the state, and no RECOMMENDED badge renders

### Requirement: Render report-derived text safely

All text originating from the imported report or the screener and catalog data — instrument names, tickers, categories, compliance flag text, and screener reasons or symbols — SHALL be displayed as literal text and SHALL NOT be interpreted as markup, so that names containing characters such as `<`, `>`, `&` or quotes display unchanged and cannot alter the page.

#### Scenario: Markup-like names display literally

- **WHEN** an imported instrument name contains `<b>X</b> & Y`
- **THEN** the page displays that exact text and renders no bold element or other injected markup
