## Why

The Open ladders table shows how many legs each instrument holds (Legs column) but not how many units those legs add up to. The parser already reads each leg's Volume from the XTB report, so the position size is known but never shown; the user has to open the report to see it.

## What Changes

- Add a **Volume** column to the Open ladders table, immediately after Legs: the sum of the volume of the instrument's legs in that row (ticker and direction), for projecting and non-projecting (short, no-projection) rows alike.
- Show fractional volumes without floating-point noise (0.4 + 0.21 reads `0.61`), group thousands like the EUR columns, and read `n/a` with a hover reason (the table's existing not-applicable cell) when any leg's volume is missing.
- The column is sortable like its neighbours: numeric, missing values last.

## Pillars

- scope: seam (report-dashboard ladders table)
- blast: none
- novelty: known
- deps: none

## Guardrails

Must not change the parser, `ladder.js`, the ladder output shape, the summary's Legs stat, the ranking/watch/no-history tables, or any other column; no new dependency; no change to how legs are grouped into rows; the take-profit detail row's colspan must keep spanning every column (derived from `LADDER_COLUMNS.length`).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `report-dashboard`: new requirement "Show each open ladder's traded volume next to its leg count".

## Impact

- `web/reports/render.js` (ladders table columns, sort metadata, volume helpers)
- `tests/js/run_reports_render.mjs` (new, picked up by `gate_quick`'s `run_*.mjs` glob)
