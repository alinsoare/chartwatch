# instrument-catalog Specification

## Purpose

Defines the hand-curated instrument list the app charts, the catalog schema (`ticker` and `display_name`), and the portfolio-compatibility rules that warn about instruments unsuitable for a EUR-based real-asset portfolio.

## Requirements

### Requirement: Catalog is the single source of truth for instruments

The system SHALL define all instruments in a single hand-maintained catalog file. Each entry SHALL carry at minimum: the Yahoo Finance ticker, a human-readable display name, asset class, instrument type, exchange, expected quote currency, point size, an optional price divisor, and an enabled flag. The ticker SHALL be the catalog's sole identifier for an instrument: it is used both to key stored data and to query the market data source, and no separate broker-specific symbol SHALL be carried alongside it. No other part of the system SHALL define or hardcode instruments.

#### Scenario: Adding an instrument

- **WHEN** a maintainer adds a row to the catalog file and reloads the app
- **THEN** the new instrument appears in the symbol browser and is included in the next sync, with no code changes required

#### Scenario: Disabled instrument

- **WHEN** an entry's enabled flag is off
- **THEN** the instrument is excluded from sync runs while remaining visible in the catalog

### Requirement: CFD detection from instrument type

The system SHALL classify an instrument as a CFD by reading the catalog's `instrument_type` field, which is set to `"CFD"` for CFD instruments and `"REAL"` otherwise. Yahoo Finance has no concept of a CFD, so this field — set by the maintainer when the row is added — is the only signal available.

#### Scenario: CFD and non-CFD variants of the same underlying

- **WHEN** the catalog contains two rows for the same underlying company, one with `instrument_type` set to `"CFD"` and one set to `"REAL"`
- **THEN** the first is classified as a CFD and the second is not

### Requirement: Portfolio compatibility flags

The system SHALL flag an instrument as portfolio-incompatible when its quote currency is not EUR or when it is a CFD. The flag SHALL be a visible warning only: incompatible instruments still sync and chart normally.

#### Scenario: Non-EUR instrument

- **WHEN** an instrument's effective quote currency is GBP
- **THEN** the instrument is flagged with a "not EUR" warning and its chart remains fully functional

#### Scenario: CFD instrument

- **WHEN** an instrument is classified as a CFD
- **THEN** it is flagged with a CFD warning and its chart remains fully functional

### Requirement: Quote currency verified against the data source

The system SHALL prefer the quote currency observed from Yahoo during a sync over the hand-typed catalog value when evaluating compatibility, and SHALL surface a discrepancy between the two as a warning.

#### Scenario: Catalog value is wrong

- **WHEN** the catalog declares EUR but Yahoo reports USD for the instrument
- **THEN** compatibility is evaluated against USD, the instrument is flagged as not EUR, and the catalog/observed mismatch is reported as a warning

### Requirement: Broker reports are a source of candidates, not of catalog rows

The system SHALL provide a way to read the broker account statements kept in the reports
directory, collect every distinct instrument ticker they name, and report which of those
tickers the catalog does not yet cover. Reading the reports SHALL NOT modify the catalog:
the tool SHALL emit proposed rows for a maintainer to review, complete, and commit by
hand, leaving the catalog file untouched when it runs. Every report file in the directory
SHALL be considered, and a ticker named in more than one file or sheet SHALL be reported
once.

A statement names an instrument in several places with different layouts — closed
positions, cash operations, open positions — and the open-positions listing repeats a
holding's ticker on per-lot rows whose instrument cell holds a numeric position
identifier rather than a name. The system SHALL take the instrument name from a row that
carries one and SHALL NOT treat a position identifier as an instrument name.

#### Scenario: Reporting what the catalog is missing

- **WHEN** a maintainer runs the import against a reports directory naming instruments the catalog does not list
- **THEN** each missing ticker is reported once with the instrument name found in the report, and the catalog file is unchanged on disk

#### Scenario: Instruments already catalogued

- **WHEN** a report names a ticker the catalog already carries
- **THEN** that ticker is not proposed as an addition and the existing entry's fields are left alone

#### Scenario: Several reports in the directory

- **WHEN** the directory holds more than one statement and a ticker appears in both
- **THEN** it is reported once, not once per file

