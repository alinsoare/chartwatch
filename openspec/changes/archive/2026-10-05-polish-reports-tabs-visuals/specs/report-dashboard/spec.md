## MODIFIED Requirements

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

## ADDED Requirements

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
