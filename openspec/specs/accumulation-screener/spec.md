# accumulation-screener Specification

## Purpose

Scores every enabled instrument against its stored bars to flag mean-reversion accumulation candidates, reporting the 30-day range, the position inside it, and a confluence score with the reasons behind it — facts only, never a recommendation.

## Requirements

### Requirement: Screening runs on load against stored data only

The screener SHALL score every enabled instrument when the app loads, without the user asking
for it, and SHALL do so entirely from locally stored bars. Screening SHALL NOT trigger any
market-data fetch, so it changes nothing about how fresh the data is: scores are exactly as
stale as the last sync the user asked for. Screening SHALL report progress while it runs, and
the sidebar SHALL remain usable — searchable, filterable and clickable — throughout.

A scan SHALL NOT be re-run merely because the user filtered the list, selected an instrument,
switched timeframe, or toggled an indicator.

#### Scenario: Scores appear without a fetch

- **WHEN** the app loads and screens the catalog
- **THEN** the only market-data request made is for the screening payload itself, no sync runs, and no instrument's stored bars change

#### Scenario: The list works while the scan runs

- **WHEN** the user types a search query while screening is still in progress
- **THEN** the list filters immediately and the scan continues, filling in marks as they are computed

#### Scenario: Progress is visible

- **WHEN** screening is running over the catalog
- **THEN** the UI reports its progress, and the report ends when the last instrument is scored

### Requirement: Screening payload

A screening payload SHALL be served by the dev backend and written by the exporter as one
file with identical content, so screening behaves the same with a backend and on the static
site. It SHALL carry, for each **enabled** instrument, the most recent bars of H1 and D1
up to a fixed per-timeframe cap, with each bar's timestamp, open, high, low and close.

The payload SHALL carry exactly the timeframes the screening conventions and rules read — no
timeframe the system does not support, and none that nothing reads.

The cap SHALL be 420 bars per timeframe — enough for every signal's warm-up with room for a
zone detected before the warm-up boundary to still be live at the newest bar — and a series
holding fewer bars SHALL be served in full rather than padded.

The payload SHALL be retrievable in a single request for the whole catalog, because screening
44 instruments across 2 timeframes through the per-symbol chart files would cost dozens of
requests and several megabytes. Volume SHALL be omitted, since no screening signal uses
it. Disabled instruments SHALL be absent from the payload.

#### Scenario: One request covers the catalog

- **WHEN** the app screens the catalog
- **THEN** it retrieves the bars for every enabled instrument and both timeframes in a single request

#### Scenario: The payload carries no retired timeframe

- **WHEN** the payload is built from a store that still holds M15 bars
- **THEN** no instrument's entry carries an M15 series, and the entry carries H1 and D1 only

#### Scenario: Bars are capped

- **WHEN** an instrument's stored D1 series holds 4,000 bars
- **THEN** the payload carries its 420 most recent D1 bars and none older

#### Scenario: A short series is served whole

- **WHEN** an instrument's stored H1 series holds 90 bars
- **THEN** the payload carries all 90 of them

#### Scenario: Disabled instruments are excluded

- **WHEN** an instrument is disabled in the catalog
- **THEN** it is absent from the payload

#### Scenario: The static site screens identically

- **WHEN** the same data store is served by the dev backend and exported to the static site
- **THEN** both produce the same payload content and therefore the same scores

### Requirement: Thirty-day window figures

For every instrument it screens, the screener SHALL report three figures derived from one 30-day D1
window and the shared current-price convention, so the three can never disagree about the window or
the price they describe:

- the **range**, measured as `(highest high − lowest low) / lowest low`;
- the **position** of the current price inside it, measured as
  `(price − lowest low) / (highest high − lowest low)`;
- the **headroom** to the window's high, measured as `(highest high − current price) / current price`.

These figures SHALL be reported for context only. None of them SHALL decide whether an instrument is
scored, and none of them SHALL contribute points or appear among the recorded reasons. The window's
highest high SHALL, however, be readable by the distance component as its fallback target, so the same
window serves both the figures and that component.

The headroom SHALL be reported as it computes and SHALL NOT be clamped, floored or withheld because
of its sign: where the current price is at or above the window's highest high — which the
current-price convention permits, since the price may come from a finer timeframe than the window is
measured on — the figure is zero or negative, and that is the honest reading.

