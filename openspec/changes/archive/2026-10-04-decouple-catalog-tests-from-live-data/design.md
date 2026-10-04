## Context

See `proposal.md` - Why/What Changes for the problem and the chosen shape.
Relevant current state:

- `load_catalog(path=None)` in `src/chartwatch/catalog.py` resolves the
  default path as `path = path or CATALOG_CSV`, where `CATALOG_CSV` is a name
  bound into the `chartwatch.catalog` module namespace at import time (`from
  .config import ... CATALOG_CSV`). `api.py`, `export.py`, and `contract.py`
  all call `load_catalog()` with no path argument, so they go through that
  same module-level name at call time.
- `sync.py` is the one call site that already takes an explicit
  `self._catalog_path` and passes it through — it needs no change.
- Existing tests monkeypatch `store.DB_PATH` per-test but never touch the
  catalog path, so every catalog-backed test currently reads
  `data/symbols.csv` as it stands on disk at test time.
- `tests/test_report_import.py` already has a `seed_catalog` fixture
  (`tmp_path`-based, built from a small inline `SEED_HEADER`/`SEED_ROWS`
  constant) that most of its tests use. Only two tests in that file read the
  live `data/symbols.csv` and `data/broker-reports/` directly and assert an
  exact resulting set.

## Goals / Non-Goals

**Goals:**
- Make catalog-dependent behavioral tests immune to maintainer edits of
  `data/symbols.csv`, without losing coverage of that behavior.
