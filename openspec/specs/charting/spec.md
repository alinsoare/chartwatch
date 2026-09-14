# charting Specification

## Purpose

Covers the user-facing chart application: browsing the instrument catalog, viewing candlestick charts across timeframes, seeing compatibility warnings, and operating sync controls — all against locally stored data only.

## Requirements

### Requirement: Symbol browser

The UI SHALL list all catalog instruments with free-text search (matching symbol and names), an asset-class filter, a quote-currency filter, an exchange filter, a compatible-only filter, and an enabled-only filter. Each entry SHALL show its sync freshness (bar count and last sync, or "never synced") and any compatibility warnings as badges.

The quote-currency and exchange filters SHALL offer only values carried by the instruments actually loaded, plus an "all" choice that admits every instrument, so no filter choice can produce an empty list for a value the catalog does not hold. The quote-currency filter SHALL match on the same effective currency that compatibility is judged against, so an instrument flagged "not EUR" is never admitted by a EUR currency filter. The enabled-only filter SHALL exclude instruments whose catalog enabled flag is off; with it inactive, those instruments remain listed as they are today.

Every active filter SHALL narrow the list in combination with the others: an instrument is listed only if it satisfies all of them. When any filter is narrowing the list, the sidebar SHALL report how many instruments are visible out of the catalog total; when no filter is narrowing it, the sidebar SHALL report the total as it does today.

The UI SHALL offer a single control that returns every sidebar filter and the sort order to its default. That control SHALL NOT alter the selected instrument, the selected timeframe, the enabled indicators, or the chart display limit.

Every entry the filters admit SHALL identify its instrument — its symbol, its asset class and its name — and no screening outcome SHALL displace that identification. Filters may exclude an instrument from the list entirely; nothing inside a listed entry may leave it unidentified.

Each entry SHALL additionally carry its screening result: the marks its score earns inline with its symbol code, the short names of the sources that earned its score on a line beneath those marks, its 30-day range, its position in that range, and its headroom to the high of that range. The three figures SHALL be shown together on one line, in that order, each labelled so it cannot be mistaken for another, and each formatted as a percentage to the same precision — the headroom is a third figure added beside the existing two, and SHALL NOT replace, reword or reformat either of them. The figures SHALL be shown for every screened instrument, whether or not it earned a mark, so a list with no marks reads as screened-and-quiet rather than broken. An instrument that could not be screened SHALL say why — not screened, or insufficient history — in place of its figures, and only in place of its figures. A screened instrument for which the screener reports no headroom SHALL show its remaining figures and mark the headroom as unavailable, in the same way an absent range or position already reads.

A screened row that earns no mark and names no source SHALL be treated as an ordinary, expected row rather than an exceptional one. No part of the row SHALL promise that a screened instrument carries at least one mark, because the screener's scoring model awards no automatic point: on a typical day most rows are marked-and-sourced nowhere while still showing their three figures. Such a row SHALL remain visually distinct from a row that states it was not screened or that its history is insufficient, so a blank mark area is never read as a failed or missing computation.

The headroom figure SHALL read as the screener reports it, including when it is zero or negative, and the row SHALL NOT hide, clamp or re-sign it. It SHALL be presented as a fact about the 30-day window like the other two, with no styling that suggests a recommendation, a target or a ranking.

Each source name SHALL read as its own bounded label: green text within a green rectangular outline, unfilled so the row's background shows through. The outline SHALL enclose exactly one source name, so the fired sources are countable without reading the words, and adjacent labels SHALL stay visually separate rather than sharing or touching a border. Every source SHALL receive the same treatment, with no colour, weight or size distinguishing one source from another — the mark count already carries strength. The green SHALL be the green of the marks, so the labels read as belonging to the same signal, and SHALL remain distinguishable from the row's muted range, position, headroom and state text.

The marks SHALL be accompanied, on demand, by the rules that fired and the points each contributed, so a mark can be audited from the list itself. The source names are for at-a-glance scanning and SHALL NOT duplicate the per-rule points.

