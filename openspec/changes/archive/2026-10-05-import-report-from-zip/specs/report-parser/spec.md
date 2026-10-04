## MODIFIED Requirements

### Requirement: Import an XTB xlsx report via a user-operated control

The system SHALL offer a file-picker (or drag-and-drop) control that the user operates explicitly to choose one `.xlsx` file, or one `.zip` archive that contains exactly one `.xlsx` report. The system SHALL NOT read, poll, or watch any location for a report file on its own; import SHALL happen only in response to that direct user action.

The system SHALL unzip and parse the workbook using only browser-native APIs (the file's own bytes plus `DecompressionStream`/`Blob`/`ArrayBuffer`), with no server round trip and no third-party parsing library.

When the chosen file is a `.zip` archive, the system SHALL locate the report among the archive's entries wherever it sits in the folder structure, ignoring directory entries, hidden or system entries (such as `__MACOSX/` and names beginning with `._`), and entries that are not `.xlsx` files, and SHALL then treat that report exactly as if the user had chosen it directly. An archive with no `.xlsx` report, or with more than one, SHALL be rejected with a message that names which case applies (and, for more than one, lists the report names found), without altering any previously cached state.

A workbook SHALL be accepted only when it contains all three of the `Closed Positions`, `Open Positions`, and `Cash Operations` sheets.

#### Scenario: User picks a file

- **WHEN** the user selects a `.xlsx` file through the import control
- **THEN** the system reads it locally in the browser and begins parsing, making no network request

#### Scenario: Not a valid XTB export

- **WHEN** the selected file cannot be unzipped, or lacks any of the Closed Positions, Open Positions, or Cash Operations sheets
- **THEN** the system reports that the file is not a recognized XTB report, naming what is missing, and does not alter any previously cached state

#### Scenario: Zip with a report inside a folder

- **WHEN** the user selects a `.zip` whose only `.xlsx` is at `reports/12345678/EUR_12345678_2006-01-01_2026-10-02.xlsx`
- **THEN** the report is imported with the same result as selecting that `.xlsx` directly, with no network request

#### Scenario: Archive junk is ignored

- **WHEN** the selected `.zip` also contains a `__MACOSX/` folder with `._*.xlsx` entries, text files, or empty directories alongside one real `.xlsx`
- **THEN** only the real `.xlsx` is considered and imported

#### Scenario: Zip without a report

- **WHEN** the selected `.zip` contains no `.xlsx` file
- **THEN** the system reports that the archive contains no .xlsx report and does not alter any previously cached state

#### Scenario: Zip with several reports

- **WHEN** the selected `.zip` contains two or more `.xlsx` files
- **THEN** the system rejects it, states that exactly one report is expected, lists the names found, and does not alter any previously cached state