The three figures SHALL be reported together and SHALL be absent together: an instrument whose window
yields no usable range has no position and no headroom figure either, rather than figures derived from
a partial window.

#### Scenario: A quiet instrument still reports its figures

- **WHEN** an instrument's 30-day range is 1.5% and price sits at the bottom of it
- **THEN** its range, position and headroom figures are reported, and the figures themselves neither
  qualify nor disqualify it from being scored

#### Scenario: Figures do not decide whether an instrument is scored

- **WHEN** one instrument's price sits 1% below its 30-day highest high and another's sits 40% below
- **THEN** both are scored against the screening triggers, because no figure gates scoring

#### Scenario: Headroom from the range and the position

- **WHEN** an instrument's 30-day window has a lowest low of 100 and a highest high of 140, so its
  range is 40%, and the current price is 136, so its position is 90% of the range
- **THEN** its headroom is 2.9%, being `(140 − 136) / 136`, and its range and position figures are
  still 40% and 90%

#### Scenario: Headroom at the bottom of the range

- **WHEN** the current price is exactly the window's lowest low and the range is 40%
- **THEN** the headroom equals the range, 40%, because the whole range still lies above the price

#### Scenario: Headroom is not clamped at the top

- **WHEN** the current price, taken from the most recent bar across the screened timeframes, is
  above the 30-day window's highest high
- **THEN** the headroom is reported as the negative figure it computes to, rather than as zero,
  as absent, or as an error

#### Scenario: No window, no figures

- **WHEN** an instrument's 30-day window yields no usable range
- **THEN** no range, no position and no headroom figure is reported for it

### Requirement: Screening reads shared bar conventions and the current-day touch exception

Every screening rule SHALL read bars through one shared set of conventions, defined once, so two rules
can never disagree about what "the last bar" or "the current price" means:

- **Forming bar.** The newest stored bar of any timeframe is treated as still forming. The last
  completed bar is the one before it, and every rule about completed bars SHALL start there.
- **Current price.** The close of the most recent bar across the screened timeframes, chosen by
  timestamp, so a timeframe that failed to sync cannot supply a stale price. H1 therefore remains
  part of the screening payload even though no scoring rule reads its bars directly: it is the finest
  supported timeframe, so it is where an intraday price comes from, and removing it would change what
  the current price means. The convention SHALL be defined over whichever timeframes the payload
  carries rather than over a fixed count of them, so retiring or adding a screened timeframe changes
  which bars are considered without changing the rule.
- **Live zone.** A detected zone is live when it still extends to the newest stored bar, judged by the
  liveness notion the producing indicator already carries — a fair-value-gap zone expires a fixed
  number of bars after its first bar, and an order-block zone carries a flag stating that it extends
  to the newest bar. No separate liveness rule SHALL be invented for screening.
- **Current-day touch — a named, deliberate exception to the forming-bar convention.** The touch test
  reads the **current day's D1 bar**, which is the newest stored D1 bar and the very bar the
  forming-bar convention otherwise excludes. This is intentional: the question the triggers ask is
  whether price is interacting with a zone *right now*. Zone *detection* still excludes the newest
  bar, so the model is "zones from completed history, touch from today". The consequence SHALL be
  stated rather than hidden: a score can change during the day as the current bar develops.
- **Touch geometry.** A touch is plain geometric overlap, inclusive at both ends, between the current
  day's bar high-to-low interval and the zone's price interval. It is deliberately looser than a
  containment test on a single price: a wick that entered the zone and left again still counts.
- **30-day window.** The D1 bars whose timestamps fall within 30 calendar days of the newest D1 bar,
  read by bar high and bar low rather than by close.

Every numeric threshold in these conventions and in the scoring rules SHALL be a named constant, so
weights and boundaries can be tuned without editing logic.

#### Scenario: The forming bar is excluded

- **WHEN** a rule evaluates the last completed bars of a timeframe
- **THEN** it reads bars ending one bar before the newest stored bar

#### Scenario: Current price ignores a stale timeframe

- **WHEN** one screened timeframe's newest bar is days older than another's
- **THEN** the current price comes from the timeframe holding the most recent bar

#### Scenario: The intraday price comes from the finest supported timeframe

- **WHEN** an instrument's newest H1 bar is more recent than its newest D1 bar
- **THEN** the current price is that H1 bar's close, and no finer timeframe is consulted

