# market-data Specification

## Purpose

Covers fetching OHLC bars from Yahoo Finance, persisting and querying them locally, and the per-timeframe fetch depth and append-only storage rules that guarantee indicators always have enough history.

## Requirements

### Requirement: Supported timeframes are H1, D1 and W1

The system SHALL store bars for three timeframes, all fetched directly from the source: H1 (Yahoo interval `1h`), D1 (`1d`), and W1 (`1wk`). No timeframe is derived locally. No interval finer than H1 SHALL be offered.

Every supported timeframe SHALL be one the source can backfill completely within its own history window, so no supported series carries a risk of permanently unbackfillable gaps. A sub-hourly timeframe SHALL NOT be offered, because the source caps sub-hourly history at 60 days and a gap older than that could never be repaired.

A request naming a timeframe the system does not support SHALL be refused as unknown, naming the supported set, rather than answered with an empty series.

#### Scenario: The finest offered interval is hourly

- **WHEN** a caller enumerates the supported timeframes
- **THEN** it receives H1, D1 and W1, and no sub-hourly interval

#### Scenario: Every supported series backfills completely

- **WHEN** a symbol is synced for the first time after an arbitrarily long idle period
- **THEN** H1, D1 and W1 each backfill to their own fetch depth with no gap the source is unable to serve

#### Scenario: A retired timeframe is refused, not empty

- **WHEN** a candles request names the retired `m15` timeframe
- **THEN** it is refused as an unknown timeframe naming H1, D1 and W1, rather than answered with an empty bar series

### Requirement: Fetch depth is a property of the timeframe

Each timeframe SHALL define how deep an initial backfill reaches, as a property of the timeframe and the source's limits rather than a value the user tunes per run. H1 SHALL fetch as deep as the source serves that interval (about 730 days). D1 and W1, which the source does not cap, SHALL fetch the instrument's full available history. Fetch depth SHALL NOT be adjustable at sync time; a run either extends the series incrementally or re-pulls the timeframe's whole fetch window.

No timeframe's fetch depth SHALL be expressed as a fixed bar count, because every supported timeframe is bounded either by the source's own history window or by the instrument's full history.

#### Scenario: Initial D1 backfill takes the whole history

- **WHEN** a symbol listed since the 1990s is synced for the first time
- **THEN** its D1 series holds every daily bar the source has for it, not a fixed count

#### Scenario: H1 reaches the source's limit

- **WHEN** a symbol's initial H1 backfill runs
- **THEN** it reaches as far back as the 730-day window allows and stops there

#### Scenario: No timeframe carries a bar-count depth

- **WHEN** a caller reads how deep each timeframe backfills
- **THEN** every timeframe's depth is either the source's history window for its interval or the instrument's full history, and none is a fixed number of bars

#### Scenario: Depth cannot be set per run

- **WHEN** a sync is triggered from the UI, the command line, or CI
- **THEN** no bar-count target can be supplied, and each timeframe uses its own fetch depth

### Requirement: Stored bars are never deleted, retired timeframes included

A sync SHALL only add bars and overwrite bars it re-fetched. It SHALL NOT delete stored bars, so a series only ever grows and history the source can no longer serve is preserved indefinitely. Consequently a series MAY hold more bars than its fetch depth, and MAY span further back than the source's own history window.

Bars stored under a timeframe the system no longer supports SHALL likewise be retained rather than deleted, and SHALL be inert: never fetched, never served, never exported, and never read by any screening or charting path. Retiring a timeframe SHALL NOT require a destructive migration of an existing store or a published snapshot.

#### Scenario: H1 accumulates past the source's window

- **WHEN** a symbol is synced regularly over several years
- **THEN** its H1 series retains bars older than 730 days, which the source would no longer return, and keeps growing with each sync

#### Scenario: Repeat syncs never shrink a series

- **WHEN** an incremental sync completes for a symbol
- **THEN** its stored bar count is greater than or equal to what it was before the run, for every timeframe

#### Scenario: A full refresh does not discard older bars

