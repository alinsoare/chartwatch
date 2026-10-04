## Purpose

Projects an averaging-down ladder (five capital-weighted rungs) for every open long position from an imported report, with net-of-tax take-profit targets on every rung, a time-escalating floor, plan-state and reached/pending classification, a position-sizing cap, a ladder budget, and a button-triggered screener confirmation for the next-rung recommendation — all computed client-side from the imported report plus the page's settings module.

## ADDED Requirements

### Requirement: Define the ladder schedule and strategy constants in one settings module

The system SHALL hold every ladder and strategy constant in a single settings module shipped with the page; there SHALL be no settings user interface in this version. The shipped values SHALL be: five rungs R1–R5 with cumulative entry amounts 300 / 500 / 800 / 1300 / 2100 EUR, trigger percentages (drawdown from the base price at which the rung becomes eligible) −8 % / −13 % / −21 % / −34 % for R2–R5, net-after-tax take-profit rates 5 % / 4 % / 3 % / 2 % / 1 %, a tax rate of 10 %, a minimum net profit of 15 EUR, a maximum ladder budget of 5000 EUR, an escalation step of 1 % per 30-day period, and an instrument equity cap of 20 %. Changing a value in the module SHALL change every downstream figure with no other edit.

A rung's **cumulative invested amount** SHALL be the sum of the entry amounts of rungs 1 through that rung — 300, 800, 1600, 2900, and 5000 EUR under the shipped schedule — derived from the rung amounts rather than configured separately.

#### Scenario: Shipped values apply

- **WHEN** the page is loaded as shipped
- **THEN** ladders are projected using the schedule above, and no control on the page lets a visitor alter it

#### Scenario: Cumulative amounts derive from rung amounts

- **WHEN** the shipped rung amounts are in force
- **THEN** R3's cumulative invested amount is 1600 EUR, and R5's is the 5000 EUR ladder budget

### Requirement: Anchor every time-dependent figure to the report's as-of date

Every figure that depends on "now" — holding period, escalation periods, ladder age — SHALL be measured to the imported report's own as-of date (the end of the report period stated in the workbook), not to the moment the page is viewed, so that time-based figures stay consistent with the report's frozen current prices and do not drift between visits to the same cached report. Screener staleness is the one exception: it concerns the screener payload's age and SHALL be measured against wall-clock time.

#### Scenario: Reload does not age the ladder

- **WHEN** a cached report is reopened a week after it was imported
- **THEN** every ladder's age and periods-held are the same as on the day of import

#### Scenario: Screener age uses wall-clock time

- **WHEN** the cached screener payload is older than the staleness threshold at the moment the page is viewed
- **THEN** every ticker resolves to stale, regardless of the report's as-of date

### Requirement: Group open legs by ticker and direction

The system SHALL group open legs by the combination of ticker and trade direction, so that each group holds legs of one instrument in one direction and produces its own ladder state. A leg whose direction cannot be determined SHALL be grouped as long, and the assumption SHALL be surfaced on that ladder rather than applied silently.

#### Scenario: Long and short legs on one ticker

- **WHEN** one ticker has both long and short open legs
- **THEN** two ladder states are produced, one per direction

#### Scenario: Unknown direction is assumed long and flagged

- **WHEN** an open leg's direction is unknown
- **THEN** it is grouped with long legs and the ladder carries an assumed-direction note

### Requirement: Compute blended average and infer the active rung per ticker

For each ticker's open long legs, the system SHALL compute a volume-weighted blended average open price, the total invested amount, and the base price (the oldest open leg's open price), and SHALL infer the **active rung** as the deepest rung whose cumulative invested amount the ladder's total invested capital has reached, walking legs in open-time order.

#### Scenario: Below the first tier still reports R1

- **WHEN** a ladder's invested capital has not reached R2's cumulative tier
- **THEN** its active rung is reported as R1

### Requirement: Derive each rung's gross price move from its net take-profit rate

Each rung's net-after-tax take-profit rate SHALL be converted to a gross price-move percentage using the configured tax rate, at full precision, so the exit price yields the stated net return after tax on the gain.

