"""Catalog loading and portfolio-compatibility rules."""

from __future__ import annotations

from pathlib import Path

import pytest

from chartwatch.catalog import (
    Instrument,
    by_ticker,
    enabled_instruments,
    load_catalog,
    resolve,
)

HEADER = (
    "ticker,display_name,name,asset_class,instrument_type,"
    "exchange,quote_currency,point_size,price_divisor,enabled"
)


def make_instrument(**overrides) -> Instrument:
    defaults = dict(
        ticker="ABEA.DE",
        display_name="Alphabet Inc - class A",
        name="Alphabet Inc.",
        asset_class="STOCK",
        instrument_type="REAL",
        exchange="XETRA",
        quote_currency="EUR",
        point_size=0.01,
        price_divisor=1.0,
        enabled=True,
    )
    defaults.update(overrides)
    return Instrument(**defaults)


def write_catalog(tmp_path: Path, *rows: str) -> Path:
    path = tmp_path / "symbols.csv"
    path.write_text("\n".join([HEADER, *rows]) + "\n", encoding="utf-8")
    return path


class TestCfdDetection:
    def test_cfd_variant_is_flagged(self):
        cfd = make_instrument(instrument_type="CFD")
        assert cfd.is_cfd
        assert "CFD" in cfd.incompatibility_reasons()

    def test_real_variant_is_not_flagged(self):
        real = make_instrument(instrument_type="REAL")
        assert not real.is_cfd
        assert real.incompatibility_reasons() == []

    def test_display_name_does_not_affect_cfd_classification(self):
        assert not make_instrument(display_name="CFDX Holdings").is_cfd


class TestCurrencyRules:
    def test_non_eur_catalog_currency_is_flagged(self):
        usd = make_instrument(quote_currency="USD")
        assert usd.incompatibility_reasons() == ["not EUR (USD)"]

    def test_observed_currency_wins_over_catalog(self):
        # Catalog claims EUR; Yahoo reports USD -> judged against USD.
        wrong = make_instrument(quote_currency="EUR")
        assert wrong.incompatibility_reasons("USD") == ["not EUR (USD)"]

    def test_observed_eur_clears_a_wrong_catalog_value(self):
        instrument = make_instrument(quote_currency="USD")
        assert instrument.incompatibility_reasons("EUR") == []

    def test_catalog_observed_mismatch_is_warned(self):
        instrument = make_instrument(quote_currency="EUR")
        assert instrument.warnings("USD") == ["catalog says EUR but Yahoo reports USD"]
        assert instrument.warnings("EUR") == []
        assert instrument.warnings(None) == []

    def test_cfd_and_currency_reasons_combine(self):
        both = make_instrument(instrument_type="CFD", quote_currency="USD")
        assert both.incompatibility_reasons() == ["not EUR (USD)", "CFD"]


class TestLoading:
    def test_loads_rows_and_respects_enabled_flag(self, tmp_path):
        path = write_catalog(
            tmp_path,
            "ABEA.DE,Alphabet Inc - class A,Alphabet,STOCK,REAL,XETRA,EUR,0.01,1,true",
            "GLD,SPDR Gold Shares CFD,Gold,ETF,CFD,NYSE Arca,USD,0.01,1,false",
        )
        instruments = load_catalog(path)
        assert [i.ticker for i in instruments] == ["ABEA.DE", "GLD"]
        assert [i.ticker for i in enabled_instruments(instruments)] == ["ABEA.DE"]
        assert by_ticker(instruments)["GLD"].is_cfd

    def test_missing_column_is_rejected(self, tmp_path):
        path = tmp_path / "symbols.csv"
        path.write_text("ticker,name\nABEA.DE,Alphabet\n", encoding="utf-8")
        with pytest.raises(ValueError, match="missing columns"):
            load_catalog(path)

    def test_duplicate_symbol_is_rejected(self, tmp_path):
        path = write_catalog(
            tmp_path,
            "ABEA.DE,Alphabet,Alphabet,STOCK,REAL,XETRA,EUR,0.01,1,true",
            "ABEA.DE,Alphabet,Alphabet,STOCK,REAL,XETRA,EUR,0.01,1,true",
        )
        with pytest.raises(ValueError, match="duplicate"):
            load_catalog(path)

    def test_non_positive_point_size_is_rejected(self, tmp_path):
        path = write_catalog(
            tmp_path,
            "ABEA.DE,Alphabet,Alphabet,STOCK,REAL,XETRA,EUR,0,1,true",
        )
        with pytest.raises(ValueError, match="positive"):
            load_catalog(path)

    def test_aliases_column_is_optional_and_resolves(self, tmp_path):
        path = tmp_path / "symbols.csv"
        path.write_text(
            HEADER + ",aliases\n"
            "C7A0.DU,CATL,CATL,STOCK,REAL,XETRA,EUR,0.01,1,true,C7A0.DE;C7A0.XX\n"
            "ABEA.DE,Alphabet,Alphabet,STOCK,REAL,XETRA,EUR,0.01,1,true,\n",
            encoding="utf-8",
        )
        instruments = load_catalog(path)
        assert by_ticker(instruments)["C7A0.DU"].aliases == ("C7A0.DE", "C7A0.XX")
        assert by_ticker(instruments)["ABEA.DE"].aliases == ()
        assert resolve(instruments, "C7A0.DE").ticker == "C7A0.DU"
        assert resolve(instruments, "C7A0.DU").ticker == "C7A0.DU"
        assert resolve(instruments, "NOPE.XX") is None

    def test_alias_colliding_with_a_ticker_is_rejected(self, tmp_path):
        path = tmp_path / "symbols.csv"
        path.write_text(
            HEADER + ",aliases\n"
            "C7A0.DU,CATL,CATL,STOCK,REAL,XETRA,EUR,0.01,1,true,ABEA.DE\n"
            "ABEA.DE,Alphabet,Alphabet,STOCK,REAL,XETRA,EUR,0.01,1,true,\n",
            encoding="utf-8",
        )
        with pytest.raises(ValueError, match="alias 'ABEA.DE'"):
            load_catalog(path)

    def test_seed_catalog_aliases_catl_xetra_listing(self):
        assert resolve(load_catalog(), "C7A0.DE").ticker == "C7A0.DU"

    def test_seed_catalog_is_valid(self, fixture_catalog):
        instruments = load_catalog(fixture_catalog)
        assert len(instruments) == 6
        assert any(i.enabled for i in instruments)
        assert sum(1 for i in instruments if i.enabled) == 5
        disabled = [i for i in instruments if not i.enabled]
        assert {i.ticker for i in disabled} == {"GLD"}

    def test_live_catalog_invariants_hold(self):
        instruments = load_catalog()
        assert any(i.enabled for i in instruments)
        assert resolve(instruments, "C7A0.DE").ticker == "C7A0.DU"

    def test_non_eur_real_stocks_are_flagged_without_cfd(self, fixture_catalog):
        instruments = by_ticker(load_catalog(fixture_catalog))
        inst = instruments["3USL.L"]
        assert not inst.is_cfd
        reasons = inst.incompatibility_reasons()
        assert any(r.startswith("not EUR") for r in reasons)
        assert "CFD" not in reasons

    def test_three_decimal_point_size(self, fixture_catalog):
        a1p0 = by_ticker(load_catalog(fixture_catalog))["A1P0.DE"]
        assert a1p0.point_size == 0.001
