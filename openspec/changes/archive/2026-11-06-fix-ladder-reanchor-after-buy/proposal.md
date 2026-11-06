## Why

After the user funds the recommended rung and re-imports the report, the ladder still recommends the *next* rung at the same price (reported on FTGA.DE: R2 bought, report now recommends R3 on the same trigger; the −14 % figures used below are an illustrative reproduction, not the user's data). Re-anchoring of unfunded rung triggers, already required by the `ladder-projection` spec, never takes effect. That leaves every unfunded rung on its ideal trigger, so a rung funded below its own trigger immediately "crosses" the next one.

Two defects in `computeTriggers` (`web/reports/ladder.js`) cause this:

1. The crossing-leg walk starts from the already-final active rung, so it never advances and the anchor drawdown is always `null`.
2. The spacing `delta = ideal[k] − ideal[k−1]` is negative, so `anchor − delta` is *shallower* than the anchor. Even with a correct anchor, `min(ideal, raw)` would just return the ideal trigger.

## What Changes

- Determine the anchor drawdown from the leg (legs in open-time order) whose running cumulative invested amount first reaches the **active** rung's cumulative tier. When the active rung is R1 there is no anchor, and ideal triggers apply.
- Treat rung spacing as a positive magnitude, so `raw = anchor − spacing` is deeper than the anchor and chains forward from the preceding effective trigger.
- Count a rung as reached (active-rung inference, *filled* plan state, and anchor-leg selection alike) when the remaining shortfall to its cumulative amount is strictly less than one share's current price, so a buy rounded down to whole shares (58 sh @ 8.6 = 498.80 EUR for R2's 500 EUR) is not re-recommended. With no current price, the exact tier applies. The next rung's shortfall stays `cum[next] − invested`.
- Clarify the existing re-anchor requirement and add scenarios for the user's case: funding the recommended rung at the current price, then regenerating at an unchanged price, yields no recommendation. The next rung is recommended only after the price falls a further spacing below the funding leg.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ladder-projection`: requirement "Re-anchor unfunded rung triggers to the active rung's actual crossing leg". It clarifies the crossing-leg selection and the spacing sign, and adds after-buy scenarios.
- `ladder-projection`: requirements "Compute blended average and infer the active rung per ticker" and "Report each rung's plan state". They add the one-share reaching tolerance and a whole-share after-buy scenario.

## Pillars

- **Scope**: seam. The change is confined to `web/reports/ladder.js` (`computeTriggers`, `inferActiveRung`, `planState`) plus its test runner.
- **Blast radius**: none. This is a pure client-side computation with no persisted data, API, or settings change. Only the `effectiveTriggers`, `anchorDrawdown`, `recommendation` values and what derives from them (`trigger-hit-R*` / `recommend-R*` flags, `equityCapNote`) change, and only for ladders whose active rung is R2 or deeper.
- **Novelty**: known. The behaviour is already specified, and this fix makes the code honour it.
- **Dependencies**: none.

## Guardrails

The change must not alter the rung schedule or settings (`web/reports/settings.js`), the ladder output shape (field names and types), `web/reports/render.js` or `web/reports/screener.js`. It must not change any recommendation rule (next-rung-only, red-semaphore, terminal, short/assumed-direction suppression) other than through correct re-anchoring and the one-share reaching tolerance. It must not make any effective trigger shallower than its ideal trigger.

## Impact

- Code: `web/reports/ladder.js` (`computeTriggers`, `inferActiveRung`, `planState`, and their calls from `computeLadders`).
- Tests: `tests/js/run_reports_ladder.mjs` (new regression checks).
- Behaviour: ladders funded deeper than a rung's ideal trigger now get deeper next-rung triggers, which removes the repeat recommendation right after a buy.
