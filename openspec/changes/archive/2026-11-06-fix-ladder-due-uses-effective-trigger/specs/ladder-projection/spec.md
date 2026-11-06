## MODIFIED Requirements

### Requirement: Report each rung's plan state

Each rung SHALL report a **plan state** derived from the ladder's invested amount against that rung's cumulative amount: *filled* when the invested amount reaches it (as defined for active-rung inference, including the one-share tolerance at the current price), otherwise *awaiting trigger* with the trigger price it waits for. The trigger a rung waits for SHALL be that rung's **effective trigger** — the re-anchored trigger the ladder exposes, which equals the ideal trigger when no re-anchoring applies — priced from the base price. A rung awaiting a trigger the current price has already crossed (current price at or below the effective trigger price) SHALL be reported as *due*, distinguishable from one whose trigger is still ahead; a rung whose ideal trigger has been crossed but whose effective trigger has not SHALL be reported as awaiting trigger, not due. The filled rungs SHALL be exactly the active rung and those below it; leg count SHALL NOT determine plan state.

#### Scenario: Leg without committed amount is still awaiting

- **WHEN** a rung's trigger has been crossed and a small leg was bought there, leaving the invested amount short of that rung's cumulative amount by at least the price of one share at the current price
- **THEN** that rung's plan state is awaiting trigger (due), not filled

#### Scenario: Re-anchored next rung past its ideal trigger is not due

- **WHEN** a long ladder holds legs, in open-time order, of 3 shares at 31.695 (base), 4 at 29.84, 11 at 28.62 and 10 at 27.255 (active rung R2, anchor drawdown about −14.01 %, R3 effective trigger about −19.01 %), and the current price is 27.365 (drawdown about −13.66 %, past R3's ideal −13 %)
- **THEN** R3's plan state is awaiting trigger, not due, and the ladder has no recommendation

#### Scenario: Re-anchored next rung becomes due at its effective trigger

- **WHEN** the same ladder's current price falls to 25.6, at or below the base price times (1 − 0.190085)
- **THEN** R3's plan state is due
