# indicators Specification

## Purpose

Defines the client-side indicator framework — a registry of indicators the user can enable and disable individually — and its first implementation, a working Fair Value Gap (FVG) scanner with signal parity to the external source indicator the scanner is ported from.

## Requirements

### Requirement: Pluggable indicator registry

Indicators SHALL be registered in a client-side registry. Each registration declares an identifier, a display label, the minimum number of bars it needs, and how its output is rendered on the chart. The UI SHALL derive its indicator controls from the registry, so adding a new indicator requires only registering it — no changes to the chart UI or any server component.

Rendering SHALL be declared by one of exactly two output kinds, and an indicator SHALL use one of them, not both:

- **Zone output** — shapes positioned by price and time, drawn over the candles on the price pane. This is what the FVG and OB indicators produce.
- **Pane output** — one value per bar on a scale unrelated to price, drawn in the indicator's own pane below the price pane. This is what the MACD indicator produces.

Everything the registry provides around rendering — the toolbar toggle, the persisted enabled state, and the insufficient-history warning — SHALL behave identically for both kinds, so which kind an indicator uses is invisible to the user except in where its output appears.

#### Scenario: New indicator appears automatically

- **WHEN** a developer registers a second indicator in the registry
- **THEN** the UI shows a toggle for it alongside existing indicators without further UI changes

#### Scenario: Either output kind is registered the same way

- **WHEN** a developer registers a pane-output indicator
- **THEN** it gains a toolbar toggle, persisted enabled state and insufficient-history warning exactly as a zone-output indicator does, with no chart UI change beyond the registration

### Requirement: Per-indicator enable and disable

Each registered indicator SHALL be individually toggleable. Toggling SHALL take effect immediately on the current chart, and enabled state SHALL persist across symbol and timeframe switches and across page reloads on the same browser. Multiple indicators MAY be enabled at once.

#### Scenario: Toggling an indicator

- **WHEN** the user enables an indicator and then switches to another symbol
- **THEN** the indicator remains enabled and recomputes for the newly selected symbol's bars

#### Scenario: Enabled state survives a reload

- **WHEN** the user enables an indicator and reloads the page
- **THEN** the indicator is still enabled and computes for the restored selection

### Requirement: Indicators compute client-side from stored bars

Indicator values SHALL be computed in the browser from the bars already loaded for the chart. Enabling, disabling, or recomputing an indicator SHALL NOT trigger any market-data fetch or require a server-side computation endpoint, so indicators behave identically in dev mode and on the static site.

#### Scenario: Indicator on the static site

- **WHEN** the user enables an indicator on the published static site
- **THEN** it computes and renders from the already-loaded bars with no additional network requests beyond the data files

### Requirement: Indicators scan the full loaded history

An enabled indicator SHALL compute over the entire series the chart is displaying — everything the display limit admits, excluding only regions its own warm-up leaves undefined — rather than a recent-bars window inside it, and ALL of its detected outputs SHALL be rendered on the chart simultaneously. A signal SHALL never disappear merely because newer bars arrived or a newer signal was detected.

#### Scenario: Old and new signals visible together

- **WHEN** an indicator detects signals both near the newest bars and hundreds of bars earlier in the displayed series
- **THEN** all of them are drawn on the chart at once, each at its own location

#### Scenario: New bars do not evict old signals

- **WHEN** a sync appends new bars and the indicator recomputes
- **THEN** signals in the displayed portion of the series remain visible; a signal leaves the chart only when its bars fall outside the display limit

#### Scenario: Raising the display limit deepens the scan

- **WHEN** the user raises the display limit so that older stored bars enter the view
- **THEN** the indicator recomputes over the wider series and signals in the newly admitted region appear

### Requirement: Insufficient-history warning

When an enabled indicator cannot compute because the displayed series holds too few bars, the UI SHALL show a warning stating how many bars are needed versus available, because a chart with no indicator output is otherwise indistinguishable from a chart with no qualifying signals. A display limit set below an indicator's warm-up SHALL produce this warning rather than silent emptiness, even when far more bars are stored.

#### Scenario: Too few bars

- **WHEN** an indicator needing 380 bars is enabled on a displayed series of 250 bars
- **THEN** the chart shows a warning naming the required and available counts instead of silently rendering nothing

#### Scenario: Display limit below the warm-up

- **WHEN** the user sets a display limit of 100 bars with an indicator needing 380 enabled
- **THEN** the warning names 380 required against 100 available, and raising the limit clears it

### Requirement: Close-to-open-space

The indicators SHALL recognise a **close-to-open-space** between two adjacent bars: the price interval between the earlier bar's close and the later bar's open, belonging to the later bar. A space SHALL exist only when both conditions hold:

- **Same type**: the two bars are both bullish (close above open) or both bearish (close below open). A bar whose close equals its open is neutral and SHALL take the other bar's type; two neutral bars SHALL produce no space.
- **Opening beyond**: the later bar opens beyond the earlier bar's close in that type's direction — above it for a bullish pair, below it for a bearish pair.

Because the later bar's open is one endpoint of the space, a bullish bar's space SHALL sit flush beneath its body and a bearish bar's flush above it. The **space-extended body** of a bar carrying a space SHALL therefore equal the distance from the previous bar's close to its own close; a bar with no space SHALL keep its recorded body. Likewise a carrying bar's **space-extended range** SHALL cover both its recorded range and its space. The first bar of a series has no predecessor and SHALL never carry a space.

The space is a property of the bar series, not of any pattern: it SHALL be determined the same way on every adjacent pair, with no exception for session or weekend boundaries.

#### Scenario: Space beneath a bullish bar

- **WHEN** two consecutive bullish bars are evaluated and the second opens above the first's close
- **THEN** the second bar carries a space running from the first bar's close up to its own open, and its space-extended body runs from the first bar's close to its own close

