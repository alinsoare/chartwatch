## 1. Regression test, fix, gates

- [x] 1.1 Add failing regression checks to `tests/js/run_reports_ladder.mjs`, using the shipped settings and a FTGA.DE-style ladder with a base leg of 30 sh @ 10:
  - Base leg only, price 8.6: R2 is recommended with a 500 EUR shortfall.
  - Add a leg of 500/8.6 sh @ 8.6 at price 8.6: the anchor is −14 (±1e-6), the effective triggers are `[null, −8, −19, −27, −40]` (±1e-6), and the recommendation is `null`.
  - Same two legs at price 8.2: the recommendation is `null`.
  - Same two legs at price 8.0: R3 is recommended with an 800 EUR shortfall.
  - An R2 ladder funded by a single 800 EUR base leg near the base price: the effective triggers equal the ideals.
  - A ladder whose active rung is R1: the anchor is `null` and the effective triggers equal the ideals.

  Confirm that the after-buy checks fail on the current code.
- [x] 1.2 Fix `computeTriggers` in `web/reports/ladder.js`:
  - Take the anchor from the open-time-ordered leg whose running invested amount first reaches `cum[activeRung]` (same tolerance as `inferActiveRung`), with no anchor when `activeRung === 0`.
  - Use the positive spacing magnitude `|ideal_k − ideal_{k−1}|` so that `raw = anchor − spacing` chains forward from each effective trigger, and `effective = min(ideal, raw)`.
  - Keep the signature and return shape unchanged.
- [x] 1.4 Spec amendment (human-accepted): count a rung as reached when its shortfall is strictly less than one share at the current price (exact rule when the price is unknown), shared by `inferActiveRung`, `planState` and the anchor-leg walk via `rungReached`. Add checks for 58 sh @ 8.6 (R2 active, no repeat recommendation), a shortfall of one share or more staying on R1, and an unknown current price using the exact rule.
- [x] 1.3 Run gate_quick (every `tests/js/run_*.mjs`) and gate_full (`uv run python -m pytest`, `uvx vulture src`). All must pass.