#### Scenario: Per-lot rows of an open position

- **WHEN** a statement's open-positions sheet lists a holding followed by per-lot rows whose instrument cell is a numeric position identifier
- **THEN** the ticker is reported once with the holding's instrument name, and no entry is created from a position identifier

#### Scenario: A row with no ticker

- **WHEN** a statement row has no ticker, as a cash operation such as a tax or deposit entry does
- **THEN** it contributes no instrument to the import

### Requirement: Curated symbol shortlists are a source of catalog candidates

The system SHALL treat the hand-kept symbol shortlists in the reports directory — a plain-text file per instrument family, one instrument per line, beginning with a ticker — as a source of candidate instruments for the catalog, on the same footing as broker statements. Every distinct ticker named across the shortlists SHALL be considered exactly once, however many files or lines name it. A ticker the catalog already carries SHALL NOT be proposed again and its existing row SHALL be left untouched, including its enabled flag, its resolved Yahoo Finance ticker, and its display name.

The descriptive fields a shortlist carries beside the ticker — provider, UCITS wrapper, accumulating or distributing, currency, or a short instrument label — are hints for the maintainer completing a row. They SHALL NOT be written automatically to the entry's display name; the maintainer fills that field by hand, informed by the hints and the report data, rather than having it assembled from shortlist attributes.

#### Scenario: A ticker named by a shortlist and absent from the catalog

- **WHEN** a shortlist names a ticker the catalog does not carry
- **THEN** it is reported once as a candidate, with the shortlist's descriptive fields shown as hints

#### Scenario: A ticker named by a shortlist and already catalogued

- **WHEN** a shortlist names a ticker the catalog already carries
- **THEN** no candidate is proposed for it and the existing row's fields, including its enabled flag, are unchanged

#### Scenario: The same ticker in more than one shortlist

- **WHEN** two shortlists name the same ticker, or one shortlist names it twice
- **THEN** it yields a single candidate, and the catalog gains at most one row for it

#### Scenario: Shortlist attributes are not the display name

- **WHEN** a shortlist line reads `VVSM.DE, VanEck, UCITS, ACC, EUR`
- **THEN** the resulting candidate's display name is left for the maintainer to fill, not assembled from the shortlist's attributes

### Requirement: A catalogued instrument has verified historical data at the data source

The system SHALL admit an instrument to the catalog only when its Yahoo Finance ticker has been verified to both resolve at the market data source and return historical daily bars. Verification SHALL be evidence from the data source itself — a request for daily bars over a lookback window that comes back with at least one bar — and SHALL NOT be inferred from the ticker's shape, its suffix, or the fact that a related ticker works.

A candidate that resolves but returns no bars, and a candidate whose ticker cannot be resolved at all, SHALL NOT be added to the catalog. Each rejected candidate SHALL be recorded with the ticker tried and the reason it failed, so a later attempt starts from what was already ruled out rather than repeating it.

A candidate that passes verification SHALL be added with its enabled flag on, because the only stated reason to add it off — an unconfirmed data-source ticker — no longer applies once the ticker has returned bars.

#### Scenario: Candidate returns bars

- **WHEN** a candidate's data-source ticker returns daily bars over the lookback window
- **THEN** it is added to the catalog with its enabled flag on and is included in the next sync run

#### Scenario: Candidate resolves but has no bars

- **WHEN** a candidate's ticker is recognised by the data source but returns no bars over the lookback window
- **THEN** no catalog row is created for it and it is recorded as rejected with that reason

#### Scenario: Candidate ticker cannot be resolved

- **WHEN** no data-source ticker can be found for a candidate drawn from a broker report or shortlist
- **THEN** no catalog row is created for it and it is recorded as rejected with the tickers that were tried

#### Scenario: A plausible ticker is not evidence

- **WHEN** a candidate's data-source ticker is derived from a broker's reported ticker by the exchange suffix mapping but has never been requested from the data source
- **THEN** it is not treated as verified and no catalog row is created until bars come back

### Requirement: Catalog entries whose data source returns nothing are removed

The system SHALL hold every existing catalog entry to the same data-availability bar as a new one, and SHALL remove an entry whose data-source ticker returns no historical bars and cannot be corrected to a ticker that does. Removal SHALL be the outcome only of a failed data-source probe: an entry that returns bars SHALL be kept regardless of its enabled flag or its portfolio-compatibility flags, because being switched off or being flagged incompatible says nothing about whether data exists.