#### Scenario: Gross move derived from net rate and tax rate

- **WHEN** a rung's net rate is 5 % and the tax rate is 10 %
- **THEN** its derived gross price move is 5 % / (1 − 10 %) ≈ 5.56 %

### Requirement: Escalate every rung's net take-profit target with the holding period

Every rung's net-after-tax target SHALL resolve to an **effective rate** of `max(configured_net_rate, floor_step × periods_held)`, where `periods_held = max(1, ceil(days_held / period_days))` and `days_held` is measured from the ladder's oldest open leg to the report's as-of date. Rounding SHALL be upward, so any part of a period counts as a whole one. Every downstream figure for that rung (gross move, exit price, net/gross EUR results, reached/pending classification, floor judgment) SHALL use the effective rate once the floor exceeds the configured one. A zero `floor_step` SHALL disable escalation entirely. Adding a leg or partially closing a ladder SHALL NOT reset the holding period as long as a leg from the original entry remains open; when the oldest remaining leg changes, the period SHALL be measured from the oldest leg still open. The system SHALL expose, per rung, whether its effective rate exceeds its configured rate, and per ladder, its `periods_held`.

#### Scenario: Floor raises the terminal rung after one period

- **WHEN** a ladder's first entry was opened 45 days before the report's as-of date under the shipped schedule
- **THEN** `periods_held` is 2, the floor is 2 %, R5 is escalated from its configured 1 % to 2 %, and R4's 2 % is unchanged and not marked as escalated

#### Scenario: Any part of a period counts

- **WHEN** a ladder has been held 31 days at 30-day periods
- **THEN** `periods_held` is 2

#### Scenario: Escalation is disabled by a zero step

- **WHEN** the escalation step is 0
- **THEN** every rung's effective rate equals its configured rate, unaffected by holding time

### Requirement: Derive each rung's blended average from the position held and the rung's cumulative amount

For each rung the system SHALL derive the blended average price that rung's exit is priced on, in one of three ways determined by the rung's position relative to the active rung:

1. A rung **below** the active rung SHALL be priced on the **pure staged plan**: rung *k*'s planned entry price is the base price reduced by rung *k*'s configured trigger percentage, its planned share count is its entry amount divided by that entry price, and the plan's blended average at rung *k* is the cumulative planned amount through *k* divided by the cumulative planned shares through *k*. The ladder's actual legs SHALL NOT enter this derivation.
2. The **active** rung SHALL be priced on the **position held today**: the ladder's current blended average, current total shares, and actual invested amount.
3. A rung **above** the active rung SHALL be priced on the ladder's **actual legs topped up** to that rung's cumulative amount: for each unfunded rung *j* from the rung after the active one through *k*, the top-up amount is rung *j*'s cumulative amount less the amount committed so far, bought at rung *j*'s configured trigger price; the blended average is the resulting total amount divided by the resulting total shares.

A ladder that has followed the plan exactly SHALL have all three derivations agree with the pure staged plan. A ladder with no base price or no legs SHALL produce no projections rather than figures computed against zero.

#### Scenario: Rung above the active one depends on the position held

- **WHEN** two ladders are both on R2 but hold different amounts and averages
- **THEN** their R3 exit prices differ, because each is the held position topped up to R3's cumulative amount

#### Scenario: On-plan ladder matches the staged plan

- **WHEN** a ladder's legs were bought exactly at each rung's trigger price for exactly each rung's amount
- **THEN** every rung's derived blended average equals the pure staged plan's

### Requirement: Project one take-profit level per rung, on an explicit basis

The system SHALL project exactly one take-profit level per configured rung — five under the shipped schedule — ordered R1 through R5, each with an exit price equal to that rung's derived blended average multiplied by `1 + gross rate` (from the rung's effective net rate), and each reporting its exit price's offset from the current price. Only the active rung SHALL report a **distance to target**.

Every projected figure SHALL carry which of two bases it is on, as an explicit property: a **staged-plan projection** for every rung other than the active one (what following the plan to rung *k* and exiting there nets), or a **current-position projection** for the active rung only (what exiting today's position at the active rung's target nets). A figure SHALL NOT mix the two bases, and both SHALL NOT be produced for the active rung.