#### Scenario: Opposite types produce no space

- **WHEN** a bullish bar is followed by a bearish bar that opens away from its close
- **THEN** no space is recorded, and the second bar's body and range are its recorded ones

#### Scenario: Overlapping bodies produce no space

- **WHEN** two consecutive bullish bars are evaluated and the second opens below the first's close
- **THEN** no space is recorded, because the second bar did not open beyond the first's close in the pair's direction

#### Scenario: Neutral bar takes its neighbour's type

- **WHEN** a bar whose close equals its open is followed by a bullish bar opening above it
- **THEN** the pair is treated as bullish and the space is recorded

### Requirement: Shared directional zone palette

Zone-drawing indicators SHALL colour their output from one shared directional palette rather than per-indicator colours, so that a bullish/demand zone reads the same whichever indicator produced it and a bearish/supply zone likewise. The palette SHALL define exactly two colours — one for the bullish/demand direction, one for the bearish/supply direction — and SHALL be the Order Block indicator's original pair (a light green for demand, a light pink for supply), so the colour an OB demand zone is drawn in is unchanged by the unification and FVG adopts those colours.

The palette SHALL keep both entries even though neither indicator now draws in the bearish/supply direction: the entry is the definition of that direction's colour, it is read by anything that describes a detected zone by direction, and removing it would leave a future bearish-drawing indicator to reinvent a colour that already has an agreed value.

Because colour no longer distinguishes one indicator from another, each zone-drawing indicator SHALL be distinguishable by the way its rectangle is painted, and every zone SHALL keep a text label naming its indicator.

#### Scenario: Both indicators enabled use one palette

- **WHEN** the user enables both the FVG and OB indicators on the same chart
- **THEN** every bullish FVG zone and every demand OB zone are drawn in the same colour, no rectangle in the supply colour is drawn by either indicator, and the two indicators remain distinguishable by how their rectangles are painted and by their labels

#### Scenario: OB colours unchanged by the unification

- **WHEN** an OB demand zone is rendered after the palette is shared
- **THEN** it uses the same colour it used before, since the shared palette adopts OB's original pair

#### Scenario: Supply entry survives for FVG

- **WHEN** the FVG indicator detects a bearish zone that it does not draw
- **THEN** the palette's supply entry remains defined, so the zone's direction still has an agreed colour even though no indicator paints one

### Requirement: FVG indicator

The first registered indicator SHALL be a Fair Value Gap scanner over three consecutive closed bars (bar1, bar2, bar3 in chronological order, bar3 newest), reproducing the rules of the external source indicator it is ported from, with that source's default parameters, all of which SHALL be defined in one place. Three deliberate deviations: the source's recent-bars scan cap (`bar_limit`, 120) is dropped — the scan SHALL cover every displayed bar from the slow EMA warm-up boundary through the second-newest displayed bar, and all detected zones SHALL be drawn at once; the rules that measure a bar's displacement SHALL read space-extended values, as noted below; and bearish zones SHALL be detected but never drawn, as stated below. The pattern rules:

- an EMA 13/89/377 regime ladder evaluated at bar3 decides which pattern directions are searched;
- the middle bar's space-extended body SHALL be at least as large as bar1's and bar3's space-extended bodies, so that a bar which opened away from its predecessor's close is credited with the whole move it made rather than its drawn body alone;
- swing structure: strictly stair-stepping highs and lows in the pattern direction (relaxable by parameter);
- the price gap (bullish: bar3 low above bar1 high; bearish: bar1 low above bar3 high) SHALL exceed a configured ratio of bar2's space-extended range;
- bar3's wick opposite the pattern direction SHALL NOT exceed a configured multiple of bar3's space-extended body;
- a stochastic filter (%K 21, slowing 9) SHALL reject bullish patterns in overbought and bearish patterns in oversold territory;
- the zone height in instrument points SHALL fall within configured floor and ceiling values, using the catalog's point size.

**Only bullish zones SHALL be rendered.** Bearish zones SHALL continue to be detected — they are the other half of the parity comparison against the source indicator, and their detection has no bearing on bullish output — but a bearish zone SHALL produce neither a rectangle nor a label on the chart. This mirrors the treatment the OB indicator already gives its supply zones, and SHALL be recorded alongside the FVG parameters as a rendering deviation only. Every statement below about rendering therefore concerns bullish zones alone.

The gap and the zone SHALL be measured from recorded prices alone: spaces SHALL NOT move either edge of a zone. Detected bullish zones SHALL render as rectangles spanning from bar1's time forward a configured number of bars, drawn behind the candles, with a label at bar3. Both the rectangle and the label SHALL take the bullish/demand colour from the shared directional zone palette. The rectangle SHALL be painted as an unfilled outline — a stroked border at full colour strength with no interior fill — which is what distinguishes an FVG zone from an Order Block zone now that the two share a palette.

#### Scenario: Bullish FVG detected

- **WHEN** three bars form a bullish stair-step with a qualifying gap between bar1's high and bar3's low, the EMA regime allows bullish patterns, and no filter rejects it
- **THEN** a bullish zone spanning that gap is drawn from bar1's time with an FVG label at bar3

#### Scenario: Bearish FVG is detected but not drawn

- **WHEN** three bars form a bearish pattern that passes every filter
- **THEN** the zone appears in the indicator's detected zones with its direction, prices and validity window, and nothing for it is drawn on the chart — no rectangle and no label

#### Scenario: Chart carries no bearish FVG rectangles at all

- **WHEN** the user enables FVG on a series holding both bullish and bearish qualifying patterns
- **THEN** every FVG rectangle and label on the chart belongs to a bullish zone in the palette's demand colour, and FVG draws nothing in the supply colour

