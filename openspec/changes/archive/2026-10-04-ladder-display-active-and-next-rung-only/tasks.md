## 1. Spec alignment and render filter

- [x] 1.1 In `web/reports/render.js`, restrict each ladder card's take-profit list to rungs where `active <= rung <= active + 1` (reference: `xtb-reports` `visible_tp_levels`); verify scenario "Basis is on every visible line" — R2 ladder shows R2 and R3 only
- [x] 1.2 Verify scenario "Terminal active rung shows one line" — mock or fixture ladder on R5 renders a single TP line
- [x] 1.3 Verify scenario "Active R1 shows current and next only" — R1 active ladder shows R1 and R2, not R3–R5

## 2. Regression checks

- [x] 2.1 Confirm ACTIVE and RECOMMENDED markers still attach to the visible lines when active and recommended rungs differ; verify "Markers never coincide"
- [x] 2.2 Run `node tests/js/run_reports_ladder.mjs` and any render-related checks; add or extend a focused test for visible rung count if practical
- [x] 2.3 Manual smoke on `web/reports/` with a real import: ladders tab shows two lines (or one on R5) per long ladder

## 3. Release

- [x] 3.1 Run `openspec validate ladder-display-active-and-next-rung-only --strict` after implementation