#### Scenario: Five levels, one basis each

- **WHEN** a projecting long ladder is on R2
- **THEN** five levels are projected, R1 and R3–R5 on the staged-plan basis and R2 alone on the current-position basis

### Requirement: Estimate the net profit of every projected level

For every level the system SHALL estimate the net profit in EUR after applying the tax rate once to the gross gain implied by the exit price; a loss SHALL NOT be reduced by the tax rate. For a non-active rung the gross gain SHALL be measured against that rung's cumulative invested amount on the share count its blended average was derived from; for the active rung, against the ladder's actual invested amount on the current shares. Because the gross rate is derived at full precision, a non-active rung's net figure SHALL equal its effective net rate applied to its cumulative amount — 15.00, 32.00, 48.00, 58.00, and 50.00 EUR for R1–R5 under the shipped schedule with no escalation.

#### Scenario: Plan net figure equals rate times cumulative amount

- **WHEN** R3 is a non-active rung with no escalation under the shipped schedule
- **THEN** its projected net profit is 48.00 EUR (3 % of 1600 EUR)

#### Scenario: Loss is not taxed

- **WHEN** a level's exit price is below the basis it is priced on
- **THEN** its net result equals its gross result

### Requirement: Report each rung's plan state

Each rung SHALL report a **plan state** derived from the ladder's invested amount against that rung's cumulative amount: *filled* when the invested amount reaches it, otherwise *awaiting trigger* with the trigger price it waits for. A rung awaiting a trigger the current price has already crossed SHALL be reported as *due*, distinguishable from one whose trigger is still ahead. The filled rungs SHALL be exactly the active rung and those below it; leg count SHALL NOT determine plan state.

#### Scenario: Leg without committed amount is still awaiting

- **WHEN** a rung's trigger has been crossed and a small leg was bought there, but the invested amount has not reached that rung's cumulative amount
- **THEN** that rung's plan state is awaiting trigger (due), not filled

### Requirement: Classify the active rung's level as reached or pending

The system SHALL classify the active rung's current-position projection as *reached* when the current price is at or above its exit price and *pending* otherwise, as an explicit property; for a reached projection it SHALL also expose how far past the exit price the current price is. Non-active rungs SHALL NOT be classified reached/pending — they carry a plan state instead. The classification SHALL be independent of the minimum-net-profit judgment.

#### Scenario: Reached but below floor

- **WHEN** the current price exceeds the active rung's exit price but the projected net profit is below the minimum net profit
- **THEN** the level is reached and the floor flag is raised, both at once

### Requirement: Project the after-tax result of selling at the current price

For each projecting ladder the system SHALL compute a sell-now projection: the gross unrealized result of exiting the whole position at the current price, the net result after tax on a gain (a loss not reduced), and whether that net result meets the minimum net profit.

#### Scenario: Sell-now on an underwater ladder

- **WHEN** a ladder's current price is below its blended average
- **THEN** its sell-now net result equals its gross result and does not meet the minimum net profit

### Requirement: Judge the minimum net profit floor at the active rung's exit target

The system SHALL raise a ladder-level compliance flag when the net profit projected at the active rung's exit target — its effective net rate priced on the current blended average and measured against the actual invested amount — falls below the configured minimum net profit in EUR. The floor SHALL NOT be scaled by rung or ladder size, and no non-active rung's plan figure nor the sell-now projection SHALL substitute for this judgment.

#### Scenario: Small R1 fails the floor

- **WHEN** a ladder holds 120 EUR on R1 at a 5 % net target
- **THEN** its projected net profit of 6.00 EUR is below the 15 EUR floor and the flag is raised

### Requirement: Flag a ladder over the maximum ladder budget

The system SHALL raise a compliance flag when a ladder's total invested amount exceeds the configured maximum ladder budget.

#### Scenario: Over budget

- **WHEN** a ladder's invested amount is 5200 EUR under the shipped 5000 EUR budget
- **THEN** the over-budget flag is raised, naming the budget

### Requirement: Re-anchor unfunded rung triggers to the active rung's actual crossing leg

