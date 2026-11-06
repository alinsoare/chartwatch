## Why

After buying R2 on FTGA.DE the ladder correctly re-anchors (R3 effective trigger −19.0 %, no recommendation), but the R3 take-profit line still ends in "· due" at a −13.66 % drawdown. `planState` judges *due* against the ideal trigger (`settings.rungTriggersPct`, −13 %) instead of the ladder's effective, re-anchored trigger, so the dashboard reads as "go to R3" while the recommendation and trigger-hit rules (which already use effective triggers) say wait. On the user's real report the current code already yields no recommendation for FTGA.DE; the RECOMMEND label they saw came from the pre-fix deploy or a cached module, so this change does not remove a label — it removes the remaining `due` signal.

## What Changes

- A non-active rung's plan state is *due* only when the current price is at or below the price of that rung's **effective** trigger (the re-anchored trigger the ladder exposes); otherwise *awaiting trigger*.
- `computeLadders` passes each rung's effective trigger into `planState`; the `settings._basePrice` side channel, read only by `planState`, is removed.

## Pillars

- scope: seam (ladder)
- blast: none
- novelty: known
- deps: none

## Guardrails

Must not change settings, the ladder output shape, `render.js`, `screener.js`, the recommendation rule, or the trigger-hit rule; only the due/awaiting judgment moves from the ideal to the effective trigger.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `ladder-projection`: "Report each rung's plan state" now judges due vs awaiting trigger against the rung's effective trigger.

## Impact

- `web/reports/ladder.js` (`planState`, `computeLadders`)
- `tests/js/run_reports_ladder.mjs` (new synthetic FTGA.DE-like checks)