#### Scenario: The touch test reads today's bar

- **WHEN** a live zone is tested for a touch
- **THEN** the bar compared against it is the newest stored D1 bar, notwithstanding the forming-bar
  convention, and that exception is stated where the conventions are defined

#### Scenario: Zone detection still excludes today's bar

- **WHEN** the newest stored D1 bar would complete a zone-forming pattern
- **THEN** no zone is detected from it, so every zone the triggers test against comes from completed
  history

#### Scenario: A wick that left the zone still counts

- **WHEN** the current day's bar reached into a live zone and closed back outside it
- **THEN** the touch test passes, because the bar's high-to-low interval overlaps the zone's price
  interval

#### Scenario: A touch at the zone's edge counts

- **WHEN** the current day's bar low is exactly the zone's high
- **THEN** the touch test passes, the overlap being inclusive at both ends

#### Scenario: The score can move during the day

- **WHEN** the current day's bar extends far enough to overlap a live zone it did not overlap earlier
- **THEN** the instrument's score changes on the next scan, which is the accepted consequence of
  reading today's bar

### Requirement: Screening triggers and score

An instrument's score SHALL be the sum of three D1 triggers and one conditional distance component,
to a maximum of **6**. No instrument is gated out before scoring: every instrument the screener can
read is scored, and a score of 0 is a legitimate result.

The triggers, each worth **+1** and all read on D1:

- **`FVG D1`** — the current day's bar overlaps a live **bullish** D1 fair-value-gap zone.
- **`OB D1`** — the current day's bar overlaps a live **demand** D1 order-block zone.
- **`MACD`** — the D1 histogram has turned up from a negative trough within the last **2** completed
  bars. The trough may sit on the last completed bar or on the one before it. Within either position
  the shape test is unchanged in strictness: the trough value SHALL be strictly below both of its
  neighbours, and all three values of the shape SHALL be strictly below zero, so a flat pair fails and
  a value of exactly zero is not a negative bar.

Only bullish fair-value-gap zones and demand order-block zones SHALL participate. Bearish gaps and
supply order blocks SHALL be ignored entirely by scoring: they are not negative points, they simply
take no part.

Each indicator SHALL contribute **at most +1**, however many of its zones the day's bar overlaps: the
triggers are per-indicator binary, not per-zone.

A zone SHALL be eligible only while it is live at the newest stored bar, per the shared live-zone
convention.

The **distance component** SHALL be worth 0 to 3 points and SHALL be evaluated **only if at least one
trigger fired**. Where no trigger fired the score SHALL be 0 regardless of how distant the target is.

- **Target selection.** The target SHALL be the **last confirmed D1 high pivot's high** when that
  pivot's bar time falls inside the same 30-day window the reported figures are measured over; and
  **otherwise** the window's highest high. Only confirmed pivots count; a pending one is ignored.
  The two branches are exhaustive: the last confirmed high pivot is the newest one, so if it lies
  outside the window then no confirmed high pivot lies inside it, and there is no case that searches
  further back.
- **Distance.** `d = (target − current price) / current price`.
- **Bands.** `d` above 3% earns 1 point, above 5% earns 2, and above 8% earns 3. A distance at or
  below 3% earns nothing. The component is capped at 3 points.

Alongside the score, the screener SHALL record which components fired and how many points each
contributed, so any mark can be audited without re-deriving it. The distance component's recorded
audit wording SHALL name **which branch supplied its target** — the D1 pivot high or the 30-day
window high — because the pivot high is a number the row does not display, while the window high is
what the displayed headroom figure measures to. Without that wording a reader cannot reconcile a
distance score against the printed headroom.

These triggers SHALL be computed by the same fair-value-gap, MACD and swing-structure logic the chart
indicators use, so a mark can always be reproduced by opening the chart.

#### Scenario: Full confluence

- **WHEN** the current day's bar overlaps a live bullish D1 gap and a live demand D1 order block, the
  D1 histogram has turned up from a negative trough within the last 2 completed bars, and the target
  is 12% above price
- **THEN** the score is 6 and the recorded reasons list all four components with 1, 1, 1 and 3 points

#### Scenario: One trigger with a near target

- **WHEN** only the `OB D1` trigger fires and the target is 2% above price
- **THEN** the score is 1, because the distance falls in no band

