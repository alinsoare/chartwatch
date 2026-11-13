## Why

`sortRows` in `web/reports/render.js` multiplies the empty-value comparison by the sort direction, so sorting any column descending puts rows with no value (unrated stars, no signal, a non-projecting ladder's Invested) at the top. That contradicts the living `report-dashboard` requirement "Sort the ranking table with empty values last and signals by severity". The previous change, `add-ladder-traded-volume`, worked around it for the Volume column only (`EMPTY_LAST_BOTH_WAYS`).

## What Changes

- Empty sort values are placed after every non-empty value in both directions, for every column of every reports table (ranking, open ladders, watch list, no-history), including the signal column. The ranking table's living requirement already demands this; a new requirement extends it to the other three tables.
- A compliant ladder (no flags) sorts by its displayed text "Compliant" on the Compliance column, so the general rule does not sink it in both directions.
- Rows that are all empty on the sort column keep their relative order, whether their empty value is `null`, `""` or `n/a`.
- The Volume-only exception `EMPTY_LAST_BOTH_WAYS` is removed; Volume keeps its behaviour through the general rule.

## Pillars

- scope: seam (report-dashboard table sorting)
- blast: none
- novelty: known
- deps: none

## Guardrails

Must not change the order of non-empty values, what counts as empty (other than a compliant ladder's Compliance key becoming "Compliant"), the default sort column or direction per tab, the signal severity order, or any rendering; no new dependency; touches only `sortRows`/`emptyLastCompare`, the Compliance key in `ladderSortMeta`, and tests.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `report-dashboard`: new requirement "Sort the other reports tables with empty values last"; the ranking requirement is unchanged (the code now meets it).

## Impact

- `web/reports/render.js` (`sortRows`, `emptyLastCompare`, `ladderSortMeta` Compliance key, removal of `EMPTY_LAST_BOTH_WAYS`)
- `tests/js/run_reports_render.mjs` (new sort checks)
