## MODIFIED Requirements

### Requirement: Compute blended average and infer the active rung per ticker

For each ticker's open long legs, the system SHALL compute a volume-weighted blended average open price, the total invested amount, and the base price (the oldest open leg's open price), and SHALL infer the **active rung** as the deepest rung whose cumulative invested amount the ladder's total invested capital has reached, walking legs in open-time order. An invested amount SHALL count as **reaching** a rung's cumulative amount when it equals or exceeds it, or when the remaining shortfall to it is strictly less than the price of one share at the current price; when the current price is unknown, only an invested amount equal to or above the cumulative amount reaches it.

#### Scenario: Below the first tier still reports R1

- **WHEN** a ladder's invested capital has not reached R2's cumulative tier
- **THEN** its active rung is reported as R1

#### Scenario: A whole-share buy short of the tier by less than one share reaches the rung

- **WHEN** under the shipped settings a ladder's base leg is 300 EUR at price 10, R2 was bought as 58 whole shares at 8.6 (498.80 EUR, leaving 1.20 EUR short of R2's 800 EUR tier), and the current price is 8.6
- **THEN** the active rung is R2, the anchor drawdown is −14 %, R2 is not recommended again, and R3 is not recommended at 8.6

#### Scenario: A shortfall of at least one share keeps the lower rung

- **WHEN** a ladder's invested amount is short of R2's cumulative amount by the price of one share at the current price or more, and the current price is past R2's trigger
- **THEN** its active rung is R1 and R2 is recommended with that shortfall

#### Scenario: Unknown current price uses the exact tier

- **WHEN** a ladder's current price is unknown and its invested amount is below R2's cumulative amount by any amount
- **THEN** its active rung is R1

### Requirement: Report each rung's plan state

Each rung SHALL report a **plan state** derived from the ladder's invested amount against that rung's cumulative amount: *filled* when the invested amount reaches it (as defined for active-rung inference, including the one-share tolerance at the current price), otherwise *awaiting trigger* with the trigger price it waits for. A rung awaiting a trigger the current price has already crossed SHALL be reported as *due*, distinguishable from one whose trigger is still ahead. The filled rungs SHALL be exactly the active rung and those below it; leg count SHALL NOT determine plan state.

#### Scenario: Leg without committed amount is still awaiting

- **WHEN** a rung's trigger has been crossed and a small leg was bought there, leaving the invested amount short of that rung's cumulative amount by at least the price of one share at the current price
- **THEN** that rung's plan state is awaiting trigger (due), not filled

### Requirement: Re-anchor unfunded rung triggers to the active rung's actual crossing leg

In addition to each rung's ideal configured trigger, the system SHALL compute a re-anchored trigger derived from the active rung's **anchor drawdown** — the percentage move from the base price of the leg that actually crossed the active rung's cumulative tier. The crossing leg SHALL be the first leg, taking the ladder's legs in open-time order, at which the running cumulative invested amount reaches the active rung's cumulative amount (using the same reaching rule, one-share tolerance included, as active-rung inference); when the active rung is R1 there SHALL be no anchor drawdown and every effective trigger SHALL equal its ideal trigger. For rung `k = active_rung + 1`, the raw re-anchored trigger SHALL be `anchor − delta_k`, where `delta_k` is that rung's ideal-schedule spacing from the rung below it, taken as a positive magnitude in percentage points (R1's absent trigger counting as 0); for rungs further out, spacing SHALL chain forward from the preceding rung's **effective** trigger. A rung's effective trigger SHALL be `min(ideal, raw)` — re-anchoring only ever delays eligibility, never accelerates it.

#### Scenario: Re-anchoring delays, never accelerates

- **WHEN** a ladder's active rung was reached by a single large entry landing near the base price, giving an anchor drawdown near 0
- **THEN** the next rung's effective trigger is its ideal trigger, not a shallower raw re-anchored one

#### Scenario: Slippage pushes the next trigger deeper

- **WHEN** a ladder's active rung R2 was actually funded at a deeper drawdown than R2's ideal trigger
- **THEN** R3's effective trigger is deeper than its ideal trigger by the same amount

#### Scenario: R1 ladder keeps ideal triggers

- **WHEN** a ladder holds only its base leg, so its active rung is R1
- **THEN** it reports no anchor drawdown and its effective triggers equal the ideal triggers

#### Scenario: Funding the recommended rung at the current price clears the recommendation

- **WHEN** under the shipped settings a ladder's base leg is 300 EUR at price 10, R2 was funded by a 500 EUR leg at 8.6 (−14 %), and the report is regenerated with the current price still 8.6
- **THEN** the active rung is R2, the anchor drawdown is −14 %, the effective triggers are R2 −8 %, R3 −19 %, R4 −27 %, R5 −40 %, and no recommendation is raised

#### Scenario: Next rung is recommended only a further spacing below the funding leg

- **WHEN** the same R2-funded ladder is regenerated with the current price at 8.2 (−18 %), and again at 8.0 (−20 %)
- **THEN** at 8.2 no recommendation is raised, and at 8.0 the recommendation names R3 with an 800 EUR shortfall
