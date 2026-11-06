## Context

`computeLadders` computes `effectiveTriggers` (via `computeTriggers`) before its levels loop, and uses them for the recommendation and the `trigger-hit-R<k>` flag. `planState(invested, rungIndex, currentPx, settings)` instead reads `settings.rungTriggersPct[rungIndex]` and `settings._basePrice` (set per ladder on the local settings copy). On a re-anchored ladder the effective trigger is deeper than the ideal one, so the two disagree in the band between them.

FTGA.DE (synthetic mirror of the user's report): legs 3 @ 31.695 (base), 4 @ 29.84, 11 @ 28.62, 10 @ 27.255; invested 801.815; current 27.365; active R2; anchor −14.0085 %; effective triggers `[null, −8, −19.0085, −27.0085, −40.0085]`. Drawdown −13.66 % is past R3's ideal −13 % but not its effective −19.0085 %, so R3 reports *due* while no recommendation exists.

## Goals / Non-Goals

**Goals:** plan state *due* agrees with the effective trigger used by recommendation and trigger-hit; remove the `_basePrice` side channel.

**Non-Goals:** changing re-anchoring, recommendation, trigger-hit, rendering, settings or output fields.

## Decisions

- **Pass the effective trigger and base price explicitly.** Signature becomes `planState(invested, rungIndex, currentPx, settings, basePrice, trigPct)`; the call site passes `basePrice` and `effectiveTriggers[k]`. A null trigger (R1) stays *awaiting trigger*. Alternative — writing effective triggers onto `settings` like `_basePrice` — rejected: it extends a mutable side channel.
- **Drop `settings._basePrice`.** Its only reader is `planState` (verified by grep across `web/` and `tests/`); once the base price is passed explicitly the assignment in `computeLadders` is removed.
- For a non-re-anchored ladder (active R1, or anchor not deeper) effective equals ideal, so existing behaviour and tests are unchanged.

## Risks / Trade-offs

- [A caller relying on `_basePrice`] → grep shows none; the verifier re-greps for `_basePrice` and expects zero hits.