Where a failing entry's instrument is still available at the data source under a different ticker, correcting the entry's ticker SHALL be preferred over removing the entry.

#### Scenario: Existing entry has no data

- **WHEN** a catalogued instrument's data-source ticker returns no bars and no working replacement ticker is found
- **THEN** its row is removed from the catalog and it no longer appears in the symbol browser

#### Scenario: Disabled entry that still has data

- **WHEN** an entry's enabled flag is off but its data-source ticker returns bars
- **THEN** the entry is kept, still disabled, and is not removed

#### Scenario: Incompatible entry that still has data

- **WHEN** an entry is flagged portfolio-incompatible for being a CFD or quoted outside EUR but its ticker returns bars
- **THEN** the entry is kept and the flag remains a warning only

#### Scenario: Entry recoverable under another ticker

- **WHEN** a catalogued instrument's recorded ticker returns nothing but the instrument is found at the data source under a different ticker that returns bars
- **THEN** the entry's data-source ticker is corrected and the entry is kept

### Requirement: Exchange suffix mapping covers the venues the candidate lists name

The system's mapping from a broker-reported ticker suffix to an exchange, an expected quote currency, and a data-source ticker suffix SHALL cover every venue named by the candidate sources it reads, including Euronext Brussels, BME Madrid, Oslo Børs, and Nasdaq Stockholm alongside the venues already mapped. A suffix the mapping does not know SHALL leave the derived fields empty for the maintainer to fill rather than producing a guessed ticker.

#### Scenario: A newly mapped venue

- **WHEN** a candidate's broker-reported ticker ends in the suffix for Euronext Brussels
- **THEN** the proposed row carries that exchange, its expected quote currency, and a data-source ticker built with that venue's data-source suffix

#### Scenario: An unmapped venue

- **WHEN** a candidate's broker-reported ticker ends in a suffix the mapping does not cover
- **THEN** the exchange and quote currency fields are left empty and no data-source suffix is invented

### Requirement: Verification reports, it does not edit the catalog

The system SHALL provide a way to run data-availability verification over a set of symbols — the catalog, a candidate list, or an explicit selection — and report per symbol whether the ticker resolved and whether bars came back. Running verification SHALL leave the catalog file untouched on disk; acting on the report is the maintainer's edit to make.

#### Scenario: Verification run over the catalog

- **WHEN** a maintainer verifies the whole catalog
- **THEN** each entry is reported as having data or not, and the catalog file is byte-for-byte unchanged afterwards

#### Scenario: Verification run over candidates

- **WHEN** a maintainer verifies the candidates drawn from the shortlists
- **THEN** each candidate is reported with the ticker tried and its outcome, and no rows are written to the catalog

### Requirement: An instrument whose data source ticker is unresolved is added disabled

A catalog entry SHALL NOT be committed with a guessed data-source ticker. Where the
maintainer cannot confirm the instrument's ticker at the market data source, the entry
SHALL NOT be committed at all: an unverifiable candidate is recorded as rejected rather
than parked in the catalog as a disabled row, so that every row present is a row with
data behind it.

An entry already in the catalog with its enabled flag off SHALL remain supported: the
flag marks an instrument the maintainer has chosen to exclude from sync runs, and such an
entry SHALL still hold a ticker that returns bars.

#### Scenario: Ticker cannot be confirmed

- **WHEN** an instrument from a candidate source has no confirmed ticker at the data source
- **THEN** no catalog entry is created for it, and the rejection is recorded with the reason

#### Scenario: Ticker root differs from the broker-reported ticker

- **WHEN** an instrument's resolved Yahoo Finance ticker shares neither root nor suffix with the ticker reported by the broker statement or shortlist it came from
- **THEN** the confirmed Yahoo Finance ticker is recorded as the catalog's ticker and the entry is enabled, rather than the broker-reported ticker being reused as a guess

#### Scenario: Maintainer excludes a working instrument

- **WHEN** a maintainer switches off an entry whose ticker returns bars
- **THEN** the entry stays in the catalog, is skipped by sync runs, and remains visible in the symbol browser
