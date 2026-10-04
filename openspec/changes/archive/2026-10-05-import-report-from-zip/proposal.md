## Why

XTB reports are often kept or shared as a folder of exports, and a user may hold them as a `.zip` (for example `reports/12345678/EUR_12345678_….xlsx` zipped as a folder). Today the import control rejects anything that is not a `.xlsx`, forcing the user to unzip by hand first.

## What Changes

- **MODIFIED** `report-parser`: the import control SHALL also accept a `.zip` archive. The archive may hold the report at its root or inside folders. The system finds the single `.xlsx` report inside (ignoring folder entries, hidden/system entries such as `__MACOSX/` and `._*`, and non-`.xlsx` files) and imports it exactly as if it had been chosen directly.
- A ZIP containing **no** `.xlsx`, or **more than one**, is rejected with a clear message and leaves any cached state untouched (a new import replaces rather than merges, so picking among several is out of scope).
- Everything stays local and browser-native, reusing the existing ZIP reader; no network request and no new dependency.
- **No change** to the parsed data model, rankings, ladders, caching, confirmation prompt, or screener check.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `report-parser`: import accepts a `.zip` wrapping a single `.xlsx` report.

## Impact

- `web/reports/app.js` (file-name check), `web/reports/index.html` (`accept` list), `web/reports/parse.js` (detect an archive that wraps a workbook and unwrap it before parsing).
- New unit coverage in `tests/js/run_reports_xlsx.mjs` for the unwrap cases.
- No backend or data changes.