#### Scenario: No trigger means no distance points

- **WHEN** no trigger fires and the target is 20% above price
- **THEN** the score is 0 and no distance component is recorded

#### Scenario: A zero score is a normal result

- **WHEN** an instrument is screened, has ample history, and no trigger fires
- **THEN** its score is 0, it carries no mark, names no source, and its range, position and headroom
  figures are still reported

#### Scenario: Several zones of one indicator still count once

- **WHEN** the current day's bar overlaps three live bullish D1 gaps at once
- **THEN** the `FVG D1` trigger contributes 1 point, not 3

#### Scenario: A bearish gap is ignored

- **WHEN** the current day's bar overlaps a live bearish D1 fair-value-gap zone and no bullish one
- **THEN** the `FVG D1` trigger contributes nothing, and no point is deducted

#### Scenario: A supply order block is ignored

- **WHEN** the current day's bar overlaps a live supply D1 order-block zone and no demand one
- **THEN** the `OB D1` trigger contributes nothing, and no point is deducted

#### Scenario: An expired gap zone is not eligible

- **WHEN** the current day's bar sits inside the price interval of a bullish D1 gap whose validity
  window ended before the newest stored bar
- **THEN** the `FVG D1` trigger contributes nothing, because the zone is no longer live

#### Scenario: A closed order block is not eligible

- **WHEN** the current day's bar sits inside the price interval of a demand D1 order block whose
  validity ended at an earlier structural break
- **THEN** the `OB D1` trigger contributes nothing, because the zone is no longer open to the newest
  bar

#### Scenario: A trough on the last completed bar counts

- **WHEN** the last three completed D1 histogram values are −0.42, −0.61 and −0.35, so the trough sits
  on the last completed bar's predecessor and the newest completed value is above it
- **THEN** the `MACD` trigger contributes 1 point

#### Scenario: A trough one bar further back still counts

- **WHEN** the trough shape completes one bar earlier, so the turn is visible within the last 2
  completed bars rather than only on the newest completed one
- **THEN** the `MACD` trigger contributes 1 point, because the window admits either position

#### Scenario: A trough three bars back does not count

- **WHEN** the only qualifying trough shape sits further back than the last 2 completed bars
- **THEN** the `MACD` trigger contributes nothing, because the turn is outside the window

#### Scenario: A flat pair fails

- **WHEN** two values of a candidate trough shape are equal and all three are below zero
- **THEN** the `MACD` trigger contributes nothing, because both comparisons must be strict

#### Scenario: Zero is not a negative bar

- **WHEN** a candidate trough shape's values are −0.10, −0.30 and exactly 0
- **THEN** the `MACD` trigger contributes nothing, because a value of zero is not below zero

#### Scenario: A still-falling histogram does not count

- **WHEN** the histogram values across the window are monotonically falling
- **THEN** the `MACD` trigger contributes nothing, because no value is a trough below both neighbours

#### Scenario: Distance band boundaries

- **WHEN** one instrument's distance is exactly 3%, another's exactly 5% and another's exactly 8%,
  each with at least one trigger fired
- **THEN** they earn 0, 1 and 2 points respectively, each boundary belonging to the lower band

#### Scenario: The distance is capped at three points

- **WHEN** a triggered instrument's distance is 40%
- **THEN** the distance component contributes 3 points, not more

#### Scenario: A pivot inside the window is the target

- **WHEN** the last confirmed D1 high pivot's bar time falls inside the 30-day window
- **THEN** that pivot's high is the distance target, and the recorded audit wording names the pivot
  branch

#### Scenario: A pivot outside the window falls back to the window high

- **WHEN** the last confirmed D1 high pivot's bar time falls before the start of the 30-day window
- **THEN** the window's highest high is the distance target, and the recorded audit wording names the
  30-day-high branch

#### Scenario: No confirmed pivot at all falls back to the window high

- **WHEN** the series holds no confirmed D1 high pivot, only a pending one
- **THEN** the pending pivot is ignored and the window's highest high is the distance target

#### Scenario: The audit reconciles against the printed headroom

- **WHEN** a reader compares a distance score against the row's displayed headroom figure
- **THEN** the audit wording tells them which target the score used, so a pivot-branch score is not
  mistaken for a disagreement with the headroom

#### Scenario: A mark is auditable

- **WHEN** an instrument is marked
- **THEN** the components that fired and their points are available to the user without opening the
  chart

