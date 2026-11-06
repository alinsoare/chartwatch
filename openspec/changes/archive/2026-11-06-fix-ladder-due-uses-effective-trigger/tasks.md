## 1. Plan state on effective trigger (seam: ladder)

- [x] 1.1 Add synthetic FTGA.DE-like checks to `tests/js/run_reports_ladder.mjs` (legs 3 @ 31.695, 4 @ 29.84, 11 @ 28.62, 10 @ 27.255 in open-time order): at 27.365 assert active rung 2, R3 (`levels[2]`) plan state `awaiting trigger` and recommendation null; at 25.6 assert R3 plan state `due`. Confirm the 27.365 check fails on the current code.
- [x] 1.2 In `web/reports/ladder.js`, make `planState` take the base price and the rung's trigger percent as arguments and pass `basePrice` and `effectiveTriggers[k]` from `computeLadders`; remove `settings._basePrice` (no remaining reader).
- [x] 1.3 Run `node tests/js/run_reports_ladder.mjs` (all checks pass) and confirm `rg _basePrice web tests` returns nothing.
