## Purpose

Ranks every instrument found in an imported report by profit velocity and safety signals, computed client-side, producing star ratings, semaphore signals, a capped watch list, and a no-history list, for categories with a calibrated velocity reference held in the page's settings module.

## ADDED Requirements

### Requirement: Hold ranking constants in the page's settings module

Every ranking constant SHALL live in the page's single settings module, with no settings user interface in this version. Shipped values SHALL be: a velocity reference of 0.002 per day for `ETF`, `ETN`, `ETC`, and `STOCK` with `CFD` uncalibrated; velocity weight 0.55 and win-rate weight 0.45; full confidence at 5 trades; semaphore thresholds of −8 % open drawdown for amber, −15 % for red, and a 60 % minimum win rate for green; and a watch-list cap of 10.

#### Scenario: Shipped values apply

- **WHEN** the page is loaded as shipped
- **THEN** rankings use the values above, and no control on the page lets a visitor alter them

### Requirement: Compute profit velocity per ticker

The system SHALL compute median and mean of `(profit_pct / hold_days)` across closed trades for each ticker, using each trade's percentage basis and its holding duration floored at one second. Trades with an undefined percentage return SHALL be excluded; a ticker whose trades all lack a defined return SHALL report no velocity, distinguishable from a measured velocity of zero.

#### Scenario: No measurable velocity

- **WHEN** every closed trade for a ticker has an undefined percentage return
- **THEN** the ticker reports no velocity, distinct from a velocity of zero

### Requirement: Cover every traded category in statistics

The system SHALL compute per-ticker statistics — trade count, win count, win rate, total profit, velocity, median holding duration, best/worst percentage return, the long/short split with its profit split, and open unrealized drawdown — for every ticker present in the imported report, whatever its category. The set of categories SHALL be derived entirely from the imported data, including categories present only among open legs; the system SHALL NOT read a configured or hardcoded category list.

#### Scenario: Every category is ranked

- **WHEN** the imported report contains `ETF`, `ETC`, `ETN`, `CFD`, and `STOCK` closed trades
- **THEN** every ticker with closed-trade history is ranked, and none is withheld because of its category

### Requirement: Rate only categories with a calibrated velocity reference

Star ratings and semaphore signals SHALL be produced only for categories that have a calibrated velocity reference in the settings module. A category with no reference SHALL receive full statistics and a rating/signal state reported as not-applicable-uncalibrated, distinguishable from a computed rating and from a missing value, together with the reason. A rated-category ticker with no defined velocity SHALL likewise be reported as unrated with that reason.

#### Scenario: Intraday category is unrated by default

- **WHEN** the CFD category has no velocity reference
- **THEN** its instruments report all statistics but no star rating and no semaphore signal, together with the uncalibrated reason

#### Scenario: Opting a category into rating

- **WHEN** a velocity reference is added for CFD in the settings module
- **THEN** its instruments receive star ratings and semaphore signals from the unchanged formulas against that reference

### Requirement: Assign star rating with confidence shrink

The system SHALL assign 1–5 stars from a composite of velocity normalized against the category reference (clamped to 0–1) and win rate, weighted by the configured weights, then scaled by `0.5 + 0.5 × min(1, trade_count / full_confidence_trades)` so a low sample size cannot reach the maximum rating. The composite score SHALL be exposed for ordering.

#### Scenario: Single winning trade

- **WHEN** a ticker has one profitable closed trade
- **THEN** its star rating is below the maximum regardless of velocity

### Requirement: Assign semaphore signal

The system SHALL assign red when median velocity is at or below zero or open drawdown is at or below the red threshold; green when median velocity is positive, win rate is at or above the green minimum, and open drawdown is better than the amber threshold; amber otherwise.

#### Scenario: Deep open drawdown

- **WHEN** an open ladder is worse than the red drawdown threshold
- **THEN** the semaphore is red even if closed-trade velocity is positive

### Requirement: Order the ranking and separate tickers with no closed history

The ranking SHALL contain every ticker with at least one closed trade, ordered rated-before-unrated, then by composite score descending, then by median velocity descending. Tickers with no closed trade but at least one open leg SHALL form a separate **no-history** list, ordered by ticker. Tickers with neither SHALL appear in neither.

#### Scenario: Held instrument never traded

- **WHEN** a ticker has open legs and no closed trades
- **THEN** it appears in the no-history list and not in the ranking

### Requirement: Build a watch list scoped by rating alone, capped

The system SHALL list, in ranking order and capped at the configured size, instruments that carry a green semaphore signal, have closed-trade history, and have no current open position. The list SHALL be scoped by rating alone, not by category: an instrument whose category has no calibrated reference carries no semaphore signal and therefore cannot qualify.

#### Scenario: Uncalibrated ticker cannot qualify

- **WHEN** a ticker's category has no calibrated velocity reference
- **THEN** it does not appear on the watch list, however strong its statistics

#### Scenario: Held tickers stay off the list

- **WHEN** a ticker rates green but has open legs
- **THEN** it does not appear on the watch list

#### Scenario: Cap applies in ranking order

- **WHEN** twelve tickers qualify under a cap of 10
- **THEN** the ten highest-ranked appear and the other two do not
