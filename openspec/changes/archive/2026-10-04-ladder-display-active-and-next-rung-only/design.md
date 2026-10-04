## Context

`ladder-projection` still computes five TP levels per ladder. `render.js` currently iterates `lad.levels` with `lvl.rung >= active`, showing R_active … R5. The reference `xtb-reports` renderer filters:

`active_rung <= rung_index <= active_rung + 1`

## Goals / Non-Goals

**Goals:**
- Display parity with the reference ladders table: at most two TP lines per ladder (active + next).
- Preserve ACTIVE / RECOMMENDED markers, basis labels, escalation markers, and recommendation notes on the lines that remain visible.

**Non-Goals:**
- Changing projection formulas, recommendation rules, or tab counts (still one card per open ladder).
- Collapsing summary facts or compliance flags.

## Decisions

### Filter at render time, not in `computeLadders`

Keep all levels in the ladder object so tests and future UI (e.g. expand) stay cheap. Apply the visibility filter in `renderLadderCard` only:

```javascript
const visible = levels.filter(
  (lvl) => lvl.rung >= active && lvl.rung <= active + 1
);
```

When the active rung is terminal (R5), only one line is shown.

### Reference alignment

Behavior matches `xtb_reports.render._render_tp_level` selection (`visible_tp_levels` slice). No import of reference code.

## Risks / Trade-offs

- [Users cannot see R+2…R5 on-page] → Acceptable; same as reference. Full projection remains in computed data if we add detail later.

## Migration Plan

Single UI change; no cache or import migration.
