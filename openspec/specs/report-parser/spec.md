# report-parser Specification

## Purpose
Parses a user-imported XTB account report `.xlsx` file, entirely in the browser, into normalized closed-trade, open-leg, and cash-flow records plus report metadata suitable for ranking and ladder projection, with no server involved and no file content leaving the browser.

## Requirements

### Requirement: Import an XTB xlsx report via a user-operated control

The system SHALL offer a file-picker (or drag-and-drop) control that the user operates explicitly to choose one `.xlsx` file. The system SHALL NOT read, poll, or watch any location for a report file on its own; import SHALL happen only in response to that direct user action.

The system SHALL unzip and parse the workbook using only browser-native APIs (the file's own bytes plus `DecompressionStream`/`Blob`/`ArrayBuffer`), with no server round trip and no third-party parsing library.

A workbook SHALL be accepted only when it contains all three of the `Closed Positions`, `Open Positions`, and `Cash Operations` sheets.

#### Scenario: User picks a file

- **WHEN** the user selects a `.xlsx` file through the import control
- **THEN** the system reads it locally in the browser and begins parsing, making no network request

#### Scenario: Not a valid XTB export

- **WHEN** the selected file cannot be unzipped, or lacks any of the Closed Positions, Open Positions, or Cash Operations sheets
- **THEN** the system reports that the file is not a recognized XTB report, naming what is missing, and does not alter any previously cached state

### Requirement: Extract report metadata

The system SHALL extract from the workbook the account identifier, the report period (start and end dates), the realized profit/loss total the report itself states, and the open position value the Open Positions sheet states in its header. The period's end date SHALL be exposed as the report's **as-of date**, which every time-dependent downstream figure is anchored to.

#### Scenario: As-of date is the period end

- **WHEN** the imported report covers 2006-01-01 to 2026-10-02
- **THEN** the report's as-of date is 2026-10-02

### Requirement: Parse Closed Positions into trade records

The system SHALL read the Closed Positions sheet and produce one record per realized trade with ticker, instrument name, category, trade direction, open/close times, profit/loss, purchase value, posted margin, and a percentage basis.

Trade direction SHALL be taken from the sheet's `Type` column and normalized to *long* for `BUY` and *short* for `SELL`; a row whose direction cannot be determined SHALL still produce a record, with direction reported as unknown rather than defaulted to long.

The recorded profit/loss SHALL be the sheet's `Profit/Loss` value as-is (already net of swap, commission, and rollover); the system SHALL NOT subtract those cost columns again. No row SHALL be excluded on the basis of its category, and a trailing total row SHALL be excluded from trade records.

#### Scenario: Every category parsed

- **WHEN** the sheet contains rows in `CFD`, `ETF`, `ETC`, `ETN`, and `STOCK`
- **THEN** a trade record is produced for every one of them, each carrying its own category

#### Scenario: Costs are not double-counted

- **WHEN** a trade row reports a non-zero swap alongside `Profit/Loss`
- **THEN** the recorded profit/loss equals the row's `Profit/Loss` value, not that value reduced again by the swap

### Requirement: Parse Open Positions into grouped legs

The system SHALL distinguish instrument group header rows from individual position rows and attach each position leg to its ticker with instrument name, position identifier, open price, current price, volume, open time, and trade direction, normalized the same way as closed trades. A leg whose direction cannot be determined SHALL be reported as unknown. No leg SHALL be excluded on the basis of its category.

#### Scenario: Multi-rung ladder

- **WHEN** one ticker has four position rows under a group header
- **THEN** four open legs are produced sharing the same ticker

### Requirement: Parse tax entries and retain every Cash Operations row

The system SHALL extract `RO tax` and `Tax IFTT` rows and associate each with a ticker when present in the comment or ticker column. Separately, the system SHALL retain every row of the Cash Operations sheet as a signed cash-flow record and expose **free cash** as the sum of that sheet's `Amount` column, excluding the sheet's own trailing `Total` row.

#### Scenario: RO tax comment parsing

- **WHEN** a comment reads `RO tax COPX.UK 2026-08-21 ...`
- **THEN** the tax entry ticker is `COPX.UK`

#### Scenario: Free cash matches the sheet's own total

- **WHEN** the Cash Operations sheet's non-`Total` rows sum to 250.00 EUR
- **THEN** free cash is reported as 250.00 EUR, matching the sheet's own `Total` row exactly

### Requirement: De-duplicate within the imported workbook, retaining partial closes

Closed trades SHALL be de-duplicated within the single imported workbook by agreement on position identifier, close time, open time, volume, and profit/loss. Rows that share a position identifier and close time but differ in volume or profit/loss are partial closes of one position and SHALL each be retained as separate trades, so the parsed total reconciles with the report's own stated realized total. Open legs SHALL be de-duplicated by position identifier.

#### Scenario: Partial closes retained

- **WHEN** one workbook reports three rows sharing one position ID and close time, with differing volumes and profits
- **THEN** all three are retained as separate closed trades rather than collapsed into one

### Requirement: Determine a percentage basis for every closed trade

Every closed trade SHALL carry a positive percentage basis wherever the source data allows one, selected by the first of the following present and non-zero: purchase value, margin, then volume × open price (notional). The system SHALL expose which basis was used, since a return computed on margin is leveraged and not comparable to one computed on cash outlay. When no source yields a positive value, the trade's percentage return SHALL be reported as undefined rather than zero, and excluded from percentage- and velocity-based aggregates while still counting toward trade count, win rate, and absolute profit/loss.

#### Scenario: Margin product falls back to margin

- **WHEN** a CFD trade reports an empty purchase value, a margin of 564.26, and a profit of -50.59
- **THEN** its basis source is margin and its percentage return is -50.59 / 564.26

### Requirement: Preserve sub-hour holding durations

The system SHALL report a closed trade's holding duration as elapsed time between open and close, floored at one second rather than one hour, so intraday trades are not all reported with the same duration.

#### Scenario: Sub-hour trade

- **WHEN** a trade is opened and closed 557 seconds apart
- **THEN** its holding duration is reported as 557 seconds, not one hour

### Requirement: Reconcile parsed trades against the report's own stated total

The sum of parsed closed-trade profit/loss SHALL equal the realized total stated in the imported report, within one cent. When the two disagree, the system SHALL surface the discrepancy to the user rather than presenting the parsed figures as complete.

#### Scenario: Discrepancy is surfaced

- **WHEN** the parsed closed trades sum to a figure differing from the report's stated realized total by more than one cent
- **THEN** the page states the difference and the number of trades parsed, rather than failing silently

### Requirement: Derive account equity from free cash and open position value

The system SHALL expose **account equity** as free cash plus the open position value stated in the Open Positions sheet's own header — both whole-account snapshot totals as of the report's as-of date. When no open-position-value header is present, the system SHALL report equity as **undeterminable**, stating the reason, rather than defaulting to zero or to an unbounded value.

#### Scenario: Equity reconciles

- **WHEN** the imported report states free cash of 250.00 EUR and an open position value of 19,750.00 EUR
- **THEN** equity is reported as 20,000.00 EUR

#### Scenario: Undeterminable equity is stated, not defaulted

- **WHEN** the Open Positions sheet carries no open-position-value header
- **THEN** equity is reported as undeterminable with a stated reason, not as zero and not as unbounded