In addition to each rung's ideal configured trigger, the system SHALL compute a re-anchored trigger derived from the active rung's **anchor drawdown** — the percentage move from the base price of the leg that actually crossed the active rung's cumulative tier. For rung `k = active_rung + 1`, the raw re-anchored trigger SHALL be `anchor − delta_k`, where `delta_k` is that rung's ideal-schedule spacing from the rung below it; for rungs further out, spacing SHALL chain forward from the preceding rung's **effective** trigger. A rung's effective trigger SHALL be `min(ideal, raw)` — re-anchoring only ever delays eligibility, never accelerates it.

#### Scenario: Re-anchoring delays, never accelerates

- **WHEN** a ladder's active rung was reached by a single large entry landing near the base price, giving an anchor drawdown near 0
- **THEN** the next rung's effective trigger is its ideal trigger, not a shallower raw re-anchored one

#### Scenario: Slippage pushes the next trigger deeper

- **WHEN** a ladder's active rung R2 was actually funded at a deeper drawdown than R2's ideal trigger
- **THEN** R3's effective trigger is deeper than its ideal trigger by the same amount

### Requirement: Recommend the next rung only when its own effective trigger is crossed

For every projecting long ladder not on its terminal rung, the system SHALL recommend adding at rung `active_rung + 1` — and only that rung — exactly when the current price has crossed that rung's effective trigger. The recommendation SHALL be suppressed (reported as none, never re-targeted) when the active rung is terminal, when the next rung's effective trigger is not crossed, when the ladder is short or assumed-direction or has no base price, or when the instrument carries a red semaphore signal. The recommendation SHALL carry the tier named, the drawdown, and the EUR shortfall to that rung's cumulative amount.

#### Scenario: Deep drawdown still recommends only the next rung

- **WHEN** a ladder's active rung is R1 and the current price has fallen past R2's, R3's, and R4's effective triggers
- **THEN** the recommendation names R2, never a deeper rung

#### Scenario: No averaging into red

- **WHEN** an instrument's semaphore signal is red
- **THEN** no next-rung recommendation is raised for it, regardless of trigger crossings

### Requirement: Get screener confirmation only on an explicit user action

The system SHALL attach a screener-confirmation status to the next-rung recommendation, but SHALL fetch the site's own published screener scores and instrument catalog — both as same-origin relative paths, so the same page works on the dev server and on the published site — only when the user presses an explicit "check screener" control; never on page load, on import, or periodically. Both fetched payloads SHALL be cached in the browser so reopening the page shows the last-checked confirmation without a new fetch, until the control is pressed again. A failed fetch SHALL leave the previously cached payloads in place and report the failure.

#### Scenario: No implicit fetch

- **WHEN** the user imports a report or reopens the page with a cached report
- **THEN** no network request for screener or catalog data occurs until the user presses the check-screener control

#### Scenario: Cached confirmation survives a reload

- **WHEN** the user has previously pressed check-screener and then reloads the page
- **THEN** the last-fetched confirmation status is shown immediately from the browser cache, with no new fetch

#### Scenario: Failed check keeps the last good data

- **WHEN** the check-screener fetch fails
- **THEN** the page reports the failure and continues showing the previously cached confirmation, if any

### Requirement: Resolve an XTB ticker to a screener symbol, confirming suffix aliases by name

The system SHALL resolve a ticker to a screener key by trying, in order: the ticker verbatim in the screener payload's `symbols` map; a catalog entry listing the ticker among its `aliases`; then a same-listing exchange-suffix alias from the table `.FR`→`.PA`, `.NL`→`.AS`, `.BE`→`.BR`, `.PT`→`.LS`, `.UK`→`.L`, `.US`→bare, `.IT`→`.MI`, `.ES`→`.MC`, `.FI`→`.HE`, `.SE`→`.ST`, `.NO`→`.OL`, `.DK`→`.CO`, `.CH`→`.SW`, `.PL`→`.WA`. It SHALL NOT alias across different listings of one security (e.g. `.DE` is never aliased to `.F` or `.DU`).