### Requirement: Marks are graded, and absent when nothing fired

A score SHALL be presented as a count of identical marks: one mark for 1 point, two for 2 to 3, three
for 4 to 5, and four for 6. All marks SHALL be the same size and colour, so the count is the only
thing that carries meaning. Because the maximum is 6, four marks SHALL mean every component fired.

An instrument that scores zero SHALL carry no mark. There SHALL be no guarantee that a screened
instrument carries at least one mark: with no automatic point available, a score of zero and therefore
a blank mark area is the normal, correct outcome for most instruments on a typical day, and it SHALL
NOT be read as "gated out" or "could not be screened".

The screener SHALL NOT present a target, an entry, a stop, a position size, or any ranking beyond the
mark count and the score it stands for.

#### Scenario: Bucket boundaries

- **WHEN** four instruments score 1, 3, 5 and 6
- **THEN** they carry one, two, three and four marks respectively

#### Scenario: Four marks mean everything fired

- **WHEN** an instrument carries four marks
- **THEN** its score is 6, so all three triggers fired and the distance component earned its full 3
  points

#### Scenario: A screened instrument may carry no mark

- **WHEN** an instrument is screened and no component fires
- **THEN** it carries no mark, and that is reported as a score of zero rather than as an absent or
  failed computation

#### Scenario: Nothing recommended

- **WHEN** an instrument carries four marks
- **THEN** the UI reports its score, its reasons, its range and its position, and offers no entry,
  target or size

### Requirement: Sources are named beneath the marks for every component that fired

A screened instrument SHALL name the short source label for every component the screener recorded as
fired, on a line beneath its graded marks, in the order the components were recorded. Two instruments
on the same score SHALL be distinguishable by which sources they name even when their mark count
matches.

Each recorded reason SHALL carry a short `source` name alongside the rule wording and the points
already recorded for it. The names SHALL be distinct from one another and stable across scans. A name
SHALL NOT restate the points it earned; the points remain part of the on-demand audit on the marks.

The source names SHALL be: `FVG D1` for the bullish D1 gap trigger, `OB D1` for the demand D1
order-block trigger, `MACD` for the histogram-turn trigger, and `distance` for the distance component.

The distance component SHALL carry that **single stable label whichever branch supplied its target**.
Only the on-demand audit wording distinguishes the pivot-high branch from the 30-day-high branch; the
label beneath the marks SHALL NOT change between scans because the branch changed.

The source names SHALL be presented uniformly: no name SHALL be sized, coloured or ordered to suggest
it weighs more than another. An instrument that cannot be screened, or that scores zero, SHALL name no
source and carry no mark.

A result carried over from before the scoring model changed SHALL NOT be shown under the old model's
sources or score; such a result SHALL be recomputed before it is displayed, without requiring the user
to sync.

#### Scenario: Fired components are named

- **WHEN** an instrument's `OB D1` trigger and `MACD` trigger fire and its distance earns 2 points
- **THEN** its source line names `OB D1`, `MACD` and `distance`, in the order the reasons were
  recorded

#### Scenario: The distance label is the same on either branch

- **WHEN** one instrument's distance target came from a confirmed D1 pivot high and another's from the
  30-day window high
- **THEN** both rows name `distance`, and neither label reveals the branch

#### Scenario: The audit distinguishes the branches

- **WHEN** the user audits the marks on each of those two rows
- **THEN** one audit names the D1 pivot distance and the other names the 30-day high distance, while
  the points each contributed are unchanged

#### Scenario: Full confluence names every source

- **WHEN** all three triggers fire and the distance component earns points
- **THEN** the instrument carries four marks and names four sources — `FVG D1`, `OB D1`, `MACD` and
  `distance` — in the order the reasons were recorded

#### Scenario: Equal scores, different sources

- **WHEN** one instrument scores 3 from the `FVG D1` trigger and a distance worth 2 points, and
  another scores 3 from all three triggers with a near target
- **THEN** both carry two marks, their source lines name different sources, and neither row can be
  mistaken for the other

#### Scenario: A zero score names nothing

- **WHEN** an instrument is screened and no component fires
- **THEN** it carries no mark, names no source, and its range, position and headroom figures are still
  shown

#### Scenario: Points stay in the audit

