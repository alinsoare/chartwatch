## Context

`computeLadders` (ladder.js) groups `parsed.openLegs` by ticker and direction and keeps the raw `legs` array on every ladder row, projecting or not. Each leg carries `volume` (parsed from the report's Volume column, `null` when the cell is empty or unparsable). `render.js` derives the Legs column in `ladderSortMeta` from `lad.legs.length`; the volume is derived the same way, so `ladder.js` stays untouched.

## Decisions

- **Derive in render.js, not ladder.js.** The volume is a display sum over data already on the row. Adding it to `computeLadders` would widen the ladder output shape for a presentation need; rejected.
- **Missing volume makes the whole cell not-applicable.** A partial sum would understate the position silently. Rejected alternative: sum the known legs.
- **Formatting:** `toLocaleString("en-US", { maximumFractionDigits: 6 })` — rounds away float noise (0.6100000000000001 → `0.61`), keeps real fractional shares, groups thousands like `fmtEurAmount`. Rejected: `toFixed(4)` (pads whole-share counts with `.0000`).
- **Not-applicable cell reuses `naCell`** (`n/a` + `title`), the idiom the ranking table already uses for undefined figures, so the table requirement's not-applicable presentation stays uniform. Rejected: a bare `—` with a `title`, which would add a second idiom.
- **Testability:** export pure helpers `ladderVolume(legs)`, `fmtVolume(n)` and `volumeCellHtml(legs)` (the cell's inner HTML, `naCell(...)` when null), export `ladderSortMeta`, and lift the ladders table's column list to an exported module constant `LADDER_COLUMNS`, so node tests check sum, formatting, sort value and column order without a DOM.

## Risks

- A short ladder's volume is shown unsigned, like the report's own Volume column; the row's direction badge already says Short.
