# release-publishing Specification

## Purpose

Covers publishing the app as a static site on GitHub Pages: the exported data contract, the manually-dispatched release pipeline, and the data-snapshot persistence that keeps CI syncs incremental instead of re-pulling history from scratch.

## Requirements

### Requirement: Static data export

The system SHALL export the local data store to static files consumable by the frontend without a backend: a catalog manifest (instruments with compatibility flags and sync freshness), per-symbol, per-timeframe bar files, the screening payload covering enabled instruments, and the screener-scores artifact covering every catalog instrument, plus metadata recording when the snapshot was generated. The exported shapes SHALL match what the dev backend serves, so the same frontend code — and any external consumer reading the published site directly — reads both identically.

#### Scenario: Export round-trip

- **WHEN** the exporter runs against a synced data store
- **THEN** loading the static site from the exported files shows the same instruments, bars, and warnings as the dev app showed

#### Scenario: Screening on the published site

- **WHEN** the user loads the published static site
- **THEN** the catalog is screened from the exported screening payload, producing the same marks the dev app produced from the same data store

#### Scenario: Screener scores are exported and served identically

- **WHEN** the exporter runs against a synced data store, and the dev backend is queried against the same store
- **THEN** both produce a `data/screener-scores.json` with identical content, covering every catalog symbol

#### Scenario: A published screener-scores file is fetchable directly

- **WHEN** a script issues a plain HTTP GET for `data/screener-scores.json` against the published GitHub Pages site
- **THEN** it receives a valid JSON document without needing to fetch `scan-bars.json` or any candle file

### Requirement: The release can be rehearsed locally

Every step of the release pipeline except the deployment itself SHALL be runnable locally: the headless sync, the exporter, and a preview of the exported site served as plain static files. The locally exported artifact SHALL match what the workflow publishes, so a maintainer can validate a release end to end before pushing anything to GitHub.

#### Scenario: Local rehearsal before dispatching

- **WHEN** the maintainer runs the sync and exporter locally and serves the export directory with a plain static file server
- **THEN** the site behaves exactly as it will on GitHub Pages — browsing, charts, indicators, snapshot timestamp — with nothing pushed to GitHub

### Requirement: Release is manually dispatched or runs on a daily schedule

A release SHALL be produced either by a workflow the maintainer dispatches manually or by a schedule built into that same workflow. The schedule SHALL run twice per day, at 03:00 UTC and 15:00 UTC, and SHALL be the only automatic trigger: the workflow SHALL have no push-based or other event-driven trigger that fetches data. Manual dispatch and the scheduled runs are the two authorized triggers for the sync the workflow performs; nothing else may start one.

A scheduled run SHALL execute the same pipeline a manual dispatch does — restore snapshot, sync, persist snapshot, export, deploy — unconditionally, whether or not application code changed since the previous release. A scheduled run SHALL always sync incrementally and SHALL NOT perform a full refresh. Manual dispatch SHALL continue to offer exactly one choice, whether to run incrementally or as a full refresh, and SHALL offer no bar-count or depth parameters, since fetch depth is fixed per timeframe.

Both scheduled runs SHALL behave identically: neither time of day is privileged, and the second run of a day SHALL NOT skip work merely because the first one already released that day.

#### Scenario: Push to main does not release

- **WHEN** commits are pushed to the development branch
- **THEN** no release workflow runs, no data is fetched, and the published site is unchanged

#### Scenario: Manual dispatch releases

- **WHEN** the maintainer dispatches the release workflow
- **THEN** it syncs incrementally, exports static data, and deploys the updated site to GitHub Pages

#### Scenario: Daily scheduled release with no code change

- **WHEN** a scheduled run fires and no application code has changed since the previous release
- **THEN** the workflow still syncs incrementally, persists the updated snapshot, exports, and redeploys the site, so the published snapshot is refreshed anyway

#### Scenario: Daily scheduled release after a code change

- **WHEN** a scheduled run fires after the release branch has advanced
- **THEN** the run builds and deploys from the release branch's current state, publishing both the newer code and the freshly synced data

#### Scenario: Scheduled runs never full-refresh