- Make the alias-candle-file assertions in `test_export_round_trip` actually
  execute (today they're unreachable after the `GLD` `KeyError`), and pin
  them to a fixture row so they don't depend on which live row happens to
  have aliases.
- Keep a small, explicit set of tests that still exercise the real
  `data/symbols.csv`, scoped to invariants that hold regardless of its
  contents.
- Resolve the two live-data exact-set tests in `test_report_import.py`
  consistently with the same principle.

**Non-Goals:**
- Changing any production code under `src/chartwatch/`.
- Changing `data/symbols.csv` itself or the maintainer's editing workflow.
- Building a general-purpose catalog-fixture framework; one small fixture
  file sized to current test needs is enough.
- Re-architecting `test_report_import.py`'s broker-report/xlsx fixtures,
  which are out of scope and already mostly isolated from the live catalog.

## Decisions

### 1. One shared fixture file, not per-test inline catalogs

`tests/test_catalog.py` already has a `write_catalog(tmp_path, *rows)` helper
that builds a catalog from inline row strings per test. That pattern stays
for tests that only need 1-2 rows local to the test (e.g. "duplicate ticker
is rejected"). But three different test modules (`test_catalog.py`,
`test_api.py`, `test_export.py`) need the *same* small set of rows exercising
the *same* behaviors (disabled, CFD, non-EUR, alias, odd point size), so a
single checked-in `tests/fixtures/symbols.csv` is used instead of
duplicating row strings across modules. This mirrors the existing
`tests/fixtures/{fvg,fvg-spaces,macd}/` convention of checked-in named
fixtures for cross-test data, and keeps the fixture reviewable as its own
diff when a new test needs a new row shape.

Alternative considered: generate the fixture programmatically in a
`conftest.py` function (e.g. `write_catalog(tmp_path, ROWS)`) instead of a
checked-in CSV. Rejected — a real file is easier to eyeball as "this is
exactly what a maintainer's catalog looks like," and some tests
(`test_export_round_trip`) need it to sit at a stable path across the whole
test (not just inside one `tmp_path`), which is simpler with a checked-in
file than with a programmatically-written one.

Fixture rows (exact fields TBD at implementation time, but each row exists
for one reason):
- One disabled row (replaces the `GLD`-shaped assertions in
  `test_catalog.py`, `test_api.py`, `test_export.py`).
- One enabled USD CFD (replaces the `AAPL`-shaped assertion in
  `test_api.py`).
- One enabled non-EUR `REAL` stock, no CFD (replaces the
  `3USL.L`/`COPX.L`/`V`-shaped assertions).
- One EUR `REAL` stock as the "normal" baseline row (replaces `ABEA.DE`
  where it's used as a plain example rather than for its real identity).
- One aliased pair, reusing the existing `C7A0.DU`/`C7A0.DE` identity so the
  fixture intentionally matches the real-world row that also gets its own
  live-invariant check (see Decision 3) — this is a deliberate shared
  reference point, not a coincidence to avoid.
- One row with `point_size = 0.001` (replaces `A1P0.DE`).

### 2. Inject the fixture by monkeypatching `chartwatch.catalog.CATALOG_CSV`

Because every call site resolves the default path through the name bound in
`chartwatch.catalog`'s own namespace, `monkeypatch.setattr(catalog,
"CATALOG_CSV", fixture_path)` is sufficient for `load_catalog()` calls from
`api.py`, `export.py`, `contract.py`, and `catalog.py` itself, without
patching each module's import separately. A `conftest.py` fixture
(`fixture_catalog` or similar) does this once:

```python
@pytest.fixture
def fixture_catalog(monkeypatch):
    path = Path(__file__).parent / "fixtures" / "symbols.csv"
    monkeypatch.setattr(catalog, "CATALOG_CSV", path)
    return path
```

Tests that need a controlled catalog take this fixture (or pass an explicit
path to `load_catalog()` directly, as `test_catalog.py`'s existing
`write_catalog`-based tests do). Tests that currently build their own
`client` fixture (`test_api.py`, `test_export.py`) extend that fixture to
depend on `fixture_catalog` so the API/exporter also see it.

Alternative considered: patching `chartwatch.config.CATALOG_CSV` instead.
Rejected — `catalog.py` imported the name with `from .config import
CATALOG_CSV`, which binds a separate name in `catalog`'s namespace at import
time; patching `config.CATALOG_CSV` after that import has already happened
would not affect `catalog.load_catalog`'s default. Patching
`catalog.CATALOG_CSV` is the one source of truth all call sites actually
read at call time.

### 3. Live-catalog tests become invariants only

Tests that must still touch the real `data/symbols.csv` are limited to
properties that hold for *any* valid catalog, not snapshots of today's
contents:
- Loads without raising (`load_catalog()` succeeds).
- All tickers unique (already enforced by `load_catalog` itself raising on
  duplicates — reaching no exception is sufficient).
- No alias collides with a ticker or another alias (same reasoning).
- At least one row is enabled (`any(i.enabled for i in instruments)`).
- `resolve(instruments, "C7A0.DE").ticker == "C7A0.DU"` — kept as a named
  real-world invariant, not a count. This specific check stays because the
  CATL Xetra/Dusseldorf alias relationship is a long-lived fact about that
  company's listings, not an artifact of today's row count; if it ever stops
  holding, that is itself a signal to the maintainer, not test fragility. If
  it becomes a maintenance burden, drop it — but the other invariants have
  no dependency on it.

No test may assert `len(instruments)`, a specific disabled ticker, or any
other count/snapshot of the live file.

### 4. `test_report_import.py`'s two exact-gap-set tests become subset/exclusion invariants

`test_expanded_catalog_leaves_only_rejected_shortlist_gaps` and
`test_complete_catalog_reports_only_rejected_shortlist_gaps` both compute
`gaps = {t for t in shortlist_tickers if guess_yahoo_symbol(t) not in
catalog_symbols}` against the live catalog and live
`data/broker-reports/{ETFs,STCs}.txt`, then assert `gaps == {<19 explicit
tickers>}` / `{<18 explicit tickers>}`. These drift for the same reason the
catalog tests do: adding a row to the catalog that covers a previously
gapped ticker is the intended, successful outcome of maintaining the
catalog, yet it breaks the test. Unlike the catalog-identity tests, this
behavior (dedup, hint parsing, suffix-mapping) already has dedicated
fixture-based coverage elsewhere in the same file (the `seed_catalog`
fixture and the synthetic "overlap" shortlist test), so these two tests are
redundant in what they prove about `report_missing`/`guess_yahoo_symbol`
logic — what's live-specific about them is only the live gap *count*, which
is exactly what should not be pinned.

Decision: replace both with invariant checks over the same live data,
instead of deleting them (deleting would lose the signal that the live
catalog and live shortlists are still mutually consistent with the
import tool's logic):
- `gaps <= shortlist_tickers` (every gap is actually a shortlist ticker —
  sanity on the set comprehension, trivially true but cheap).
- `gaps.isdisjoint(already)` where `already = {t for t in shortlist_tickers
  if guess_yahoo_symbol(t) in catalog_symbols}` — no ticker the catalog
  already covers is reported as a gap. This is the one invariant that
  actually encodes the spec's "Instruments already catalogued" scenario
  against live data, and it's the one thing a regression in
  `report_missing` could break without an exact-set test to catch it.
- Drop the exact-count assertions (`len(shortlist_tickers) == 92`, etc.) for
  these two tests specifically, since the shortlist files are also live,
  hand-edited data (`data/broker-reports/*.txt`) subject to the same drift
  as the catalog. Counts of synthetic fixtures elsewhere in the file are
  unaffected and stay as-is.

Alternative considered: delete the two tests outright and rely solely on the
fixture-based tests. Rejected per above — the fixture tests prove the logic
works on synthetic input; these two (de-fanged to invariants) are the only
tests proving the live catalog and live shortlists are still coherent
against each other, which is useful signal distinct from "does the code
work."

Alternative considered: mark them `xfail`/skip as "known to drift." Rejected
— that discards the coherence signal entirely rather than keeping the part
of it that's stable.

### 5. `test_export.py`'s alias-candle assertions move onto the fixture

`test_export_round_trip` currently fails at `exported_scores["symbols"]["GLD"]`
before reaching its alias-candle-file checks (the per-alias byte-identical
candle files, and the `C7A0.DE/d1.json` existence check). Once this test
uses the fixture catalog, its disabled-row check targets the fixture's
disabled ticker, and its alias check targets the fixture's aliased pair —
both become live, passing assertions instead of dead code after the
`KeyError`.

## Risks / Trade-offs

- [Risk] The checked-in fixture rows drift from what "a real catalog row
  looks like" (e.g. a new required column gets added to the schema and the
  fixture isn't updated) → Mitigation: `load_catalog` already raises on a
  missing required column, so a stale fixture fails loudly in the exact
  tests that use it, not silently.
- [Risk] Two sources of catalog truth in tests (the checked-in fixture file
  vs. existing per-test inline `write_catalog(...)` rows in
  `test_catalog.py`) could tempt future tests to reach for whichever is
  closer rather than the right one → Mitigation: keep the convention
  explicit in this design (shared cross-module fixture, inline rows for
  single-test-local cases) and in file comments near the fixture and the
  `conftest.py` fixture function.
- [Risk] Dropping the exact-count assertions in the two `test_report_import`
  tests loses an early signal if the shortlist/report files balloon
  unexpectedly → Mitigation: not a goal of this change; a maintainer
  reviewing `data/broker-reports/*.txt` diffs is the actual control for
  that, same as for the catalog.

## Migration Plan

1. Add `tests/fixtures/symbols.csv` and the `fixture_catalog` conftest
   fixture (additive, no existing test depends on it yet).
2. Point `test_catalog.py`'s `test_seed_catalog_is_valid` and the other
   catalog-identity tests at the fixture or at invariants, per Decision 1/3.
3. Point `test_api.py`'s `test_lists_seed_instruments_with_flags` at the
   fixture.
4. Point `test_export.py`'s `test_export_round_trip` at the fixture,
   restoring the alias-candle assertions.
5. Replace the two `test_report_import.py` exact-gap-set tests with the
   invariant checks from Decision 4.
6. Run `uv run python -m pytest -q` and confirm the full suite passes
   against the live `data/symbols.csv` as it stands today.

Rollback: revert the test/fixture changes; no production code or data files
are touched, so rollback is a pure test-file revert with no other blast
radius.

## Open Questions

None — the two points the proposal flagged as needing a decision (fixture
approach, `test_report_import.py` handling) are resolved above.