The list SHALL offer, alongside the filters, sorting by screening score, by symbol ascending, by instrument name ascending, and by headroom to the 30-day high — as well as the catalog's own default order. It SHALL NOT offer sorting by recency of last sync. Sorting by headroom SHALL place the largest headroom first, and SHALL place every instrument with no headroom figure — one not screened, one with insufficient history, one whose window yields no figure — after every instrument that has one, rather than treating an absent figure as the largest or as zero. Sorting SHALL apply to whatever the filters admit, and SHALL be stable for instruments the chosen order cannot distinguish: instruments sharing a score or a headroom figure, and instruments alike in having none, SHALL keep their relative order from the catalog's default order.

Choosing a filter, a filter value, or a sort order SHALL operate on already-loaded data only: it SHALL NOT fetch market data, start a sync, or cause the screener to re-scan. In particular, sorting by headroom SHALL read the screening results the list already holds.

#### Scenario: Filtering the catalog

- **WHEN** the user types a search query and selects an asset class
- **THEN** the list shows only instruments matching both, and a clear message when nothing matches

#### Scenario: Filtering by quote currency

- **WHEN** the user selects EUR in the quote-currency filter
- **THEN** the list shows only instruments whose effective quote currency is EUR, and an instrument flagged "not EUR" is absent even where the catalog file claims EUR for it

#### Scenario: Filtering by exchange

- **WHEN** the user selects an exchange
- **THEN** the list shows only instruments on that exchange, and the filter's choices name only exchanges present among the loaded instruments

#### Scenario: Hiding disabled instruments

- **WHEN** the user turns on the enabled-only filter while the catalog holds instruments with the enabled flag off
- **THEN** those instruments leave the list, and turning the filter off again restores them

#### Scenario: Filters combine

- **WHEN** the user selects an asset class, a quote currency and the compatible-only filter together
- **THEN** only instruments satisfying all three are listed

#### Scenario: Reporting how much is hidden

- **WHEN** a filter narrows the list to 12 instruments out of a catalog of 80
- **THEN** the sidebar reports 12 visible out of 80, and reports the plain total again once every filter is back to its default

#### Scenario: Clearing the filters

- **WHEN** the user has a search query, an asset class, a currency, an exchange, both checkboxes and a non-default sort order in effect, and activates the clear-filters control
- **THEN** every filter and the sort order return to their defaults and the full list is shown, while the selected instrument, timeframe, indicators and display limit are unchanged

#### Scenario: Screening result in the row

- **WHEN** an instrument scores 4 in the screener from a bullish D1 gap trigger, a demand D1 order-block trigger and a distance worth 2 points
- **THEN** its row shows three marks inline with its symbol, names those three sources on the line beneath, and shows its 30-day range, its position in that range and its headroom to the high of that range

#### Scenario: Three figures on one line

- **WHEN** a screened instrument's 30-day range is 40.0%, its position is 90.0% and its headroom is 2.9%
- **THEN** its row shows all three figures on the figures line, each labelled and each to one decimal place, with the range and the position reading exactly as they did before the headroom was added

#### Scenario: A negative headroom is shown as such

- **WHEN** the screener reports a negative headroom for an instrument, its current price having run above its 30-day high
- **THEN** the row shows that negative figure rather than zero or a blank, and its range and position figures are unaffected

#### Scenario: A screened row with no headroom figure

- **WHEN** an instrument is screened but the screener reports no headroom for it
- **THEN** the row marks the headroom unavailable and still shows whatever range and position figures the screener reported, rather than dropping the figures line

#### Scenario: Source names read as green outlined labels

- **WHEN** a screened row names the sources that earned its score
- **THEN** each name is green text inside its own green rectangular outline with no fill behind it, and the number of outlines can be counted without reading the names

#### Scenario: Every source looks the same

- **WHEN** a row names sources drawn from different rules
- **THEN** all of its labels carry the identical green outline treatment, with nothing about a label's colour, weight or size implying that its source counted for more

#### Scenario: Labels stay apart when the line wraps

- **WHEN** a row names enough sources that the line wraps
- **THEN** every label keeps its own complete outline, and no two labels touch or appear to share a border across or within lines

#### Scenario: Rows on the same score read differently

- **WHEN** two instruments both score 3, one from a single trigger with a distance worth 2 points and one from all three triggers with a near target
- **THEN** both show two marks, their source lines name different sources, and the difference is visible without inspecting either row

#### Scenario: Screened but unmarked

