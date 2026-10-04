## 1. Unwrap logic

- [x] 1.1 In `web/reports/parse.js`, add a helper that, given the entries from `unzipXlsx`, returns the workbook entries directly when `xl/workbook.xml` exists, otherwise selects the single `.xlsx` entry (ignoring directories, `__MACOSX/`, `._*`, `~$*`) and unzips it; verify with a unit test that a plain `.xlsx` still parses identically
- [x] 1.2 Return `{ ok: false, error }` for an archive with no `.xlsx` (message says so) and for several (message lists the names); verify with unit tests for both cases

## 2. Import entry points

- [x] 2.1 Update `web/reports/app.js` to accept `.xlsx` and `.zip` names with the message "Please choose an .xlsx or .zip file."; update the `accept` list in `web/reports/index.html`; verify a `.txt` file is still rejected and cached state is untouched on every rejection

## 3. Tests and verification

- [x] 3.1 Extend `tests/js/run_reports_xlsx.mjs` with fixtures built in-test: zip wrapping `folder/sub/report.xlsx`, zip with `__MACOSX/._report.xlsx` junk plus one real report, empty zip, and two-report zip; verify all pass via `node tests/js/run_reports_xlsx.mjs`
- [x] 3.2 Run all `tests/js/run_reports_*.mjs` and verify they pass; zip the sample `~/xtb-reports/reports/51940879/` folder and confirm the browser import of the `.zip` renders the same dashboard as the bare `.xlsx` (note honestly if the file picker cannot be driven)

**3.2 verification notes:** All four `tests/js/run_reports_*.mjs` scripts pass. Zip parity for `~/xtb-reports/reports/51940879/EUR_51940879_2006-01-01_2026-10-02.xlsx` (Python `zipfile` wrapper, temp dir removed after) matches bare `.xlsx` on closed/open counts and account metadata via `parseReportFile`. Real browser file-picker import was not exercised in this session (not driven); dashboard equivalence is inferred from parser parity only. `.txt` rejection and cache untouched on rejection verified by code review (`onFile` returns before `handleImport` / `saveReport`).