#### Scenario: Filter rejection

- **WHEN** a pattern matches structurally but the stochastic is overbought for a bullish candidate
- **THEN** no zone is emitted for that candidate

#### Scenario: Zone deep in history is still drawn

- **WHEN** a qualifying pattern sits 700 bars back in a 1,000-bar series, well outside the source indicator's 120-bar cap
- **THEN** its zone is detected and drawn alongside any newer zones

#### Scenario: Middle bar dominates only once its space is counted

- **WHEN** bar2's drawn body is smaller than bar3's, but bar2 carries a space that makes its space-extended body the largest of the three
- **THEN** the dominance test passes and the triplet is evaluated against the remaining rules

#### Scenario: Space does not move the zone

- **WHEN** bar3 carries a space and the triplet qualifies as a bullish FVG
- **THEN** the zone still runs from bar1's high to bar3's recorded low, unchanged by that space

#### Scenario: FVG zone takes the shared palette colour

- **WHEN** a bullish FVG zone is drawn
- **THEN** its rectangle and label use the palette's demand colour rather than a separate FVG-only colour, and no FVG output takes the supply colour

#### Scenario: FVG rectangle stays an outline

- **WHEN** an FVG zone is rendered
- **THEN** its rectangle shows a stroked border with no interior fill, so candles inside the zone remain fully visible

### Requirement: FVG signal parity with the source indicator

The FVG computation SHALL preserve the numeric conventions the source indicator depends on, because deviations change signals: the EMA SHALL be seeded with the SMA of the first period's values (not a first-value seed — with EMA 377 the difference persists long enough to alter signals); the stochastic SHALL use the source's low/high stochastic mode — rolling low/high extremes with SMA slowing; the newest stored bar SHALL stand in for the source's forming bar — the still-open newest bar of a live chart — and be excluded from pattern matching; and no signal SHALL be emitted at all until the slow EMA has enough data.

Three deviations from the source are sanctioned, and no others: the dropped recent-bars scan cap, space-extended displacement measurement, and bearish zones being detected but never drawn. The second changes which triplets qualify in both directions — it admits patterns the source rejects and rejects patterns the source admits — so parity against the source SHALL be verified on the numeric conventions above rather than on the resulting zone set, and the fixtures SHALL keep a raw-bar set that exercises those conventions independently of the space rules.

The third is a **rendering deviation alone** and SHALL NOT change which zones are detected. Parity comparisons and fixtures SHALL therefore continue to read **detected** zones in both directions rather than what is drawn, so hiding the bearish side cannot weaken or alter a parity claim, and the existing fixtures SHALL keep passing unchanged.

#### Scenario: EMA seeding

- **WHEN** the EMA 377 is computed over a bar series
- **THEN** its first defined value at index 376 equals the arithmetic mean of the first 377 closes, and values before that index are undefined

#### Scenario: Forming bar excluded

- **WHEN** the newest stored bar would complete a pattern as bar3
- **THEN** no zone is emitted for it; the newest bar never acts as bar3

#### Scenario: Numeric conventions still verified against the reference

- **WHEN** the fixtures are regenerated from the reference implementation
- **THEN** the EMA arrays, the stochastic array, and the warm-up warning still match it exactly, even though the zone sets diverge where spaces apply

#### Scenario: Bearish zones are still compared

- **WHEN** the fixtures and any parity comparison run against a series containing both bullish and bearish qualifying patterns
- **THEN** the bearish zones are compared as detected zones and must match, even though none of them is drawn

### Requirement: FVG works on every timeframe after a full sync

With per-timeframe fetch depth in place, a fully synced symbol SHALL hold enough history on every timeframe for the FVG indicator to scan (its warm-up plus a scannable region beyond it), so that at the default display limit the indicator produces zones or a genuine no-signals result — never a warm-up warning. Two exceptions stand: source scarcity the system cannot fix, where an instrument's listed lifetime is shorter than the warm-up depth on a timeframe (e.g. fewer than 380 weeks of existence for W1); and a display limit the user has set below the warm-up. Both show the standard insufficient-history warning.

#### Scenario: Default timeframe scans successfully

- **WHEN** the user enables FVG on the default timeframe of a fully synced symbol
- **THEN** the scan runs over every displayed bar past the warm-up instead of reporting insufficient history

### Requirement: OB indicator

A second registered indicator SHALL be an Order Block scanner, registry id `ob` and toolbar
label `OB`, reproducing the Order Block detection of the external source indicator it is ported
from, with that source's default parameters, all of which SHALL be defined in one place.

An Order Block is the last candle opposing a structural swing, taken from the bars of that
swing. For every consecutive pair of confirmed swing pivots of opposite type (see the
swing-structure requirement), the scan SHALL:

- treat a low-then-high pair as an up-move producing **demand (BUY)** zones and search it for
  bearish bars (close below open); a high-then-low pair as a down-move producing **supply
  (SELL)** zones and search it for bullish bars (close above open);
- derive a **structural boundary** from the nearest earlier pivot of the same type as the
  second pivot — the previous high for a demand move, the previous low for a supply move — and
  SHALL skip the pair entirely when no such pivot exists, because the move has no structural
  context;
- scan the swing's bars offset one bar earlier: from the bar immediately preceding the first
  pivot's bar through the bar immediately preceding the swing's end bar, where the swing's end
  bar is the second pivot's bar clamped so that no candidate sits at or after the most recent
  structural break bar;
- reject any candidate that violates the boundary: a demand candidate's high SHALL lie below
  the boundary high, a supply candidate's low SHALL lie above the boundary low;
- reject, among the candidates of one swing, any candidate whose price range overlaps a
  **later** candidate of the same direction, so an overlapping run collapses to its newest
  member;