- **WHEN** an instrument is screened and earns no mark
- **THEN** its row shows no marks, names no source, shows no empty outline, and still shows its 30-day range, position and headroom figures

#### Scenario: Most rows carry no mark on a quiet day

- **WHEN** the catalog is screened on a day when few instruments trigger anything
- **THEN** the many rows showing no marks and no sources read as screened-and-quiet, each still showing its three figures, and none of them is styled or worded as a failure or as an instrument that could not be screened

#### Scenario: Auditing a mark

- **WHEN** the user inspects the marks on a row
- **THEN** the rules that fired and their points are shown

#### Scenario: Sorting by score

- **WHEN** the user sorts by score with an asset-class filter active
- **THEN** the instruments that filter admits are ordered by score, highest first, and instruments sharing a score keep a stable relative order

#### Scenario: Sorting alphabetically

- **WHEN** the user sorts by symbol, then by instrument name
- **THEN** the admitted instruments are ordered ascending by that field in each case, independently of the catalog's own order

#### Scenario: Sorting by headroom

- **WHEN** the user sorts by headroom with an asset-class filter active
- **THEN** the instruments that filter admits are ordered by headroom, largest first, independently of their scores, and instruments sharing a headroom figure keep a stable relative order

#### Scenario: Instruments without a headroom figure sort last

- **WHEN** the user sorts by headroom and some admitted instruments were not screened or have insufficient history
- **THEN** the instruments with a headroom figure come first, largest first, and those without one follow in their default relative order

#### Scenario: A negative headroom still sorts by value

- **WHEN** the user sorts by headroom and one admitted instrument's headroom is negative
- **THEN** it is ordered below every instrument with a larger headroom and above every instrument with no figure at all

#### Scenario: Never-synced instruments when sorting by sync recency

- **WHEN** the user looks for an order by recency of last sync, as the order that placed never-synced instruments last
- **THEN** the selector offers no such order — it offers the catalog's default order, score, symbol, name and headroom — and each row's own sync freshness, including "never synced", remains readable where it always was

#### Scenario: Filtering and sorting fetch nothing

- **WHEN** the user changes any filter or the sort order
- **THEN** the list re-renders from already-loaded data with no market-data fetch, no sync run, and no screener re-scan

#### Scenario: Unscreenable instrument

- **WHEN** a disabled instrument, or one with too little stored history, appears in the list
- **THEN** its row shows its symbol, asset class and name exactly as a screened row does, and states that it was not screened, or that its history is insufficient, where its range, position and headroom figures would otherwise be

#### Scenario: A zero score is not an unscreenable state

- **WHEN** a disabled instrument, an instrument with insufficient history, and an instrument screened with a score of zero appear in the list together
- **THEN** the first two state why they were not scored in place of their figures, while the third shows its three figures with no marks, and the three rows cannot be mistaken for one another

#### Scenario: Identifying an instrument with insufficient history

- **WHEN** the user reads a row whose instrument has too little stored history
- **THEN** the instrument's symbol and name are legible in that row without selecting it or opening its chart

#### Scenario: Filters still hide rows

- **WHEN** the search query, asset-class filter, quote-currency filter, exchange filter, compatible-only filter or enabled-only filter excludes an unscreenable instrument
- **THEN** that instrument has no row at all, rather than a row missing its name

### Requirement: Candlestick chart with timeframe switching

Selecting an instrument SHALL display an interactive OHLC candlestick chart (pan, zoom, crosshair) of its locally stored bars. The user SHALL be able to switch between H1, D1, and W1. Bar timestamps arriving as UTC epoch seconds SHALL be rendered without unit confusion against millisecond-based date arithmetic.

The timeframe controls the UI offers SHALL be exactly the supported set the backend or the exported snapshot declares, in the order it declares them, so a timeframe the system no longer supports cannot be selected from the chart at all.

#### Scenario: Switching timeframes

- **WHEN** the user selects a different timeframe button
- **THEN** the chart reloads with that timeframe's stored bars, and shows an empty-state message when no bars are stored

#### Scenario: No control for a retired timeframe

- **WHEN** the user opens the chart against a store that still holds M15 bars
- **THEN** the timeframe controls offer H1, D1 and W1 only, and no control exists that would chart the retired timeframe