A suffix-table candidate SHALL be accepted only when the report's instrument name matches the catalog's `name` or `display_name` for that candidate after normalization — lower-casing, stripping punctuation, and stripping legal and fund suffixes (such as Inc, PLC, SA, AG, NV, ETF, UCITS, Acc, Dist) — with the two accepted as matching when identical or when one contains the other. A suffix candidate whose name does not match SHALL be rejected and the ticker treated as absent. The matched screener key and the catalog name it was confirmed against SHALL be exposed for audit.

#### Scenario: Catalog alias wins over the suffix table

- **WHEN** the payload has no `C7A0.DU` key and the catalog lists `C7A0.DU` as an alias of `C7A0.DE`
- **THEN** `C7A0.DU` resolves via `C7A0.DE`, with no name check needed

#### Scenario: Same-listing suffix alias confirmed by name

- **WHEN** the payload has no `BLC.FR` key, `symbols["BLC.PA"]` has a positive score, and the report names the instrument "Believe SA" while the catalog names `BLC.PA` "Believe"
- **THEN** `BLC.FR` resolves to confirmed via `BLC.PA`, with the matched key and name exposed

#### Scenario: Suffix alias rejected on name mismatch

- **WHEN** a suffix-table candidate exists but its catalog name shares nothing with the report's instrument name after normalization
- **THEN** the ticker resolves to unknown with reason absent, and the rejected candidate is not used

### Requirement: Resolve a per-ticker screener confirmation status

A payload older than the configured staleness threshold (18 hours shipped) SHALL cause every ticker to resolve to **stale**. Otherwise a ticker resolves to **unknown** (reason exposed: no-data, absent, not-screened, or insufficient-history), **confirmed** (screened with score ≥ 1), or **not-confirmed** (screened with score 0). The ticker's raw `score` and `marks` (0–3, read as-is, never derived from `reasons` nor substituted by `score`; absent when the entry carries none) and the payload's `generated_utc` SHALL be exposed alongside the status.

#### Scenario: Stale payload overrides every ticker's status

- **WHEN** the fetched payload's `generated_utc` is older than the staleness threshold
- **THEN** every ticker resolves to stale, regardless of its recorded score

#### Scenario: `marks` is independent of `score`

- **WHEN** a ticker's entry has `score` 5 and `marks` 3
- **THEN** the exposed `marks` is 3

### Requirement: Cap an instrument's current market value at 20 % of account equity

The system SHALL flag any instrument whose current market value (sum of its open legs' `volume × current_price`) is at or above 20 % of account equity, as derived by `report-parser`. A next-rung recommendation that would push an instrument past the cap if funded SHALL still be raised, carrying an equity-cap-breach note naming the projected overshoot, rather than being suppressed. When account equity cannot be derived, the cap SHALL report as unenforceable for that report, stating the reason.

#### Scenario: Breach is annotated, not suppressed

- **WHEN** a next-rung recommendation would push an instrument's market value above the 20 % cap if funded
- **THEN** the recommendation is still raised, carrying an equity-cap-breach note naming the EUR overshoot

### Requirement: Aggregate compliance flags per ladder

The system SHALL expose, per ladder, the set of compliance flags: configured trigger hit (the deepest crossed unfunded rung), the next-rung recommendation (separately, naming its tier), minimum-net-profit floor failing at the active rung's target, over maximum ladder budget, equity-cap breach, assumed direction, and no-averaging-into-red.

#### Scenario: Trigger hit and recommendation are separate flags

- **WHEN** a ladder on R1 has its price past R3's trigger
- **THEN** the trigger-hit flag names R3 and the recommendation flag names R2

### Requirement: Mark short positions as unsupported by the ladder rules

Open short legs SHALL be surfaced with their factual figures (volume, average open price, current price, unrealized P/L) but SHALL produce no rung, trigger, take-profit projection, escalation, or recommendation, since the ladder rules are long-only. The unsupported state SHALL be distinguishable from a blank/missing value.

#### Scenario: Short position surfaced without projection

- **WHEN** an open leg's direction is short
- **THEN** its factual figures are shown, and its rung/trigger/take-profit fields are marked unsupported rather than blank