- **WHEN** the user reads a row that names `distance`
- **THEN** the source line does not state how many points the distance contributed, and that number is
  still reachable through the on-demand audit on the marks

### Requirement: Instruments that cannot be screened say so

An instrument the screener cannot score for a structural reason SHALL be distinguished from one
that was scored and produced no signal:

- an instrument absent from the payload because it is disabled SHALL be reported as **not
  screened**;
- an instrument whose stored history is too short for the signals' warm-up SHALL be reported as
  **insufficient history**.

Neither SHALL be shown as an unmarked, screened instrument, and neither SHALL prevent the rest
of the catalog from being scored.

Because no component of the score is automatic, an instrument that was scored and earned nothing is
now the common case. Such an instrument SHALL be reported as **screened with a score of zero** and
SHALL remain distinguishable from both states above: a blank mark area SHALL NOT be presented as, or
be mistakable for, "not screened" or "insufficient history".

#### Scenario: Disabled instrument

- **WHEN** a disabled instrument is listed in the sidebar
- **THEN** it is reported as not screened rather than as scored with no signal

#### Scenario: Too little history

- **WHEN** an instrument holds fewer stored D1 bars than the signals' warm-up needs
- **THEN** it is reported as having insufficient history, and the remaining instruments are still scored

#### Scenario: One bad instrument does not stop the scan

- **WHEN** one instrument's bars cannot be screened
- **THEN** every other instrument is still scored and marked

#### Scenario: A zero score is not an unscreenable state

- **WHEN** one instrument is disabled, one has too little history, and one is fully screened but scores
  zero
- **THEN** all three are reported differently, and the third is identifiable as screened-and-quiet
  rather than as either failure

### Requirement: Scores are cached against sync freshness

Computed scores SHALL be cached locally in the browser and reused on the next load when every
instrument's last sync time is unchanged from when the cache was written. When nothing has
synced since the previous visit, the screening payload SHALL NOT be requested at all.

A cache SHALL be invalidated when any instrument's last sync time differs from the cached one,
and the cache SHALL be local to the browser: it SHALL NOT travel with the exported data and
SHALL NOT be shared between browsers. Where the browser denies persistent storage, screening
SHALL still work, simply recomputing on every load.

A cached result SHALL NOT be displayed when it predates a change to what a result reports: a
result written before the headroom figure existed SHALL be recomputed before it is shown, rather
than rendered with that figure missing, and this SHALL NOT require the user to sync.

A cached result SHALL likewise NOT be displayed when it predates a change to **how a result is
computed**. A result written under a superseded scoring model SHALL be recomputed before it is shown,
rather than rendered as a score, a mark count or a set of sources the current model would never
produce, and this SHALL NOT require the user to sync.

A change to **which timeframes a result was computed from** SHALL count as a change to how a result is
computed, whether or not any trigger, weight or band changed. A result written while a retired
timeframe could supply the current price SHALL be recomputed before it is shown, because the price
underneath its figures and its distance component may differ from what the current set of screened
timeframes yields, and this SHALL NOT require the user to sync.

#### Scenario: Nothing synced since last visit

- **WHEN** the user reloads the page and no instrument has synced since the previous load
- **THEN** the marks render from the cache and the screening payload is not requested

#### Scenario: A sync invalidates the cache

- **WHEN** one instrument has synced since the cache was written
- **THEN** the payload is fetched and the catalog is re-screened

#### Scenario: Storage unavailable

- **WHEN** the browser blocks persistent storage
- **THEN** screening runs normally on every load, with no error state

#### Scenario: A cache written before the headroom figure is not reused

- **WHEN** the user opens the list with a cache written before results reported headroom, and no
  instrument has synced since
- **THEN** the catalog is re-screened and every screened row shows a headroom figure, with no row
  showing range and position alone

#### Scenario: A cache written under the previous scoring model is not reused

- **WHEN** the user opens the list with a cache written under the superseded scoring model, and no
  instrument has synced since
- **THEN** the catalog is re-screened under the current model, and no row shows a score, a mark count
  or a source the current model cannot produce

#### Scenario: A cache written while M15 was screened is not reused

- **WHEN** the user opens the list with a cache written while M15 was one of the screened timeframes,
  and no instrument has synced since
- **THEN** the payload is fetched, the catalog is re-screened over the current timeframes, and no row
  shows a figure or a distance score derived from an M15 price