#### Scenario: OHLC readout

- **WHEN** the user moves the crosshair over a candle
- **THEN** a legend shows that bar's open, high, low, and close values

### Requirement: Default chart zoom frames the most recent bars

When the chart is presented afresh — an instrument selected, a timeframe switched, the display limit changed, or the series reloaded after a sync — the initial view SHALL frame the 200 most recent bars of the displayed slice rather than the whole slice. The default SHALL be the same on every timeframe and SHALL NOT be a user-facing setting. Bars in the displayed slice that fall outside the initial view SHALL remain loaded and reachable by panning and zooming, so the default zoom bounds only what is visible and never what is available. Where the displayed slice holds 200 bars or fewer, the whole slice SHALL be framed, with no empty space reserved for bars that do not exist. Framing the view SHALL NOT cause any market-data fetch.

#### Scenario: Opening a deep series

- **WHEN** the user charts a timeframe holding 5,000 displayed bars
- **THEN** the initial view frames the 200 most recent of those bars, at a zoom where individual candles are legible

#### Scenario: Older bars remain reachable

- **WHEN** the user pans left from the initial view of a 5,000-bar slice
- **THEN** the earlier bars of the slice scroll into view, without any request to the data source

#### Scenario: Switching timeframe re-frames the view

- **WHEN** the user zooms out to see the whole slice and then selects a different timeframe
- **THEN** the new timeframe opens framed on its 200 most recent bars rather than at the zoom the user had left behind

#### Scenario: Slice shorter than the default zoom

- **WHEN** the selected series holds 80 bars
- **THEN** all 80 bars are framed in the view and no empty space is reserved for the missing ones

#### Scenario: Reload after a sync

- **WHEN** a sync completes and the chart reloads its series
- **THEN** the view is framed on the 200 most recent bars, now including any newly stored bars

### Requirement: Jump to latest data without changing zoom

The chart SHALL offer a control that returns the view to the newest bar of the displayed slice, scrolling so that the newest bar sits at 90% of the chart width with about 10% of the view clear to its right while leaving the current zoom — the number of bars the view spans — unchanged. The control SHALL be available whenever a series is charted, including when the view is already at the newest bar, in which case pressing it SHALL leave the view as it is. "Latest" SHALL mean the newest bar already loaded; the control SHALL NOT trigger a market-data fetch or a sync, and SHALL behave identically whether the frontend is served by the local dev backend or as a static export. Because the jump is an ordinary change of view, chart tools and indicators SHALL be unaffected: a drawn measurement SHALL stay anchored to its own bars rather than being discarded.

#### Scenario: Returning to the newest bars at a chosen zoom

- **WHEN** the user zooms in to roughly 40 bars, pans far back into history, and presses the jump-to-latest control
- **THEN** the view returns to the newest bar at 90% of the chart width, with the same span of roughly 40 bars still in view

#### Scenario: Zoomed out further than the default

- **WHEN** the user zooms out to span 1,000 bars, pans back, and presses the jump-to-latest control
- **THEN** the view returns to the newest bar still spanning 1,000 bars, rather than snapping back to the 200-bar default

#### Scenario: Already at the newest bar

- **WHEN** the user presses the jump-to-latest control immediately after a chart opens
- **THEN** the view is unchanged and no error is shown

#### Scenario: No data to jump to

- **WHEN** the selected instrument and timeframe have no stored bars and the user presses the jump-to-latest control
- **THEN** nothing is drawn, the existing empty-state message remains, and no request is made to the data source

#### Scenario: Jumping in static mode

- **WHEN** the frontend is loaded as a static site without a backend and the user presses the jump-to-latest control
- **THEN** the view returns to the newest exported bar and no market-data request is made

#### Scenario: A measurement survives the jump

- **WHEN** a ruler measurement is drawn and the user presses the jump-to-latest control
- **THEN** the measurement stays anchored to the bars it was taken against, exactly as it does when the user pans by hand

### Requirement: Chart display limit

