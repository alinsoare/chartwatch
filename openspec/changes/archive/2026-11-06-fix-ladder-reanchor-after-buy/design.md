## Context

`computeLadders` infers `activeRung` (0-based) from total invested, then calls `computeTriggers(basePrice, activeRung, legs, settings)`. Inside, the walk `while (activeRung + 1 < cum.length && running >= cum[activeRung + 1])` begins at the final rung. `running` never exceeds total invested, which is below `cum[activeRung + 1]` by definition, so the loop never fires and `anchorDrawdown` stays `null`.

Separately, `delta = ideals[k] − ideals[k−1]` is negative (e.g. −13 − (−8) = −5), so `raw = anchor − delta` is shallower than the anchor, and `min(ideal, raw)` always returns the ideal.

Repro (shipped settings, triggers `[null,−8,−13,−21,−34]`, amounts `300/500/800/1300/2100`): base leg 30 sh @ 10, plus a leg of 500/8.6 sh @ 8.6, with the current price at 8.6. Today the result is active R2, anchor `null`, effective triggers equal to the ideals, and R3 recommended. Expected: anchor −14, effective triggers `[null, −8, −19, −27, −40]`, no recommendation.

## Goals / Non-Goals

**Goals:** make the existing re-anchor requirement actually hold, and stop a repeat recommendation at an unchanged price right after funding a rung.

**Non-Goals:** changing the schedule, the recommendation rules, the output shape, or the rendering.

## Decisions

- **Anchor from the active rung's crossing leg, found independently of the walk start.** Iterate the legs sorted by `openAt` ascending, accumulating `running += volume × openPrice`. The anchor leg is the first leg at which `running + 1e-9 >= cum[activeRung]`, which is the same tolerance `inferActiveRung` uses, so the two can never disagree. The anchor is `(leg.openPrice − basePrice) / basePrice × 100`. When `activeRung === 0`, the anchor stays `null` (R1 is the base leg), and the effective triggers equal the ideals, matching current output for R1 ladders.
  - *Alternative considered:* restart the existing `while` walk from rung −1. That is equivalent but couples the anchor to a second, differently toleranced rung inference, so it was rejected.
- **Spacing as a positive magnitude.** `spacing_k = |ideal_k − ideal_{k−1}|`, treating the null R1 ideal as 0. Then `raw_{a+1} = anchor − spacing_{a+1}` and `raw_k = effective_{k−1} − spacing_k` for k > a+1, with `effective_k = min(ideal_k, raw_k)`. This keeps the "delay, never accelerate" property and makes slippage carry forward one-for-one.
- **One-share reaching tolerance.** A shared `rungReached(invested, cumAmt, currentPx, epsilon)` is true when `invested + epsilon >= cumAmt` (the old exact rule, `1e-9` for inference and anchoring, `1e-6` for plan state) or, with a known current price, when `cumAmt − invested < currentPx`. `inferActiveRung`, `planState` and the anchor walk all use it, so the filled rungs stay exactly the active rung and below, and the active rung always has an anchor leg. `computeTriggers` reads the current price from its legs (`currentPrice(legs)`, the same source `computeLadders` uses) rather than taking a new argument.
  - *Alternative considered:* a fixed EUR or percentage tolerance. It was rejected because one share is the natural granularity of a whole-share buy, at any price.
- `computeTriggers` keeps its signature and return shape `{ effectiveTriggers, anchorDrawdown }`.

## Risks / Trade-offs

- Ladders funded near the base price (anchor ≈ 0) still get their ideal triggers, because `min` guards them. This is intended.
- Legs that share an `openAt` keep their input order (stable sort). This is acceptable because they have the same timestamp.