- reject any candidate whose swing is classified a pullback rather than an impulse;
- reject any candidate that is not small relative to the distance price travelled from the
  second pivot's extreme to the candidate's near edge: twice the candidate's high-to-low
  height SHALL be less than that distance, and a non-positive distance SHALL reject.

**Only demand zones SHALL be rendered.** Supply zones SHALL continue to be detected — the
detection is direction-symmetric and covers both directions, and hiding one has no bearing on
demand output — but a supply zone SHALL produce neither a rectangle nor a label on the chart.
Every statement below about rendering therefore concerns demand zones alone.

Each rendered Order Block SHALL render as a rectangle spanning its own bar's low to high,
from that bar's time forward to the end of the zone's validity, drawn behind the candles,
with a demand-coloured `OB` label. The rectangle and the label SHALL take the demand colour
from the shared directional zone palette. The rectangle SHALL be painted as a **filled** area
at 10% opacity of that colour — 90% transparent — and SHALL have **no border stroke**, which is
what distinguishes an Order Block zone from an FVG zone's outline; the `OB` label SHALL stay at
full colour strength so it remains legible over the fill. A zone's validity SHALL end at the
first close that breaks the swing that produced it — for a demand zone, a close below the
first pivot's low or above the second pivot's high — and zones belonging to the newest swing
SHALL remain open-ended through the newest bar. The same validity rule SHALL be computed for
supply zones even though no supply zone is drawn, so that the two directions differ in
rendering and in nothing else.

#### Scenario: Demand zone detected

- **WHEN** a confirmed low-then-high swing is classified an impulse, and one bearish bar in it
  sits below the previous swing high, is not overlapped by a later bearish bar in the same
  swing, and is small relative to its distance from the swing's high
- **THEN** a demand zone spanning that bar's low to high is drawn from that bar's time with an
  `OB` label

#### Scenario: Supply zone is detected but not drawn

- **WHEN** a confirmed high-then-low swing yields a supply Order Block that passes every filter
- **THEN** the zone appears in the indicator's detected zones with its direction, prices and
  validity end, and nothing for it is drawn on the chart — no rectangle and no label

#### Scenario: Chart carries no bearish rectangles at all

- **WHEN** the user enables `OB` on a series holding both demand and supply Order Blocks
- **THEN** every rectangle on the chart is a demand rectangle in the palette's demand colour,
  and no rectangle or label in the supply colour is drawn by `OB`

#### Scenario: Pullback swing yields nothing

- **WHEN** a swing's second pivot fails to exceed the previous pivot of its own type, making
  the swing a pullback
- **THEN** no Order Block is emitted for that swing, however many candidate bars it contains

#### Scenario: Oversized candidate rejected

- **WHEN** a candidate bar's height is half or more of the distance from the swing's extreme
  to that bar's near edge
- **THEN** the candidate is discarded rather than drawn

#### Scenario: Overlapping candidates collapse

- **WHEN** two same-direction candidate bars in one swing have overlapping high-to-low ranges
- **THEN** only the newer of the two is drawn

#### Scenario: Zone closes at the structural break

- **WHEN** a close after the swing breaks either the first pivot's extreme or the second
  pivot's extreme
- **THEN** the zone's rectangle ends at that bar rather than extending to the newest bar

#### Scenario: OB rectangle is a borderless 90%-transparent fill

- **WHEN** an Order Block zone is rendered
- **THEN** its rectangle is filled with its directional colour at 10% opacity — 90% transparent —
  and shows no border stroke, while the candles beneath it read at close to full contrast
  through the fill

#### Scenario: OB label stays readable over the fill

- **WHEN** an Order Block zone's `OB` label is drawn over the zone's fill
- **THEN** the label uses the full-strength directional colour rather than the 10%-opacity fill
  colour

### Requirement: OB marks its confirmed swing pivots

The `OB` indicator SHALL mark on the price pane every confirmed swing pivot its own structure
computation produced, so a reader can see the swings the zones were derived from. The mark
SHALL be a text label and nothing else:

- a pivot high SHALL carry the single character `H`, placed **above** the bar recorded as that
  pivot, anchored at that pivot's high;
- a pivot low SHALL carry the single character `L`, placed **below** the bar recorded as that
  pivot, anchored at that pivot's low;
- the label SHALL sit clear of the candle rather than overlapping its wick, separated from the
  anchoring extreme by a small visible gap, and SHALL be horizontally centred on its bar so it
  reads as belonging to that bar and not to a neighbour.

Because the pivot is relocated to the bar carrying the true extreme (see the swing-structure
requirement), the labelled bar SHALL be that relocated bar, so the label always sits at a real
high or low of the series.

Labels SHALL be drawn for every confirmed pivot in the displayed series at once, not only the
newest ones, matching the full-history rule the zones already follow. The live, unconfirmed
swing extreme SHALL NOT be labelled, even though the Order Block scan reads it, because it can
move to a different bar on every new bar until it confirms.

Pivot labels SHALL be legible against the chart background and SHALL be visually distinct from
the zone labels: they SHALL use a larger, emphasised type than the `OB` and `FVG` zone labels
and a neutral colour taken from neither side of the directional zone palette, so an `H` or `L`
is never read as a demand or supply marker. The zone labels' own appearance SHALL be unchanged
by this.

Pivot labels SHALL appear only while the `OB` indicator is enabled and SHALL disappear with it,
and they SHALL NOT alter the pane layout: no new pane, no change to the price pane's scaling,
and no change to the chart's vertical range.

#### Scenario: Confirmed pivots are labelled

- **WHEN** the user enables `OB` on a series whose structure holds several confirmed pivot highs
  and lows
- **THEN** each pivot-high bar carries an `H` above it and each pivot-low bar carries an `L`
  below it, every one of them drawn at once rather than only the most recent

#### Scenario: Label clears the candle