The chart SHALL make available at most a bounded number of the most recent bars of the selected series, bounded by a limit the user controls. The default SHALL be 5,000 bars, the same on every timeframe, and the user SHALL be able to raise or lower it or set it to show every stored bar. The limit bounds the slice the chart draws and the user can pan and zoom across; it is distinct from the zoom, which bounds how much of that slice is visible at once. Changing the limit SHALL take effect immediately on the current chart and SHALL NOT cause any market-data fetch, because the bars are already loaded. Where the series holds fewer bars than the limit, the whole series SHALL be available. A limit value that is not a positive whole number SHALL be refused, leaving the previous effective limit in force.

#### Scenario: Default limit on a deep series

- **WHEN** the user charts a timeframe holding 12,000 stored bars with the default limit
- **THEN** the 5,000 most recent bars are available to pan and zoom across, and the older bars are absent from the chart entirely

#### Scenario: Showing everything

- **WHEN** the user sets the display limit to show all bars
- **THEN** every stored bar of the selected series is available to pan and zoom across

#### Scenario: Lowering the limit

- **WHEN** the user lowers the display limit while a chart is open
- **THEN** the chart immediately redraws with only that many most-recent bars, framed on the default zoom, with no request to the data source

#### Scenario: Series shorter than the limit

- **WHEN** the selected series holds 300 bars and the limit is 5,000
- **THEN** all 300 bars are available and no empty space is reserved for the missing ones

#### Scenario: Changing the limit discards a measurement

- **WHEN** a chart tool measurement is drawn and the user changes the display limit
- **THEN** the measurement is discarded, because its anchors refer to bars the view may no longer contain

#### Scenario: Invalid limit is refused

- **WHEN** the user enters a display limit of zero, a negative number, or text that is not a number
- **THEN** the value is refused and the chart continues using the last valid limit

### Requirement: Automatic vertical scale

The chart SHALL offer a two-state control, labelled AUTO, that governs how the vertical (price) scale is chosen. The control SHALL sit in the lower-right corner of the chart area, overlaying the price scale, and SHALL be present whenever a chart is presented. It SHALL NOT obscure the crosshair's price label, the crosshair OHLC legend, or the empty-state message, and it SHALL NOT sit over an indicator sub-pane's own scale.

Its state SHALL be visible at a glance — which of the two states is in force SHALL be distinguishable without activating it and without relying on colour alone. Its default SHALL be on.

**While off**, the vertical scale SHALL behave exactly as it does today: the user SHALL be able to change it by hand on the price scale, and nothing about the chart's current vertical-scale behavior SHALL change. Off is the state that preserves existing behavior, but a browser that has never seen this control SHALL start with AUTO on.

**While on**, the vertical scale SHALL be derived from the bars currently visible in the horizontal view: the highest price among them SHALL be placed at 90% of the chart pane's height and the lowest price among them at 10%, measured from the bottom of the pane, leaving a tenth of the height clear above the high and a tenth below the low. Only visible bars SHALL contribute — a bar in the loaded slice but outside the horizontal view SHALL NOT influence the scale, and no bar outside the display limit SHALL be consulted at all. The placement SHALL hold at any container size, because it is expressed as a proportion of the pane's height rather than in pixels.

While on, the framing SHALL be recomputed whenever the set of visible bars changes — panning left or right, zooming in or out, jumping to the latest bar, switching instrument or timeframe, changing the display limit, reloading the series after a sync, and resizing the chart — so the 90/10 placement holds continuously during navigation rather than only at the moment the control was switched on. Recomputation SHALL read bars already loaded in the chart: it SHALL NOT cause a market-data fetch or a sync, and SHALL behave identically whether the frontend is served by the local dev backend or as a static export.

While on, changing the scale by hand SHALL NOT take effect: the framing is the control's to decide, and the user SHALL NOT be left with a scale that the next pan silently overrides. Switching the control off SHALL hand manual control back with the prices currently framed still framed, so the view does not jump at the moment of handover. Switching it on SHALL frame the current window immediately, without waiting for a pan, whatever scale was in force beforehand — including a scale the user had dragged.

The control SHALL affect the vertical scale only. Switching it on or off SHALL NOT change which bars are horizontally visible, SHALL NOT change the zoom, and SHALL NOT discard chart tool measurements or indicator drawings, which SHALL stay anchored to their own bars. Displayed price precision SHALL continue to follow the selected instrument.

Degenerate windows SHALL be defined rather than left to chance:

