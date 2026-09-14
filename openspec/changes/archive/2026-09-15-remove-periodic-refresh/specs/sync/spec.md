## MODIFIED Requirements

### Requirement: Sync runs only on explicit user action

In the application — the dev UI and the published site — a sync SHALL start only because the user pressed a sync control. The system SHALL NOT schedule syncs outside that opt-in, run them at startup, run them on any client-side timer, or fetch market data as a side effect of loading or viewing a chart.

In CI, the release workflow's triggers SHALL be the authorized substitute for that user action: a manual dispatch, or the workflow's twice-daily schedule, which the maintainer has authorized standing in advance so the published snapshot stays at most about half a day old. That schedule SHALL be the only automatic sync trigger anywhere in the system; it SHALL NOT be taken as license for client-side scheduling, background refresh, or any implicit fetch in the app.

#### Scenario: Viewing a chart is offline

- **WHEN** the user opens the app and browses charts without pressing a sync control
- **THEN** no request is made to the market data source

#### Scenario: The daily CI schedule is the only automatic sync

- **WHEN** a sync starts without anyone pressing a control
- **THEN** it is one of the release workflow's scheduled runs, and no client-side path exists that could have started it

## REMOVED Requirements

### Requirement: Optional periodic refresh

**Reason**: The periodic-refresh control ("auto 15m") is being removed entirely. Manual sync controls (sync-all, sync-selected, full refresh) plus the CI twice-daily schedule remain the only sync triggers, per the updated "Sync runs only on explicit user action" requirement.

**Migration**: No replacement. Users who relied on the 15-minute auto-refresh should press a sync control manually, or rely on the CI schedule for the published site's freshness.

### Requirement: A periodic refresh skips timeframes that cannot have a new bar

**Reason**: This requirement only existed to support the periodic-refresh control's freshness-skipping behavior. With periodic refresh removed, there is no periodic run left to apply the skip rule to; manual syncs already always fetch everything, unaffected by this rule.

**Migration**: No replacement. Manual syncs continue to fetch every timeframe every time, exactly as before.