- **WHEN** an `H` is drawn for a pivot high
- **THEN** it sits above that bar's high with a visible gap, centred on the bar, and does not
  overlap the wick or the neighbouring candles

#### Scenario: Label follows the relocated pivot

- **WHEN** a typical-price pivot high is relocated to a neighbouring bar with a higher high
- **THEN** the `H` is drawn above that neighbouring bar at its high, not above the original
  candidate bar

#### Scenario: Unconfirmed extreme is not labelled

- **WHEN** the live swing's extreme is still unconfirmed while Order Blocks from that swing are
  already drawn
- **THEN** no `H` or `L` appears at that extreme; only confirmed pivots are labelled

#### Scenario: Pivot labels are not zone labels

- **WHEN** pivot labels and zone labels are on the chart together
- **THEN** the `H` and `L` labels are larger, emphasised and drawn in a neutral colour belonging
  to neither the demand nor the supply palette entry, while the `OB` and `FVG` zone labels keep
  the size and directional colour they had before

#### Scenario: Labels leave with the indicator

- **WHEN** the user disables `OB`
- **THEN** the pivot labels disappear along with the zones, and the price pane's layout and
  scaling are exactly as they were before the indicator was enabled

### Requirement: OB rests on internal-only swing structure

Order Block detection SHALL compute swing structure internally. Of that structure, only the
confirmed pivots SHALL be rendered, and only as the `H`/`L` labels the pivot-marking requirement
defines; nothing else about the structure SHALL be drawn on the chart, and the structure SHALL
NOT be exposed as a separate indicator. It comprises:

- **Swing pivots** over typical price (the mean of high, low and close). A candidate bar is a
  pivot high when its typical price strictly exceeds that of each of the configured number of
  bars on either side, and a pivot low when it is strictly below them. The pivot SHALL then be
  relocated to the bar carrying the most extreme high (for a high) or low (for a low) within
  that same window, so the pivot's price is a real extreme rather than a typical-price artifact.
- **Points-based confirmation.** A pivot SHALL be confirmed only once a later bar's typical
  price has retraced a configured distance, expressed in instrument points using the catalog's
  point size, away from the pivot's typical price; confirmation SHALL be rejected if any bar
  between the pivot and that retracement is more extreme than the pivot itself.
- **Structure containment.** A new pivot SHALL be rejected unless it exceeds the previous
  confirmed pivot of its own type — a new high above the previous high, a new low below the
  previous low. This applies to the live, unconfirmed swing extreme as well: an extreme that
  fails containment SHALL be discarded rather than kept, so no live swing is scanned and no
  break is registered from it.
- **Structural break tracking.** A close beyond the previous same-type pivot level SHALL count
  as a break. Every break SHALL be classified at a single point, from one comparison: the break
  direction against the swing direction prevailing immediately before it. A break in that
  direction is a continuation (BOS) and leaves the direction unchanged; a break against it is a
  reversal (SMS) and flips the direction to the break direction; a break with no direction yet
  established sets it. The swing direction SHALL NOT be recomputed from the confirmed pivots
  while a break is active, because that would overwrite the break-derived direction with stale
  pivot arithmetic.
- **The break-bar marker.** The most recent break bar SHALL clamp the right edge of the Order
  Block scan, and SHALL advance on **every** break, independently of any rule that would
  suppress a break from being reported. A marker left at a stale bar truncates later Order
  Blocks, so its advance SHALL NOT be conditional on anything but the break being newer than
  the marker.
- **Impulse/pullback classification.** Each confirmed pivot SHALL be classified as an impulse
  when its extreme exceeds that of the previous pivot of the same type, and a pullback
  otherwise; the first pivot of its type in the series SHALL count as an impulse. This is the
  classification the Order Block impulse filter consumes.
- **The live, unconfirmed swing.** While a structural break is active, the swing running from
  the newest confirmed pivot to the current unconfirmed extreme SHALL also be scanned for
  Order Blocks and SHALL be treated as an impulse, because the break itself establishes it as
  one. This is what makes the newest — and most actionable — zones appear before the swing's
  pivot has confirmed. Zones from that swing SHALL be the only ones treated as open-ended on
  account of the live swing, and only while a break is in fact active.

#### Scenario: Structure is computed but never drawn

- **WHEN** the `OB` indicator is enabled on a chart
- **THEN** the chart shows Order Block rectangles, their labels, and an `H` or `L` at each
  confirmed pivot; no swing lines, break labels, confirmation levels or pending-pivot markers
  are drawn

#### Scenario: Pivot relocated to the true extreme

- **WHEN** a bar is a typical-price pivot high but a neighbouring bar inside the detection
  window has a higher high
- **THEN** the pivot is recorded at the neighbouring bar and carries that bar's high

#### Scenario: Unretraced pivot is not used

- **WHEN** a candidate pivot high is never followed by a typical price the configured points
  distance below it
- **THEN** no confirmed pivot exists at that bar, so no swing pair and no Order Block derives
  from it, and no label is drawn there

#### Scenario: Live swing contributes zones

- **WHEN** the newest close has broken the previous same-type pivot level while the swing's own
  pivot is still unconfirmed
- **THEN** Order Blocks from that live swing are detected and drawn

#### Scenario: Live extreme inside structure is discarded

- **WHEN** the live, unconfirmed extreme does not exceed the previous confirmed pivot of its own
  type
- **THEN** it is discarded: no live swing is scanned, no zone is emitted from it, and no break
  is registered from it

#### Scenario: Break-bar marker advances on a suppressed break

- **WHEN** a structural break occurs that a reporting rule would suppress, and a later swing's
  Order Block candidates sit before it
- **THEN** the marker still advances to that break bar, so the scan is clamped there rather than
  at an earlier break