- Where every visible bar sits at a single price, the scale SHALL span a small range around that price so that the candles are drawn legibly near the middle of the pane and the price scale still reads as a scale, rather than collapsing to a zero-height range, dividing by zero, or blanking the pane.
- Where the visible window yields no usable price — no visible bars, or bars carrying values that are not finite numbers — the previous scale SHALL be left in force and the chart SHALL continue to render, with no error state and no fetch. The control SHALL remain in the state the user left it in, so the next window that does yield prices is framed without the user touching it again.
- Where the selected instrument and timeframe have no stored bars, the existing empty-state message SHALL remain as it is and the control SHALL be inert, retaining its state for the next series charted.

#### Scenario: Placement over the price scale

- **WHEN** the user charts an instrument
- **THEN** an AUTO control is visible in the lower-right of the chart area over the price scale, and it covers neither the crosshair price label, nor the OHLC legend, nor an indicator sub-pane's scale

#### Scenario: Off preserves today's behavior

- **WHEN** the user charts an instrument with the control off and changes the vertical scale by hand on the price scale
- **THEN** the scale changes as it does today and stays as the user set it

#### Scenario: Switching on frames the visible window

- **WHEN** the user switches the control on while a window whose visible high is 120 and visible low is 100 is displayed
- **THEN** 120 is placed at 90% of the pane's height and 100 at 10%, and the horizontally visible bars are unchanged

#### Scenario: Only visible bars count

- **WHEN** the control is on and the loaded slice contains a price far above anything in the visible window
- **THEN** the scale is derived from the visible window's own high and low, and the off-screen extreme has no effect on it

#### Scenario: Panning left recomputes the scale

- **WHEN** the control is on and the user pans left into a window whose prices are far below those of the previous window
- **THEN** the new window's high sits at 90% and its low at 10%, rather than the candles drawing squashed against the bottom of the pane

#### Scenario: Panning back right recomputes again

- **WHEN** the user pans back to the right after the scale has re-derived for an earlier window
- **THEN** the scale re-derives for each newly visible window as the user goes, ending framed on the window in view

#### Scenario: Zooming recomputes the scale

- **WHEN** the control is on and the user zooms out so that many more bars become visible
- **THEN** the scale re-derives from the wider window's high and low, keeping them at 90% and 10%

#### Scenario: Jumping to latest with AUTO on

- **WHEN** the control is on, the user has panned far back into history, and presses the jump-to-latest control
- **THEN** the view returns to the newest bar with its zoom unchanged and the scale framed on the newly visible window

#### Scenario: Switching instrument or timeframe with AUTO on

- **WHEN** the control is on and the user selects a different instrument or timeframe
- **THEN** the new series opens framed on its default zoom with its visible high at 90% and its visible low at 10%, and the control is still on

#### Scenario: Resizing the window keeps the proportions

- **WHEN** the control is on and the browser window is resized so the chart pane becomes taller
- **THEN** the visible high and low remain at 90% and 10% of the new pane height

#### Scenario: Manual scaling is inert while AUTO is on

- **WHEN** the control is on and the user tries to change the vertical scale by hand
- **THEN** the framing stays as the control derived it, rather than accepting a scale that the next pan would override

#### Scenario: Switching off hands back control without a jump

- **WHEN** the user switches the control off while a window is framed at 90/10
- **THEN** the same prices stay framed at the moment of the switch, and the user can then change the scale by hand as before

#### Scenario: Switching on after a manual scale

- **WHEN** the user has dragged the price scale to a range that hides the visible low, then switches the control on
- **THEN** the visible window is re-framed at once to 90/10 without the user panning or zooming

#### Scenario: A flat window

- **WHEN** the control is on and every bar in the visible window sits at the same price
- **THEN** the candles are drawn legibly near the middle of the pane, the price scale still shows a range around that price, and no error is shown

#### Scenario: A window with no usable prices

- **WHEN** the control is on and the visible window yields no usable price, because it contains no bars or because their values are not finite numbers
- **THEN** the previous scale stays in force, the chart continues to render without an error, and the control remains on for the next window

#### Scenario: No bars stored at all

- **WHEN** the selected instrument and timeframe have no stored bars and the control is on
- **THEN** the existing empty-state message is shown unchanged, nothing is drawn, and the control keeps its state for the next series charted

