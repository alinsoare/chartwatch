## Why

The chartwatch reports page currently lists every take-profit rung from the active rung through R5. The original `xtb-reports` dashboard only shows the **active** rung and the **immediate next** rung (two lines at most), which keeps the ladders tab scannable when many positions are open. Matching that display behavior avoids visual noise without changing ladder math.

## What Changes

- **MODIFIED** `report-dashboard`: in the Open ladders tab, each projecting long ladder SHALL render take-profit lines for the active rung and the next rung only (not R+2 … terminal). Summary facts and compliance flags stay as today; short/unsupported entries unchanged.
- **No change** to `ladder-projection` computation — all five levels remain available in data; only the UI subset changes.

## Capabilities

### Modified Capabilities
- `report-dashboard`: narrow visible TP lines to active + next rung, aligned with the reference HTML dashboard.

### New Capabilities
- None.

## Impact

- `web/reports/render.js` (ladder card level list) and a small render test or manual check.
- No backend, settings, parser, or export pipeline changes.