#### Scenario: Reversal flips the swing direction, continuation does not

- **WHEN** a close breaks structure against the prevailing swing direction and a later close
  breaks it again in the new direction
- **THEN** the first break is classified a reversal and flips the direction, and the second is
  classified a continuation and leaves it unchanged

### Requirement: OB omits the source's other SMC features

The port SHALL be limited to Order Block detection and rendering, plus the confirmed-pivot
`H`/`L` labels. The following behaviour present in the source indicator SHALL NOT be reproduced as
user-visible output: arrowed lines between pivots, BOS and SMS break labels, pivot confirmation
level lines, pending-pivot markers, the trend readout, price-return arrow markers on bars that
re-enter a zone, and the slow-RSI momentum block. The slow RSI SHALL NOT be computed at all,
since nothing consumes it even in the source.

Because no break label is drawn, the port SHALL NOT carry the source's break-label
bookkeeping either — the recorded event list and the guards that decide which break earns a
label, including any rule that collapses a run of same-classification breaks. Of the source's
break state the port SHALL keep only what its own output depends on: the most recent break bar
that clamps the scan, whether a break is currently active, and the swing direction that
classifies a break. Nothing else about a break SHALL be retained, so no dead state can drift
away from the source's model unnoticed.

The pivot labels SHALL be labels alone: reproducing them SHALL NOT bring back the source's
lines between pivots or any other line, level or ray attached to a pivot.

#### Scenario: No trend readout

- **WHEN** the `OB` indicator is enabled
- **THEN** the chart shows no trend text, arrows or break labels, only Order Block zones and the
  pivot `H`/`L` labels

#### Scenario: Pivot labels bring no lines with them

- **WHEN** consecutive pivot highs and lows are labelled on the chart
- **THEN** no line connects them, no horizontal level is drawn at a pivot's price, and no ray
  extends from a pivot

#### Scenario: No break-label bookkeeping is kept

- **WHEN** the structure computation processes a series of structural breaks
- **THEN** it retains only the most recent break bar, whether a break is active, and the swing
  direction; it keeps no list of break events and applies no rule that would decide which break
  earns a label

### Requirement: OB deviations from the source indicator

The Order Block port SHALL follow the same algorithm as its external source indicator apart
from the deviations listed below, and no others. A divergence from the source that is not on
this list SHALL be treated as a defect in the port rather than accepted as a difference. This is
a statement about the port's own behaviour: it holds whether or not any comparison against the
source is ever run.

Each deviation SHALL be recorded alongside the parameters:

- **The lookback cap is dropped.** The source scans a bounded recent window; the port SHALL
  scan every displayed bar, so that older zones stay visible per the full-history requirement.
- **All detected zones of the drawn direction are rendered.** The source's live view hides
  zones that oppose the current trend and zones from any swing but the newest; the port SHALL
  render every detected demand zone at once, matching the source's history mode. The source's
  show-history switch SHALL NOT be carried as a parameter or a control: full history is always
  displayed. Its trend-bias display filter SHALL NOT be carried either, so a demand zone is
  never hidden because the prevailing swing direction is down.
- **Supply zones are detected but never drawn.** The source draws both directions; the port
  SHALL draw demand zones only. This is a rendering deviation alone and SHALL NOT change which
  zones are detected, so the two directions differ in rendering and in nothing else.
- **The newest stored bar stands in for the source's forming bar** — the still-open newest bar
  of a live chart — and SHALL be excluded from acting as a candidate Order Block bar or a
  confirmed pivot, matching the convention the FVG indicator already follows.
- **The skip-bar interval is dropped.** The source refuses to treat a bar whose open time falls
  in a configured server-time window as a pivot or an Order Block candidate, on timeframes
  below H4. The port SHALL treat every bar in the displayed series as real data, skipping and
  modifying none, and SHALL NOT carry the window, its bounds, or a server-time offset as a
  parameter. Because this changes which bars are eligible below H4, the port's output on
  timeframes below H4 SHALL NOT be expected to agree with the source's; at H4 and above the
  filter is inert in the source, so this deviation has no effect there.
- **Only the source's fresh-load path is reproduced.** The port SHALL recompute the whole
  structure from the displayed series in one pass, which corresponds to the source's
  full-recalculation path; the source's per-tick and per-bar incremental refinements SHALL NOT
  be modelled. Output therefore SHALL NOT depend on the order in which bars arrived, only on
  the displayed series.

#### Scenario: Zone deep in history is still drawn

- **WHEN** a qualifying demand Order Block sits well outside the source's lookback window in a
  long displayed series
- **THEN** the zone is detected and drawn alongside newer zones

#### Scenario: Counter-trend zone is still drawn

- **WHEN** a detected demand zone belongs to a swing that opposes the newest swing direction
- **THEN** it is drawn, because the port applies neither the source's trend-bias display filter
  nor its newest-swing-only filter

#### Scenario: Hiding supply does not change detection

- **WHEN** a series holds both demand and supply Order Blocks
- **THEN** every supply zone is present among the detected zones with its direction, prices and
  validity end, and the set of detected demand zones is exactly what it would be if supply
  zones were drawn

#### Scenario: Newest bar is not an order block

- **WHEN** the newest stored bar would qualify as an Order Block candidate
- **THEN** no zone is emitted for it

#### Scenario: Every bar is eligible regardless of its open time

- **WHEN** a bar whose open time falls in the source's skip window would qualify as a pivot or
  an Order Block candidate
- **THEN** it is treated as real data and qualifies, because the port applies no time-of-day
  filter on any timeframe

#### Scenario: Intraday output is not expected to match the source

- **WHEN** the port's zones on a timeframe below H4 differ from the zones the source indicator
  draws on a live chart of the same instrument
- **THEN** the difference is not a defect on that basis alone, because the source excludes
  skip-window bars there and the port does not