#### Scenario: A measurement survives the toggle

- **WHEN** a ruler measurement is drawn and the user switches the control on and then off
- **THEN** the measurement stays anchored to the bars it was taken against, exactly as it does when the user pans by hand

#### Scenario: Framing fetches nothing

- **WHEN** the control is on and the user pans, zooms, or toggles it repeatedly, in either dev-backend or static-export mode
- **THEN** no market-data request and no sync is made, and the behavior is identical in both modes

#### Scenario: Operating the control from the keyboard

- **WHEN** the user reaches the control by keyboard and activates it
- **THEN** it toggles, its focus is visibly indicated, and its new state is exposed to assistive technology as a pressed or unpressed toggle with a name identifying it as the automatic vertical scale

### Requirement: User settings persist across reloads

The UI SHALL remember the user's settings on the same browser and restore them on the next load: the chart display limit, the automatic vertical scale control's state, the selected instrument, the selected timeframe, the enabled indicators, and the sidebar filters (search text, asset class, quote currency, exchange, compatible-only, enabled-only, sort order). Persistence SHALL be local to the browser and SHALL NOT travel with the exported data or be shared between browsers. Only these settings persist; transient chart state SHALL NOT — neither an in-progress or completed measurement, nor the current zoom and scroll position, which start from the default framing on every load, nor the particular price range the automatic vertical scale last derived, which is recomputed from whatever is visible after the restore. Neither SHALL the sync controls' own state — the full-refresh option and the periodic-refresh control both start off on every load, so a reload can never resume fetching. A stored setting that is unusable — an instrument no longer in the catalog, an unknown timeframe, an unparseable limit, a non-boolean automatic-scale state, an unknown sort order, an asset class, quote currency or exchange no longer carried by any loaded instrument — SHALL be replaced by its default without blocking the rest of the restore. A browser holding settings written before the automatic vertical scale existed SHALL restore that control to its default of off, keeping its other settings, without a migration step and without an error. A sort order the list no longer offers SHALL be treated as unknown, so a browser holding the withdrawn sync-recency order restores the default order and keeps its other settings, without a migration step and without an error. A timeframe the system no longer supports SHALL likewise be treated as unknown, so a browser holding a withdrawn timeframe restores the default timeframe and keeps its other settings, again without a migration step and without an error. Restoring a filter SHALL NOT be able to hide the whole catalog behind a value the user cannot see in the filter's own choices. Where the browser denies persistent storage, the app SHALL operate normally with default settings.

#### Scenario: Settings survive a reload

- **WHEN** the user selects an instrument and timeframe, enables an indicator, sets a display limit, filters and sorts the sidebar, and reloads the page
- **THEN** the same instrument, timeframe, indicator state, display limit, filters and sort order are in effect after the reload

#### Scenario: The automatic vertical scale survives a reload

- **WHEN** the user switches the automatic vertical scale on and reloads the page
- **THEN** it is still on after the reload, and the restored series opens framed with its visible high at 90% and its visible low at 10%

#### Scenario: A browser that predates the control

- **WHEN** the browser holds settings written before the automatic vertical scale existed
- **THEN** the control restores to on, every other persisted setting is restored as usual, and no error is shown

#### Scenario: The derived price range is not restored

- **WHEN** the automatic vertical scale is on and the user reloads the page
- **THEN** the scale is derived afresh from the window visible after the restore, rather than from the range in force before the reload

#### Scenario: The headroom order survives a reload

- **WHEN** the user sorts the sidebar by headroom and reloads the page
- **THEN** the list is still sorted by headroom after the reload

#### Scenario: A withdrawn sort order falls back

- **WHEN** the browser holds a persisted sort order of sync recency, which the list no longer offers
- **THEN** the list restores the catalog's default order, every other persisted setting is restored as usual, and no error is shown

#### Scenario: A withdrawn timeframe falls back

- **WHEN** the browser holds a persisted timeframe of M15, which the system no longer supports
- **THEN** the chart opens on the default timeframe, every other persisted setting — instrument, indicators, display limit, filters and sort order — is restored as usual, and no error is shown

#### Scenario: Zoom is not restored

