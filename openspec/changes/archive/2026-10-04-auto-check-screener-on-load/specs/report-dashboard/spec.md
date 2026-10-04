## MODIFIED Requirements

### Requirement: Present sections as tabs below a fixed header

The summary, import control, freshness indicators, and category filter SHALL stay visible above a tab bar. There SHALL be no check-screener (or other manual screener-trigger) control in the header — screener confirmation runs automatically per `ladder-projection`. Below the header the page SHALL present four tabs in this order — Instrument ranking, Open ladders & TP projections, Watch list, No closed trade history — showing one section at a time without reloading, with Instrument ranking selected on every load (selection not persisted). Each tab label SHALL carry the count of rows visible under the current filter (ladders, not table rows, for the ladders tab) and update when the filter changes. Tabs SHALL be keyboard operable with left/right arrow keys.

#### Scenario: Tab counts follow the filter

- **WHEN** the user unticks a category
- **THEN** every tab label's count drops by that category's visible rows

#### Scenario: No manual screener control in the header

- **WHEN** the dashboard header renders, with or without a cached report
- **THEN** no button or control for triggering a screener check is present anywhere on the page

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

## ADDED Requirements

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