#### Scenario: Output depends only on the displayed series

- **WHEN** the same displayed series is computed after arriving as one batch and after
  arriving bar by bar
- **THEN** the structure and the zones are identical, because only the full-recalculation path
  is reproduced

#### Scenario: Deviations are recorded where the parameters are

- **WHEN** a reader inspects where the Order Block parameters are defined
- **THEN** every deviation above is recorded there, so the port's departures from its source are
  readable next to the values they apply to

### Requirement: OB reports when structure is missing

The `OB` indicator SHALL declare a minimum bar count sufficient for pivot detection and
confirmation, so that the framework's insufficient-history warning covers it. When the
displayed series is long enough but yields fewer than two confirmed swing pivots, the
indicator SHALL warn that no confirmed swing structure was found, because an absence of zones
is otherwise indistinguishable from an absence of qualifying candidates.

#### Scenario: No confirmed structure

- **WHEN** `OB` is enabled on a series long enough to scan but too featureless to confirm two
  pivots
- **THEN** the chart shows a warning that no confirmed swing structure was found rather than
  silently rendering nothing

#### Scenario: Series below the warm-up

- **WHEN** the displayed series holds fewer bars than the indicator's declared minimum
- **THEN** the standard insufficient-history warning names the required and available counts

### Requirement: Pane-rendered indicator output

An indicator declaring pane output SHALL render into a pane of its own, below the price pane, and that pane SHALL exist only while the indicator is enabled: enabling it SHALL create the pane and disabling it SHALL remove the pane and return its vertical space to the price pane. Multiple enabled pane indicators SHALL each get their own pane rather than sharing one.

A pane's contents SHALL be one or more per-bar series, each either a **line** or a **histogram** whose bars may be coloured individually by a rule the indicator defines. A pane SHALL be able to carry a horizontal reference line at a fixed value.

The pane SHALL share the chart's time scale, so panning, zooming and the crosshair move the price pane and every indicator pane together and a bar sits at the same horizontal position in all of them. The pane SHALL scale its own vertical axis to its own values, independently of price.

A pane series SHALL cover the same displayed slice of bars as the candles, leaving a value undefined only where the indicator's own warm-up leaves it undefined; an undefined value SHALL produce a gap rather than a zero or a straight line across it.

#### Scenario: Pane appears and disappears with the toggle

- **WHEN** the user enables a pane-output indicator and then disables it
- **THEN** a pane appears below the price pane while it is enabled and is gone afterwards, with the price pane reclaiming the space

#### Scenario: Panes stay aligned with the candles

- **WHEN** the user pans or zooms the chart with a pane indicator enabled
- **THEN** the pane's series moves with the candles and the same bar stays at the same horizontal position in both panes

#### Scenario: Warm-up region is a gap, not a zero

- **WHEN** a pane indicator's values are undefined over its warm-up bars
- **THEN** the pane draws nothing over that region rather than plotting zeros or joining across it

#### Scenario: Two pane indicators do not share a pane

- **WHEN** two pane-output indicators are enabled at once
- **THEN** each renders in its own pane, each scaled to its own values

### Requirement: MACD indicator

A registered indicator with registry id `macd` and toolbar label `MACD` SHALL reproduce the external source indicator it is ported from, using pane output. Its parameters SHALL be defined in one place and SHALL be fast period 13, slow period 34, signal period 9, and typical price `(high + low + close) / 3` as the applied price — the periods and applied price the user asked for.

The computation over the displayed bars, oldest first, SHALL be:

- an **applied price** series, one value per bar, where each value is `(high + low + close) / 3`;
- a **fast EMA** and a **slow EMA** of that series over the fast and slow periods;
- the **main line** = fast EMA − slow EMA;
- the **signal line** = an EMA of the main line over the signal period;
- the **histogram** = main line − signal line.

The pane SHALL draw the main line, the histogram, and a horizontal reference line at zero. Each histogram bar SHALL be coloured by the sign of its own value: the chart's bullish colour when the value is greater than or equal to zero, the bearish colour when it is below zero — the same rule the source's coloured histogram applies. The main line SHALL use a single colour distinct from both histogram colours, since it crosses zero freely and its colour carries no meaning.

Unlike the FVG and OB indicators, the newest stored bar SHALL carry MACD values like any other bar: the source plots the MACD on its forming bar, and a MACD value is a per-bar reading rather than a confirmed pattern, so there is nothing to withhold.

#### Scenario: MACD renders in its own pane

- **WHEN** the user enables `MACD` on a chart with enough bars
- **THEN** a pane below the candles shows the main line, the coloured histogram and a zero line, and no MACD output appears on the price pane

#### Scenario: Histogram colour follows its own sign

- **WHEN** the histogram crosses from positive to negative between two adjacent bars
- **THEN** the earlier bar is drawn in the bullish colour and the later one in the bearish colour, the flip happening at the sign change and not at a turn in the main line

#### Scenario: Newest bar carries a value

- **WHEN** the displayed series ends on the newest stored bar
- **THEN** that bar has a main-line and histogram value like every other bar past the warm-up

### Requirement: MACD signal line is computed but never drawn

The signal line SHALL be computed, because the histogram is defined as the main line minus it, and SHALL NOT be rendered — matching the source's own `InpHideSignalLine` default. Hiding it SHALL NOT be a user-facing option: there is no control to reveal it, and no other output changes on account of it being hidden.

#### Scenario: No signal line on the chart

- **WHEN** the `MACD` pane is rendered
- **THEN** it shows the main line, the histogram and the zero line only; no signal line is drawn and no control offers to show one

#### Scenario: Histogram still reflects the signal line

- **WHEN** the main line and the signal line diverge
- **THEN** the histogram grows accordingly, proving the signal line is computed even though it is not drawn

