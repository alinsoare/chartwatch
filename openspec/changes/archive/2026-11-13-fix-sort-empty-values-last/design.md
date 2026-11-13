## Context

`sortRows` is the single sort used by all four reports tabs. Its empty check (`emptyLastCompare`: `null`, `undefined`, `""`, `"n/a"`) returns ±1 and is then multiplied by the direction, flipping empties first on descending sorts. When both values are empty it returns 0 and the comparator falls through to `localeCompare`/subtraction, so mixed empties (`"n/a"` vs `null`) are reordered by direction.

## Decisions

- **Fix in `sortRows` for every table**, not per column. Rejected: extending the per-column set, which leaves the ranking requirement violated by default for any new column.
- **Both-empty returns 0 before any value comparison**, so mixed empty representations keep their relative order (`Array.prototype.sort` is stable). Rejected: normalising empties to `null` in `sortValue`, which would also touch ladder `_sort` metadata.
- **Remove `EMPTY_LAST_BOTH_WAYS`**: once the rule is general it has no purpose; keeping it would be abandoned code.
- **Compliant ladders sort as "Compliant"**: `ladderSortMeta` sets `_sort.flags` to `"Compliant"` when the ladder has no flags, matching the rendered chip. Rejected: leaving `""`, which the general rule would sink in both directions although the cell shows a value.