- **WHEN** a scheduled release runs
- **THEN** it syncs incrementally on top of the restored snapshot, and a full refresh remains available only by manual dispatch

#### Scenario: The second scheduled run of the day still releases

- **WHEN** the 15:00 UTC run fires on a day the 03:00 UTC run already released successfully
- **THEN** it performs the same unconditional pipeline again, refreshing the snapshot and redeploying the site

### Requirement: Data snapshot persists between releases

The release workflow SHALL restore the data snapshot committed by the previous release before syncing, run an incremental sync on top of it, and commit the updated snapshot back to a dedicated data location in the repository. Bars SHALL never be re-pulled from scratch when a prior snapshot exists, and a release SHALL NOT drop bars the snapshot already holds — the snapshot only ever grows.

#### Scenario: First release

- **WHEN** the workflow is dispatched and no prior snapshot exists
- **THEN** it performs the initial backfill to each timeframe's fetch depth and commits the resulting snapshot

#### Scenario: Subsequent release

- **WHEN** the workflow is dispatched with a prior snapshot available
- **THEN** it restores that snapshot, fetches only the incremental window per symbol and timeframe, and commits the updated snapshot

#### Scenario: Accumulated history is republished

- **WHEN** successive releases accumulate history for a symbol
- **THEN** each release exports every bar the snapshot holds, so the published site's depth grows release over release

### Requirement: The published site is a passive snapshot

The published GitHub Pages site SHALL make no requests to the market data source and SHALL offer no sync capability, including no periodic-refresh control. It SHALL display when its data snapshot was generated so the user knows how fresh it is.

#### Scenario: Browsing the published site

- **WHEN** a user browses charts and toggles indicators on the Pages site
- **THEN** the only network requests are for the site's own static assets and data files, and the snapshot timestamp is visible

#### Scenario: No refresh control on the published site

- **WHEN** a user looks for a way to update the data on the Pages site
- **THEN** neither a sync control nor a periodic-refresh control is present, and the snapshot timestamp is the only indication of data age

### Requirement: Development and release channels are separate

The main branch SHALL remain the development line. Publishing SHALL happen from an explicitly designated release ref/branch so that ongoing development neither blocks nor accidentally alters what is published. A scheduled release SHALL publish from that same release ref, so the schedule never promotes unreleased development work.

#### Scenario: Development continues after a release

- **WHEN** development commits land on main after a release
- **THEN** the published site continues serving the released version until a new release runs

#### Scenario: Scheduled release does not promote development work

- **WHEN** the daily schedule fires while main holds commits that have not been promoted to the release ref
- **THEN** the run publishes the release ref's code, leaving those commits unpublished

### Requirement: Scheduled and manual releases do not overlap

At most one release run SHALL be in flight at a time. When a scheduled run and a manual dispatch coincide, the later one SHALL wait for the running one to finish rather than running concurrently or cancelling it, so two runs never force-push the data snapshot or deploy Pages at the same time.

#### Scenario: Manual dispatch during a scheduled run

- **WHEN** the maintainer dispatches a release while the daily scheduled run is still executing
- **THEN** the dispatched run waits until the scheduled run completes, and neither run is cancelled

#### Scenario: Schedule fires during a manual release

- **WHEN** the daily schedule fires while a manually dispatched release is still executing
- **THEN** the scheduled run waits rather than running alongside it

### Requirement: A missed scheduled release degrades gracefully

The scheduled release SHALL be treated as best-effort: the platform may delay or drop a scheduled run, and the schedule SHALL be resumable by the maintainer if the platform suspends it for repository inactivity. A skipped day SHALL cost nothing beyond freshness — the next run, scheduled or manual, SHALL sync incrementally from the last persisted snapshot and catch up without re-pulling history.

#### Scenario: A scheduled run is skipped

- **WHEN** a day's scheduled run does not fire
- **THEN** the published site keeps serving the previous snapshot, and the next run restores that snapshot and fetches only the widened incremental window

#### Scenario: Published snapshot age stays visible

- **WHEN** a user loads the published site after a missed scheduled release
- **THEN** the displayed snapshot timestamp reflects the last release that actually ran, so staleness is visible rather than implied by the schedule
