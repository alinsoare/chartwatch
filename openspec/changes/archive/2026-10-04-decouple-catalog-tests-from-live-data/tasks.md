## 1. Fixture catalog and injection

- [x] 1.1 Create `tests/fixtures/symbols.csv` with the rows listed in
      `design.md` Decision 1 (disabled row, enabled USD CFD, enabled non-EUR
      `REAL` stock, baseline EUR `REAL` stock, `C7A0.DU`/`C7A0.DE` aliased
      pair, `point_size = 0.001` row) and verify `load_catalog(path)` loads it
      without error from a quick interactive check or a new smoke test.
- [x] 1.2 Add a `fixture_catalog` fixture to `tests/conftest.py` (create the
      file if it doesn't exist) that monkeypatches
      `chartwatch.catalog.CATALOG_CSV` to the fixture path, per `design.md`
      Decision 2, and verify a trivial test using the fixture sees the
      fixture's rows via `load_catalog()`.

## 2. `test_catalog.py`: fixture-backed and invariant tests

- [x] 2.1 Rewrite `TestLoading::test_seed_catalog_is_valid` to load the
      fixture catalog (via `fixture_catalog` or by passing the fixture path
      directly to `load_catalog`) and assert the fixture's known row count,
      enabled count, and disabled ticker set; verify it passes.
- [x] 2.2 Add a new `TestLoading` test (e.g.
      `test_live_catalog_invariants_hold`) that loads the real catalog with
      no path override and asserts only: no exception raised, at least one
      enabled row, and `resolve(instruments, "C7A0.DE").ticker == "C7A0.DU"`;
      verify it passes against today's `data/symbols.csv`.
- [x] 2.3 Rewrite `test_non_eur_real_stocks_are_flagged_without_cfd` to use
      the fixture's non-EUR `REAL` row(s) instead of `3USL.L`/`COPX.L`/`V`;
      verify it passes.
- [x] 2.4 Rewrite `test_three_decimal_point_size` to use the fixture's
      `point_size = 0.001` row instead of `A1P0.DE`; verify it passes.
- [x] 2.5 Confirm `test_seed_catalog_aliases_catl_xetra_listing` still reads
      the live catalog unchanged (it's already an invariant, per `design.md`
      Decision 3) and keep it as-is; verify it still passes.
- [x] 2.6 Run `uv run python -m pytest -q tests/test_catalog.py` and verify
      the whole file passes.

## 3. `test_api.py`: fixture-backed catalog endpoint test

- [x] 3.1 Extend `test_api.py`'s `client` fixture (or add a dependency on
      `fixture_catalog`) so `/data/catalog.json` is served from the fixture
      catalog.
- [x] 3.2 Rewrite `TestCatalog::test_lists_seed_instruments_with_flags` to
      assert against the fixture's row count and specific fixture tickers
      (disabled row, CFD row, non-EUR row) instead of the live catalog's
      133/AAPL/GLD/etc.; verify it passes.
- [x] 3.3 Run `uv run python -m pytest -q tests/test_api.py` and verify the
      whole file passes.

## 4. `test_export.py`: fixture-backed round trip with live alias assertions

- [x] 4.1 Extend `test_export.py`'s `client` fixture (or add a dependency on
      `fixture_catalog`) so `export_site` and the dev endpoints both see the
      fixture catalog.
- [x] 4.2 Update the disabled-symbol assertion
      (`exported_scores["symbols"]["GLD"]`) to use the fixture's disabled
      ticker instead of `GLD`.
- [x] 4.3 Update the alias-candle-file assertions (the per-alias
      byte-identical candle check and the `C7A0.DE/d1.json` existence check)
      to use the fixture's aliased pair; verify these assertions now execute
      and pass (they previously never ran due to the `GLD` `KeyError`).
- [x] 4.4 Run `uv run python -m pytest -q tests/test_export.py` and verify
      `test_export_round_trip` passes end to end, including the alias
      assertions.

## 5. `test_report_import.py`: live-data tests become invariants

- [x] 5.1 Replace
      `test_expanded_catalog_leaves_only_rejected_shortlist_gaps`'s exact
      `gaps == {...}` assertion with the subset/exclusion invariants from
      `design.md` Decision 4 (`gaps <= shortlist_tickers` and
      `gaps.isdisjoint(already)`), dropping the exact `len(shortlist_tickers)
      == 92` / `len(already) == 16` / `len(proposed) == 76` pins for this
      test; verify it passes against today's live catalog and reports.
- [x] 5.2 Apply the same replacement to
      `test_complete_catalog_reports_only_rejected_shortlist_gaps`; verify it
      passes.
- [x] 5.3 Run `uv run python -m pytest -q tests/test_report_import.py` and
      verify the whole file passes.

## 6. Full-suite verification

- [x] 6.1 Run `uv run python -m pytest -q` (not bare `uv run pytest`) from
      the repo root and verify the full suite passes against the live
      `data/symbols.csv` and `data/broker-reports/` as they stand today.
- [x] 6.2 Spot-check robustness: temporarily add or disable one row in a
      scratch copy of `data/symbols.csv`, point `CATALOG_CSV` at it by hand
      (or temporarily edit the real file and revert), and confirm none of
      the tests touched in this change fail because of that edit; revert the
      scratch edit before finishing.
