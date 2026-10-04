## RENAMED Requirements

- FROM: `### Requirement: Get screener confirmation only on an explicit user action`
- TO: `### Requirement: Get screener confirmation automatically on load and import`

## MODIFIED Requirements

### Requirement: Get screener confirmation automatically on load and import

The system SHALL attach a screener-confirmation status to the next-rung recommendation, fetching the site's own published screener scores and instrument catalog — both as same-origin relative paths, so the same page works on the dev server and on the published site — automatically rather than behind a user-pressed control: once on every page load, unconditionally, whether or not a report is cached or restored, and again after each report import completes successfully. A load with no cached report SHALL still fetch and cache the screener/catalog payload, so the data is ready to apply as soon as a report is later imported or restored. Both fetched payloads SHALL be cached in the browser so a later load shows the last-checked confirmation immediately while a fresh automatic check runs in the background; a check already in flight SHALL NOT be duplicated by a second trigger (e.g. an import landing while the boot-time check is still running) — the second trigger SHALL join the in-flight check rather than starting a new fetch; if no check is in flight, each trigger (load, import) starts its own new fetch regardless of how recently the data was last fetched. A failed fetch SHALL leave the previously cached payloads in place and report the failure. Outside of these two triggers (page load, and completing an import), the system SHALL NOT fetch screener or catalog data — not periodically, and not merely because the user changed the category filter or switched tabs.

#### Scenario: Automatic check on load with no cached report

- **WHEN** the page loads with no cached report
- **THEN** a screener-and-catalog fetch still starts automatically, and the result is cached so it is ready to apply once a report is imported or restored

#### Scenario: Automatic check on load with a cached report

- **WHEN** the user reopens the page and a cached report is restored
- **THEN** a screener-and-catalog fetch starts automatically, with no control to press

#### Scenario: Automatic check after import

- **WHEN** a report import completes successfully
- **THEN** a screener-and-catalog fetch starts automatically for the newly imported report

#### Scenario: Cached confirmation survives a reload

- **WHEN** the page has a previously cached screener payload and an automatic check is triggered
- **THEN** the last-cached confirmation status renders immediately, and the display updates in place once the automatic fetch resolves

#### Scenario: Overlapping triggers do not duplicate the fetch

- **WHEN** a report import completes while the boot-time automatic check (started on page load, whether or not a report was cached) is still in flight
- **THEN** only one screener-and-catalog fetch is in flight at a time, and both triggers observe its outcome

#### Scenario: Failed check keeps the last good data

- **WHEN** an automatic screener-and-catalog fetch fails
- **THEN** the page reports the failure and continues showing the previously cached confirmation, if any

#### Scenario: No implicit fetch

- **WHEN** the user changes the category filter or switches tabs on an already-loaded report
- **THEN** no screener-or-catalog fetch occurs, since neither action is a load or an import — the only implicit (non-retry) fetches are the page-load and post-import triggers