- **WHEN** a full refresh re-pulls a timeframe's fetch window
- **THEN** bars inside the window are refreshed and bars older than the window are left in place

#### Scenario: Rows of a retired timeframe survive and stay unread

- **WHEN** a store that already holds `m15` bars is synced, served and exported after M15 was retired
- **THEN** those rows are still present afterwards, no request fetched them, and no catalog manifest, candles file, screening payload or chart reports them

### Requirement: Backfill respects the data source's history limits

Initial backfill SHALL request the depth its timeframe defines, and requests SHALL be clamped to how far back Yahoo serves the interval (e.g. `1h` is served for at most ~730 days). A request SHALL never ask for more history than the source can return, because Yahoo answers over-deep requests with an empty frame that is indistinguishable from a dead symbol.

#### Scenario: H1 backfill stays inside the 730-day cap

- **WHEN** the initial H1 backfill would reach further back than Yahoo serves `1h` data
- **THEN** the request start is clamped inside the cap and the sync succeeds with the bars that are available

#### Scenario: Full-history request avoids the epoch pitfall

- **WHEN** a full refresh requests maximum available history for an unlimited interval
- **THEN** the request start is a fixed early date after 1970, never the Unix epoch itself, which Yahoo treats as unset

### Requirement: Timestamps are UTC epoch seconds with session-date pinning

All stored bar timestamps SHALL be UTC epoch seconds. Intraday bars keep their true UTC instant. Daily and weekly bars SHALL be pinned to UTC midnight of the exchange-local session date, because Yahoo stamps them at local midnight (22:00 UTC the prior day for Xetra), which would label every daily candle with the previous day's date.

#### Scenario: Xetra daily bar

- **WHEN** Yahoo returns a daily bar for a Xetra-listed instrument stamped 2026-03-09 22:00 UTC (local midnight 2026-03-10)
- **THEN** the bar is stored at 2026-03-10 00:00 UTC

### Requirement: Prices are stored unadjusted

Bars SHALL be stored with unadjusted prices (no dividend/split adjustment), matching what a broker's trading platform displays rather than a back-adjusted history. When the catalog declares a price divisor for an instrument (e.g. pence-quoted tickers), it SHALL be applied on ingest.

#### Scenario: Pence-quoted instrument

- **WHEN** an instrument's catalog entry declares a price divisor of 100
- **THEN** stored prices are the fetched values divided by 100

### Requirement: Incremental fetches with revision overlap

An incremental sync SHALL request only bars from slightly before the newest stored bar onward (a small fixed overlap of recent bars), so Yahoo's late revisions to recent candles overwrite stored values, and repeat syncs stay fast. Only the first sync of a symbol, or an explicit full refresh, performs the deep backfill pull. The incremental start SHALL NOT be pushed forward to the fetch window's start, because a series is allowed to extend further back than that window.

#### Scenario: Repeat sync is small

- **WHEN** a symbol was synced recently and is synced again incrementally
- **THEN** the request covers only the overlap window plus new bars, not the timeframe's full fetch depth

#### Scenario: Revised bar is overwritten

- **WHEN** Yahoo has revised a recent bar that is already stored
- **THEN** after the next sync the stored bar reflects the revised values

#### Scenario: A sync never re-downloads the whole series

- **WHEN** an already-synced symbol is synced without full refresh, however deep its stored series has grown
- **THEN** the request window runs from just before its newest stored bar to the present, and the size of the request does not grow with the stored depth

### Requirement: Empty responses are disambiguated

When a fetch returns no bars, the system SHALL distinguish a dead or mistyped ticker from a live instrument with no new bars, using instrument metadata from the same response, and SHALL report the dead-ticker case as an error naming the symbol.

#### Scenario: Delisted or wrong ticker

- **WHEN** a fetch returns no bars and the source has no metadata for the ticker
- **THEN** the sync records an error for that symbol suggesting the ticker may be wrong or delisted

#### Scenario: No new bars

- **WHEN** a fetch returns no bars but the source knows the instrument
- **THEN** the sync records success with a "no new bars" note and the observed currency
