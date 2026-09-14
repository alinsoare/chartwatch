# sync Specification

## Purpose

Covers the orchestration of a sync run: it happens only on explicit user action, isolates per-symbol failures, respects the data source's rate limits, and exposes progress the UI can follow.

## Requirements

### Requirement: Sync runs only on explicit user action

In the application — the dev UI and the published site — a sync SHALL start only because the user asked for one: a sync control pressed, or a periodic refresh the user switched on for the current session. The system SHALL NOT schedule syncs outside that opt-in, run them at startup, resume a previously enabled periodic refresh on a later load, or fetch market data as a side effect of loading or viewing a chart.

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

### Requirement: Optional periodic refresh

Where a backend is available, the UI SHALL offer a control that repeatedly runs an incremental sync while it is switched on, at a fixed interval of 15 minutes. It SHALL be off by default, SHALL start no sync until the user switches it on, and SHALL NOT be restored automatically on a later page load — switching it on authorizes refreshes for the current session only. Each refresh SHALL use the same incremental path as a manual run, SHALL skip timeframes that cannot yet have a new bar, and SHALL be suppressed while a sync is already running rather than queued. Switching the control off or leaving the page SHALL stop further refreshes. The published static site, having no backend, SHALL NOT offer the control.

#### Scenario: Turning periodic refresh on

- **WHEN** the user switches the control on
- **THEN** an incremental sync runs every 15 minutes for as long as it stays on, and the run's progress is reported exactly as a manual run's is

#### Scenario: Nothing happens until it is switched on

- **WHEN** the user loads the app, browses charts, and never touches the control
- **THEN** no sync runs and no market-data request is made

#### Scenario: Not resumed on reload

- **WHEN** the user leaves periodic refresh on and reloads the page
- **THEN** the control is off again and no sync runs until the user switches it on

#### Scenario: A refresh arriving during a run is dropped

- **WHEN** the interval elapses while a sync is still running
- **THEN** that refresh is skipped rather than queued, and the running sync is unaffected

### Requirement: A periodic refresh skips timeframes that cannot have a new bar

A periodic refresh SHALL skip any symbol/timeframe where less than one bar's duration has elapsed since its newest stored bar, because the source cannot yet have a bar the system does not already hold: a weekly series is left alone until seven days have passed, a daily series until 24 hours have, an hourly series until an hour has. A skipped timeframe SHALL be reported as skipped in the run's results and SHALL leave its recorded sync state unchanged, so freshness continues to reflect the last run that actually fetched. A manual sync SHALL NOT apply this rule: pressing a sync control always fetches.

Because the finest supported timeframe is hourly while the refresh interval is shorter than an hour, a refresh that finds every timeframe too recent SHALL complete having fetched nothing, reporting every timeframe as skipped. That is a successful run, not a failure or a no-op to be hidden: it SHALL be reported like any other run, and it SHALL NOT leave a symbol looking stale or errored.

#### Scenario: Weekly series left alone

- **WHEN** a periodic refresh runs two days after a symbol's newest stored W1 bar, and more than an hour after its newest stored H1 bar
- **THEN** its W1 timeframe is skipped and reported as skipped, while H1 is still fetched

#### Scenario: Intraday series still refreshed

- **WHEN** a periodic refresh runs 70 minutes after a symbol's newest stored H1 bar
- **THEN** its H1 timeframe is fetched incrementally

#### Scenario: Every timeframe too recent

- **WHEN** a periodic refresh runs 15 minutes after a run that fetched a symbol's H1, D1 and W1 series successfully
- **THEN** all three timeframes are reported skipped, no market-data request is made for that symbol, its recorded sync state is unchanged, and the run reports success

#### Scenario: Never-synced timeframe is not skipped

- **WHEN** a periodic refresh runs for a symbol/timeframe that holds no bars
- **THEN** it is fetched rather than skipped, because there is no newest bar to measure against

#### Scenario: Manual sync ignores the rule

- **WHEN** the user presses a sync control moments after a successful sync
- **THEN** every timeframe is fetched, with no timeframe skipped for being too recent

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
