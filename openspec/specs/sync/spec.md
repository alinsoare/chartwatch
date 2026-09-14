# sync Specification

## Purpose

Covers the orchestration of a sync run: it happens only on explicit user action, isolates per-symbol failures, respects the data source's rate limits, and exposes progress the UI can follow.

## Requirements

### Requirement: Sync runs only on explicit user action

In the application — the dev UI and the published site — a sync SHALL start only because the user pressed a sync control. The system SHALL NOT schedule syncs outside that opt-in, run them at startup, run them on any client-side timer, or fetch market data as a side effect of loading or viewing a chart.

In CI, the release workflow's triggers SHALL be the authorized substitute for that user action: a manual dispatch, or the workflow's twice-daily schedule, which the maintainer has authorized standing in advance so the published snapshot stays at most about half a day old. That schedule SHALL be the only automatic sync trigger anywhere in the system; it SHALL NOT be taken as license for client-side scheduling, background refresh, or any implicit fetch in the app.

#### Scenario: Viewing a chart is offline

- **WHEN** the user opens the app and browses charts without pressing a sync control
- **THEN** no request is made to the market data source

#### Scenario: The daily CI schedule is the only automatic sync

- **WHEN** a sync starts without anyone pressing a control
- **THEN** it is one of the release workflow's scheduled runs, and no client-side path exists that could have started it

### Requirement: One sync at a time

At most one sync SHALL run at a time. A trigger arriving while a sync is running SHALL be rejected with a clear conflict signal rather than queued.

#### Scenario: Concurrent trigger rejected

- **WHEN** the user triggers a sync while one is already running
- **THEN** the request is rejected with a conflict response and the running sync is unaffected

### Requirement: Sync scope is symbols and refresh mode

The user SHALL be able to sync all enabled instruments or a chosen subset, and to choose between an incremental run and a full refresh that re-pulls each timeframe's whole fetch window. A sync run SHALL NOT carry any bar-count or depth parameter: depth is a property of the timeframe, so the only choices a run offers are which symbols to sync and whether to re-pull rather than extend.

#### Scenario: Sync a single symbol

- **WHEN** the user triggers a sync for one selected symbol
- **THEN** only that symbol is fetched and updated

#### Scenario: Full refresh

- **WHEN** the user triggers a sync with the full-refresh option
- **THEN** each timeframe is re-requested from the start of its fetch window rather than incrementally, and bars older than that window are retained

#### Scenario: Depth parameters are refused

- **WHEN** a sync is requested with a bar-count target for a timeframe
- **THEN** the request is refused as invalid rather than silently ignored, because a caller supplying one is working from a contract that no longer exists

### Requirement: Per-symbol failure isolation

A failure while syncing one symbol SHALL NOT abort the run. The error SHALL be recorded against that symbol and the run SHALL continue with the remaining symbols.

#### Scenario: One bad ticker among many

- **WHEN** one symbol's fetch fails during a multi-symbol sync
- **THEN** the remaining symbols still sync, and the run's results show that symbol with an error status and message

### Requirement: Rate-limit resilience

The system SHALL retry rate-limited fetches with increasing backoff, and SHALL pause between batches of symbols during a multi-symbol run to stay under the source's limits.

#### Scenario: Rate-limited fetch recovers

- **WHEN** the data source responds with a rate-limit error
- **THEN** the fetch is retried after a backoff delay, and only after the retry budget is exhausted is the symbol marked failed

### Requirement: Observable progress

While a sync runs, the system SHALL expose its progress: whether a run is active, totals and completed counts, the symbol currently being processed, and per-symbol results (status, bars written, messages). The UI SHALL be able to poll this state; polling progress is not a market-data fetch.

#### Scenario: UI follows a running sync

- **WHEN** the user triggers a sync from the UI
- **THEN** the UI shows a progress indicator advancing per symbol and a completion summary including any per-symbol errors

### Requirement: Sync state recorded per symbol and timeframe

After each symbol/timeframe is processed, the system SHALL record the sync time, outcome status, message, newest bar timestamp, and observed quote currency, and SHALL surface this state alongside the catalog so the user can see what is fresh and what failed.

#### Scenario: Catalog shows sync freshness

- **WHEN** the user views the symbol browser after a sync
- **THEN** each instrument shows its bar counts and last successful sync time, and failed timeframes show their error state