### Requirement: MACD parity with the source indicator

The MACD computation SHALL preserve the numeric conventions its source indicator depends on, because deviations shift every value:

- both price EMAs SHALL be seeded with the SMA of the first `period` applied-price values, so the fast EMA's first defined value sits at index `fastPeriod − 1` and the slow EMA's at index `slowPeriod − 1`;
- the main line SHALL be defined from index `slowPeriod − 1` onward and undefined before it;
- the signal EMA SHALL be seeded with the SMA of the first `signalPeriod` **defined** main-line values — that is, its SMA window starts at the main line's own first defined index, not at the start of the series — so the signal line's and the histogram's first defined value sits at index `slowPeriod − 1 + signalPeriod − 1`;
- the histogram SHALL be undefined wherever the signal line is undefined.

With the configured 13/34/9, this places the main line's first defined value at index 33 and the histogram's at index 41.

Parity SHALL be verified numerically against the reference computation over a deterministic bar series rather than by review, comparing the main, signal and histogram arrays value by value within a floating-point tolerance, and comparing the first defined index of each array exactly.

The reference values SHALL be produced entirely within this repository: a reference computation of the conventions above, over a deterministic bar series the repository itself constructs, committed as a fixture. Producing them SHALL require no trading terminal, no market data and no network access, so that regenerating the fixture is a command any contributor or CI run can execute rather than a manual step at one machine. Running the parity check SHALL likewise require nothing beyond a clone of the repository.

The reference computation SHALL be written independently of the indicator's own implementation and SHALL NOT call into it, so that the comparison has two implementations to disagree. Because both are transcriptions of the same source, the check SHALL additionally assert values derivable from the conventions above without either implementation — the SMA-seeded first defined value of each array, and the first defined indices exactly — so that a shared misreading of the seeding or of the warm-up boundaries cannot pass. What this establishes SHALL be understood as: the port's numeric conventions are pinned against regression and against the stated seeding arithmetic. It SHALL NOT be claimed to re-derive agreement with the source indicator running on a live terminal; that agreement was established once against the source and is upheld by the conventions this requirement states, not by the fixture.

The fixture SHALL record everything needed to reproduce it — the generator inputs that determine the bar series, the bar window it covers (its bar count and its oldest and newest bar times), and the periods used — and regenerating it against an unchanged implementation SHALL reproduce the committed file exactly, so that a fixture appearing in a diff means something the check covers has changed.

When no committed fixture is present, the parity check SHALL fail with a message naming the directory it looked in and the regeneration path, rather than aborting with an unhandled error. A fixture that has gone missing is a defect in the test suite's packaging and SHALL read as one.

Two departures from the source SHALL be sanctioned, and no others: the applied price is fixed to typical price and the periods to 13/34/9 rather than being user inputs, and the signal line is never drawn rather than being toggleable.

#### Scenario: EMA seeding

- **WHEN** the slow EMA is computed over the applied-price series
- **THEN** its first defined value at index 33 equals the arithmetic mean of the first 34 typical prices, and values before that index are undefined

#### Scenario: Signal EMA seeds from the main line's first defined value

- **WHEN** the signal EMA is computed over the main line
- **THEN** its first defined value at index 41 equals the arithmetic mean of the main line's values at indices 33 through 41, and values before index 41 are undefined

#### Scenario: Arrays compared against the reference

- **WHEN** the fixtures are regenerated from the reference computation
- **THEN** the main, signal and histogram arrays match value by value within tolerance and their first defined indices match exactly

#### Scenario: Parity check runs from a clean clone

- **WHEN** the parity check is run in a checkout that has never had a trading terminal available
- **THEN** it finds at least one committed fixture, compares against it, and reports a pass or a numeric failure — it does not report the fixture as unavailable

#### Scenario: Fixture is regenerated without a terminal

- **WHEN** a contributor with no trading terminal, no market-data access and no network connection regenerates the fixture
- **THEN** the generation succeeds from the repository alone, producing the same fixture the repository already holds

#### Scenario: Fixture records its bar window

- **WHEN** the committed fixture is inspected
- **THEN** it states the bar count and the oldest and newest bar times it was computed over, together with the generator inputs and periods that reproduce that series, so a later regeneration can be shown to describe the same window

#### Scenario: Regeneration is a no-op against an unchanged port

- **WHEN** the fixture is regenerated with neither the reference computation, the generator inputs nor the indicator changed
- **THEN** the committed file is unchanged, so the working tree stays clean

#### Scenario: Reference is not the port under test

- **WHEN** the reference values are produced
- **THEN** they come from a computation that does not call into the indicator's own implementation, and the fixture additionally carries first defined indices and SMA-seeded first values that follow from the stated conventions alone

#### Scenario: Seeding regression is caught

- **WHEN** the indicator is changed to seed either price EMA from its first value instead of the SMA of the first `period` values
- **THEN** the parity check fails, naming a differing index rather than passing on a shifted series

#### Scenario: Missing fixture reads as a fixture problem

- **WHEN** the parity check runs with no fixture directory or an empty one
- **THEN** it fails with a message naming the expected fixture location and how to regenerate it in-repo, and not with an unhandled file-system error

### Requirement: MACD declares its own warm-up

The `macd` indicator SHALL declare a minimum bar count of `slowPeriod + signalPeriod` — 43 with the configured periods — which is the same guard the source applies before it computes anything, so the framework's insufficient-history warning covers it. Below that count the indicator SHALL produce the standard warning and no pane output rather than a partly-defined pane.

#### Scenario: Series below the warm-up

- **WHEN** `MACD` is enabled on a displayed series of fewer than 43 bars
- **THEN** the standard insufficient-history warning names 43 required against the number displayed, and no MACD pane content is drawn
