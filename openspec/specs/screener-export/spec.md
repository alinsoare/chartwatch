# screener-export Specification

## Purpose

Exposes the accumulation screener's per-instrument results as a static, versioned JSON artifact — `data/screener-scores.json` — so tools outside the browser can read the same screening facts the sidebar shows without re-deriving them from raw bars.

## Requirements

### Requirement: Screener scores are exported as a standalone artifact

The system SHALL produce a `data/screener-scores.json` artifact, served by the dev backend and written by the static exporter with identical content, carrying one entry per **catalog** symbol — enabled and disabled alike — keyed by `ticker`.

Each entry SHALL carry exactly the fields `scoreInstrument()` produces for that instrument: `status` (`screened` | `insufficient-history` | `not-screened`), `score`, `marks`, `reasons` (each with `rule`, `points`, `source`), `rangePct`, `positionPct`, and `headroomPct`. The artifact SHALL NOT carry raw bars, targets, entries, stops, position sizes, or recommendation language — it is the scored result only, not the inputs used to compute it and not a suggestion of what to do with it.

A disabled catalog symbol, or one otherwise absent from the scan payload, SHALL appear in the artifact with `status: "not-screened"`, matching what the browser already reports for such a symbol.

#### Scenario: Every catalog symbol is present

- **WHEN** the artifact is built from a catalog holding both enabled and disabled symbols
- **THEN** every catalog symbol has an entry, keyed by its `ticker`

#### Scenario: A disabled symbol is not-screened

- **WHEN** a catalog symbol is disabled
- **THEN** its entry in the artifact has `status: "not-screened"`, with no score, no marks and no reasons

#### Scenario: A screened entry matches the scoring result

- **WHEN** an enabled symbol has sufficient stored history to be screened
- **THEN** its entry's `status`, `score`, `marks`, `reasons`, `rangePct`, `positionPct` and `headroomPct` equal what `scoreInstrument()` computes for that symbol from the same stored bars

#### Scenario: No raw bars or recommendations leak into the artifact

- **WHEN** the artifact is inspected for any single symbol
- **THEN** it contains no OHLC bar data and no target, entry, stop, position size, or buy/sell language

### Requirement: The scoring result is computed once, from stored bars, at export time

The artifact SHALL be computed exclusively from bars already persisted locally at the time it is built — never by fetching from a live market-data source, an API, or a websocket. Building the artifact SHALL NOT change any instrument's stored bars, sync state, or last-sync timestamp.

The scoring logic used to build the artifact SHALL be the same scoring logic the browser uses when it screens on load. The artifact SHALL NOT implement a second, independently maintained scoring path: the rules, weights, and constants that decide `score`, `marks`, and `reasons` SHALL come from a single source of truth shared with the in-browser screener.

#### Scenario: Building the artifact makes no network call

- **WHEN** the artifact is built for a given data store
- **THEN** no request is made to Yahoo Finance or any other external market-data source, and no instrument's stored bars or sync state changes

#### Scenario: The artifact agrees with the browser

- **WHEN** the same data store backs both the artifact and a browser session that runs the on-load scan
- **THEN** every symbol's `status`, `score`, `marks` and `reasons` in the artifact match what the browser's scan produces for that symbol

### Requirement: The artifact declares its snapshot time and scoring model version

The artifact SHALL carry `generated_utc`, aligned with the same snapshot generation time as `catalog.json` and `scan-bars.json` for the same export or dev request, so a consumer can confirm which sync cycle the scores describe.

The artifact SHALL carry `scoring_model_version`, an integer that increases whenever a change to the scoring rules, weights, or the set of fields a scored entry carries would make a previously exported artifact's entries inconsistent with what the current scoring logic would produce. A consumer reading two artifacts with different `scoring_model_version` values SHALL NOT assume their scores are comparable.

The artifact MAY additionally carry summary counts (for example a total symbol count, an enabled-symbol count, and a screened-symbol count) describing the export it accompanies.

A consumer SHALL be able to ignore any field in the artifact it does not recognize: adding a new field to the artifact SHALL NOT be treated as a breaking change, while removing or renaming an existing field, or changing `scoring_model_version`'s meaning, SHALL be.

#### Scenario: Snapshot time matches the catalog

- **WHEN** the artifact, `catalog.json` and `scan-bars.json` are produced by the same export or the same dev request
- **THEN** all three carry the same `generated_utc`

#### Scenario: Scoring model version is present and stable

- **WHEN** the artifact is built twice from the same store with no scoring rule change in between
- **THEN** both artifacts carry the same `scoring_model_version`

#### Scenario: An unrecognized field does not break a consumer

- **WHEN** a future export adds a new field to the artifact or to an entry within it
- **THEN** a consumer that ignores unrecognized fields keeps working without changes

### Requirement: The artifact regenerates on every export regardless of score change

The artifact SHALL be rebuilt and rewritten on every export run — including the twice-daily scheduled release — even when no instrument's computed score differs from the previous export, so its `generated_utc` always reflects the export that produced it rather than the export that last changed a score.

#### Scenario: An export with no score changes still rewrites the artifact

- **WHEN** a scheduled release runs and every instrument's score is identical to the previous release's
- **THEN** the artifact is still rewritten, and its `generated_utc` reflects the new release rather than the previous one
