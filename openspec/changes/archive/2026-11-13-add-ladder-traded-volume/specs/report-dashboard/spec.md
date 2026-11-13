## ADDED Requirements

### Requirement: Show each open ladder's traded volume next to its leg count

The open-ladders table SHALL have a Volume column placed immediately after the Legs column. For every ladder row — projecting, short, or no-projection — the Volume cell SHALL show the sum of the volume of that row's open legs (the legs grouped into that row by ticker and direction), as parsed from the report's Volume column. The value SHALL render without floating-point artefacts, keep genuine fractional volumes, group thousands, and follow the table's numeric presentation. When the row has no legs or any of its legs has no parsable volume, the cell SHALL read as not-applicable (`n/a`, the table's existing not-applicable presentation) with the reason available on hover, never a partial sum or zero. The column SHALL be sortable as a numeric column, with not-applicable cells last in either direction.

#### Scenario: Fractional legs sum without float noise

- **WHEN** a ladder row holds two legs of volume 0.4 and 0.21
- **THEN** its Volume cell reads `0.61`

#### Scenario: Whole-share legs sum

- **WHEN** a ladder row holds legs of volume 500, 200, 200 and 80
- **THEN** its Volume cell reads `980`

#### Scenario: Thousands are grouped

- **WHEN** a ladder row's legs sum to 1000
- **THEN** its Volume cell reads `1,000`

#### Scenario: Non-projecting rows show volume

- **WHEN** a short ladder row (unsupported for projection) holds legs of volume 3 and 2
- **THEN** its Volume cell reads `5`

#### Scenario: Volume column follows Legs

- **WHEN** the open-ladders table renders
- **THEN** the Volume header is the column immediately after the Legs header

#### Scenario: Missing leg volume is not-applicable (failure)

- **WHEN** a ladder row holds a leg with volume 10 and a leg whose volume cell was empty or unparsable
- **THEN** its Volume cell reads `n/a` with the hover reason "Volume missing for one or more legs", not `10` and not `0`

#### Scenario: Sorting by volume puts missing values last (failure)

- **WHEN** the user sorts the open-ladders table by Volume descending, with rows summing to 5, 980 and one not-applicable row
- **THEN** the rows order 980, 5, then the not-applicable row
