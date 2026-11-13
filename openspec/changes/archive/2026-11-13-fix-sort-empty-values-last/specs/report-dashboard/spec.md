## ADDED Requirements

### Requirement: Sort the other reports tables with empty values last

The empty-values-last rule the ranking table already has ("Sort the ranking table with empty values last and signals by severity") SHALL also hold in the open-ladders, watch-list and no-history tables: rows whose sort cell has no value (absent, empty text, or not-applicable) SHALL be placed after every row that has a value, in both sort directions, for every column. Rows that all lack a value on the sort column SHALL keep their relative order in both directions, whichever empty representation each carries. The order among rows that have a value SHALL be unchanged. A ladder with no compliance flags has a value on the Compliance column — the displayed "Compliant" — and SHALL sort by that text, not as empty.

#### Scenario: Watch list unrated rows sort last descending

- **WHEN** the watch list holds rows rated 3, unrated, and 5, and the user sorts by stars descending
- **THEN** the rows order 5, 3, then the unrated row

#### Scenario: Compliant ladders sort by their text

- **WHEN** the open-ladders table holds a compliant ladder (no flags) and a ladder flagged over-budget, sorted by Compliance ascending and then descending
- **THEN** the compliant ladder sorts as "Compliant" (before "over-budget" ascending, after it descending), not last in both

#### Scenario: Non-projecting ladder sorts last by Invested

- **WHEN** the open-ladders table holds projecting rows and a non-projecting row with no invested amount, sorted by Invested descending
- **THEN** the non-projecting row is last

#### Scenario: Mixed empty representations keep their order (failure)

- **WHEN** no-history rows X (open drawdown `n/a`), Y (absent) and Z (empty text), in that input order, are sorted by open drawdown together with one row whose open drawdown is −4.2, descending and then ascending
- **THEN** the row with a value is first and X, Y, Z follow in input order in both directions