- **WHEN** the user zooms out to span the whole slice and reloads the page
- **THEN** the restored instrument and timeframe open framed on the default zoom, not the zoom in force before the reload

#### Scenario: Stored instrument is gone from the catalog

- **WHEN** the persisted instrument is no longer in the catalog on the next load
- **THEN** the app falls back to its default selection, keeps the other restored settings, and renders normally

#### Scenario: Stored filter value is gone from the catalog

- **WHEN** the persisted asset class, exchange or quote currency is no longer carried by any loaded instrument
- **THEN** that filter falls back to admitting every instrument, the other restored settings are kept, and the list is not left empty

#### Scenario: Storage is unavailable

- **WHEN** the browser blocks persistent storage
- **THEN** the app loads with default settings and continues to work, without an error state

#### Scenario: Settings are not part of the published data

- **WHEN** two different browsers load the same published site
- **THEN** each keeps its own settings, and neither is affected by the other's

### Requirement: Price display precision follows the instrument

The number of decimals used to display prices SHALL be derived from the selected instrument's point size in the catalog: a point size of `0.01` displays two decimals, a point size of `0.00001` displays five. Every price the UI shows for that instrument SHALL use that same precision — the price scale, the crosshair's price label, the crosshair OHLC legend, and any chart tool readout — so that two readings of the same price never disagree. Where the UI is given no usable point size for the selected instrument, it SHALL fall back to two decimals and continue rendering, rather than failing or displaying an unbounded number of decimals.

#### Scenario: Instrument quoted in hundredths

- **WHEN** the user charts an instrument whose point size is `0.01`
- **THEN** the price scale, the crosshair price label, and the OHLC legend each show two decimals

#### Scenario: Instrument quoted more finely

- **WHEN** the user charts an instrument whose point size is `0.00001`
- **THEN** the price scale, the crosshair price label, and the OHLC legend each show five decimals

#### Scenario: Readings of the same price agree

- **WHEN** a chart tool reports a price or a price difference for the selected instrument
- **THEN** it is shown with the same number of decimals as the OHLC legend and the price scale

#### Scenario: Switching to an instrument with different precision

- **WHEN** the user switches from an instrument quoted in five decimals to one quoted in two
- **THEN** the displayed precision changes to match the newly selected instrument

#### Scenario: Precision cannot be determined

- **WHEN** the UI is served an instrument with no usable point size, which a valid catalog cannot produce but a hand-edited or truncated data file can
- **THEN** prices are displayed with two decimals and the chart renders normally

### Requirement: Displayed data always matches the selection

When the user switches instruments or timeframes rapidly, the chart SHALL never display data belonging to a previously selected instrument or timeframe, even if that earlier response arrives late.

#### Scenario: Slow response for a stale selection

- **WHEN** the user selects symbol A and then symbol B before A's data arrives
- **THEN** the chart shows B's data; A's late response is discarded

### Requirement: Compatibility warnings at the chart

Compatibility warnings for the selected instrument SHALL be visible next to the chart itself, not only in the sidebar list.

#### Scenario: Charting a CFD

- **WHEN** the user selects an instrument flagged as a CFD
- **THEN** a CFD badge appears in the chart header while the chart renders normally

### Requirement: Sync controls in the UI

When a backend is available, the UI SHALL offer sync-all, sync-selected, a full-refresh option, and a periodic-refresh control, with a progress display while a run is active. These controls SHALL be the only way the UI causes market data to be fetched.

#### Scenario: Sync from the chart

- **WHEN** the user presses sync-selected with an instrument chosen
- **THEN** a sync starts for that instrument, progress is shown until completion, and the list and chart refresh from local storage afterwards

#### Scenario: Periodic refresh is presented as a sync control

- **WHEN** the sync controls are shown
- **THEN** the periodic-refresh control appears among them, off, and its state is visible while it is on

### Requirement: The frontend runs with or without a backend

The frontend SHALL operate in two modes against the same data contract: served by the local dev backend with sync available, and as a static site reading exported data files with sync controls absent or disabled. Chart browsing behavior SHALL be identical in both modes.

#### Scenario: Static mode

- **WHEN** the frontend is loaded as a static site without a backend
- **THEN** browsing, charting, and indicators work from the exported data files, and no sync can be triggered
