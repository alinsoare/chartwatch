## MODIFIED Requirements

### Requirement: Render two views per projecting ladder, every figure labelled with its basis

Each open long ladder with projections SHALL be rendered with its summary facts (instrument, strategy stating the active rung's *effective* net target, invested amount, blended average, current price, unrealized P/L, age, periods held) separate from its take-profit levels — **at most two** take-profit lines: the **active** rung and, when one exists, the **next** rung only (`active_rung + 1`). Deeper rungs (R+2 through terminal) SHALL NOT be listed in the UI even though they remain computed. Each visible line SHALL carry its gross percentage, exit price, offset from current price (on the active rung only where applicable), plan state, and projected net result — with compliance flags shown once per ladder. Every projected figure on a visible line SHALL be labelled in text with its basis — staged plan together with the cumulative amount it is measured against, or current position together with the amount held — so no bare EUR amount or exit price appears without its basis. The active rung's line SHALL carry the current-position basis only. A short position SHALL render as a single unsupported entry with no take-profit levels.

#### Scenario: Projecting ladder shows both views

- **WHEN** a long ladder with projections is rendered
- **THEN** its summary facts and its take-profit levels are both shown, with compliance flags appearing once for the ladder

#### Scenario: Basis is on every line

- **WHEN** a ladder on R2 is rendered
- **THEN** exactly two take-profit lines are shown: R2 reads as current position on the amount held, and R3 reads as staged plan on 1600 EUR; R4 and R5 are not listed

#### Scenario: Terminal active rung shows one line

- **WHEN** a ladder's active rung is R5
- **THEN** only R5's take-profit line is shown and no further rung line appears

#### Scenario: Active R1 shows current and next only

- **WHEN** a ladder's active rung is R1 and deeper rungs are computed
- **THEN** the UI lists R1 and R2 only, not R3–R5
