## MODIFIED Requirements

### Requirement: User settings persist across reloads

The UI SHALL remember the user's settings on the same browser and restore them on the next load: the chart display limit, the automatic vertical scale control's state, the selected instrument, the selected timeframe, the enabled indicators, and the sidebar filters (search text, asset class, quote currency, exchange, compatible-only, enabled-only, sort order). Persistence SHALL be local to the browser and SHALL NOT travel with the exported data or be shared between browsers. Only these settings persist; transient chart state SHALL NOT — neither an in-progress or completed measurement, nor the current zoom and scroll position, which start from the default framing on every load, nor the particular price range the automatic vertical scale last derived, which is recomputed from whatever is visible after the restore. Neither SHALL the sync controls' own state — the full-refresh option starts off on every load, so a reload can never resume fetching. A stored setting that is unusable — an instrument no longer in the catalog, an unknown timeframe, an unparseable limit, a non-boolean automatic-scale state, an unknown sort order, an asset class, quote currency or exchange no longer carried by any loaded instrument — SHALL be replaced by its default without blocking the rest of the restore. A browser holding settings written before the automatic vertical scale existed SHALL restore that control to its default of off, keeping its other settings, without a migration step and without an error. A sort order the list no longer offers SHALL be treated as unknown, so a browser holding the withdrawn sync-recency order restores the default order and keeps its other settings, without a migration step and without an error. A timeframe the system no longer supports SHALL likewise be treated as unknown, so a browser holding a withdrawn timeframe restores the default timeframe and keeps its other settings, again without a migration step and without an error. Restoring a filter SHALL NOT be able to hide the whole catalog behind a value the user cannot see in the filter's own choices. Where the browser denies persistent storage, the app SHALL operate normally with default settings.

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

## REMOVED Requirements

### Requirement: Sync controls in the UI

**Reason**: This requirement bundled the periodic-refresh control's presence into the same requirement as the manual sync controls. Periodic refresh is being removed entirely (see the `sync` capability delta), so this requirement is replaced by "Manual sync controls in the UI" below, which keeps the still-current content (sync-all, sync-selected, full-refresh) without the periodic-refresh scenario.

**Migration**: See the new "Manual sync controls in the UI" requirement under `## ADDED Requirements` for the continuing behavior.

## ADDED Requirements

### Requirement: Manual sync controls in the UI

When a backend is available, the UI SHALL offer sync-all, sync-selected, and a full-refresh option, with a progress display while a run is active. These controls SHALL be the only way the UI causes market data to be fetched.

#### Scenario: Sync from the chart

- **WHEN** the user presses sync-selected with an instrument chosen
- **THEN** a sync starts for that instrument, progress is shown until completion, and the list and chart refresh from local storage afterwards
