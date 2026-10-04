## Why

Three tests (`test_catalog.py::TestLoading::test_seed_catalog_is_valid`,
`test_api.py::TestCatalog::test_lists_seed_instruments_with_flags`,
`test_export.py::test_export_round_trip`) and several others hard-code exact
facts about the live, hand-curated `data/symbols.csv` — row counts, specific
disabled tickers, specific symbols' fields. The maintainer edits that catalog
regularly (adding/removing instruments), so every edit breaks tests that have
nothing to do with the edit. `test_export_round_trip` currently fails at a
`KeyError: 'GLD'` before reaching its alias-candle-file assertions, so that
coverage (added for the catalog's new `aliases` column) never actually runs.
Tests need to exercise catalog-dependent behaviour (disabled-symbol handling,
CFD/non-EUR flags, alias resolution, export round-trip) against a stable,
purpose-built fixture instead of the live file, while a small set of
invariant checks keeps validating the real file without pinning its contents.

## What Changes

- Add a checked-in fixture catalog (`tests/fixtures/symbols.csv`) containing
  only the rows needed to exercise catalog-dependent behaviour: a disabled
  row, a USD CFD, a non-EUR `REAL` stock, an aliased row (`C7A0.DU` aliasing
  `C7A0.DE`), and a row with a non-default (0.001) `point_size`.
- Add a `tests/conftest.py` fixture that monkeypatches the catalog path (the
  `CATALOG_CSV` name bound in `chartwatch.catalog`, which every call site —
  `api.py`, `export.py`, `contract.py`, `catalog.py` itself — resolves through
  at call time) to the fixture file, for tests that want a controlled
  catalog instead of the live one.
- Rewrite `test_seed_catalog_is_valid`,
  `test_lists_seed_instruments_with_flags`, `test_export_round_trip`, and the
  other catalog-dependent tests named in the investigation
  (`test_non_eur_real_stocks_are_flagged_without_cfd`,
  `test_three_decimal_point_size`) to use the fixture catalog and assert
  concrete, fixture-defined values instead of live-catalog counts/snapshots.
- Keep `test_seed_catalog_aliases_catl_xetra_listing` (and add any further
  needed live-catalog checks) scoped to invariants only: the live catalog
  loads without error, tickers are unique, aliases don't collide with a
  ticker, at least one row is enabled, and `C7A0.DE` resolves to `C7A0.DU`.
  No test may assert an exact row count, a specific disabled ticker, or any
  other fact that changes when a row is added/removed/toggled.
- In `test_export.py`, make the alias-candle-file assertions (currently dead
  code after the `GLD` `KeyError`) exercise the fixture's aliased row so they
  actually run and are pinned to a fixture ticker, not a live one.
- In `test_report_import.py`, replace the two tests that assert an exact
  shortlist-gap set against the live catalog and live broker-report
  shortlists   (`test_expanded_catalog_leaves_only_rejected_shortlist_gaps`,
  `test_complete_catalog_reports_only_rejected_shortlist_gaps`) with
  invariant checks against the same live data: every shortlist ticker whose
  guessed symbol already matches a catalogued ticker is excluded from the
  gap set, and the gap set is a subset of the shortlist tickers. No exact
  set of tickers is pinned.
- No production code in `src/chartwatch/` changes; this is test
  infrastructure only.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none — no spec-level behavior changes; see Impact)

## Impact

- Affected: `tests/test_catalog.py`, `tests/test_api.py`, `tests/test_export.py`,
  `tests/test_report_import.py`, a new `tests/fixtures/symbols.csv`, and a new
  or extended `tests/conftest.py`.
- Not affected: `src/chartwatch/catalog.py`, `src/chartwatch/api.py`,
  `src/chartwatch/export.py`, `src/chartwatch/contract.py`,
  `src/chartwatch/sync.py`, `data/symbols.csv`, or any other production
  behavior. `.openspec.yaml` for this change sets `skip_specs: true`
  because every `instrument-catalog` requirement (single source of truth,
  CFD detection, compatibility flags, alias resolution, etc.) already holds;
  this change only makes the tests verify it against stable inputs.
