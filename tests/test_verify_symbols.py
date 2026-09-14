"""Tests for Yahoo symbol verification tooling."""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import pytest

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tools"))

from verify_catalog_symbols import (  # noqa: E402
    Verdict,
    probe_symbol,
    sha256,
    verify_symbols,
)
from chartwatch.fetch import Bar, FetchResult  # noqa: E402

NOW = datetime(2026, 8, 19, 12, 0, 0, tzinfo=UTC)


def _bar() -> Bar:
    return Bar(ts=1_700_000_000, open=1, high=2, low=0.5, close=1.5, volume=10.0)


class TestProbeSymbol:
    def test_has_data(self):
        with patch("verify_catalog_symbols.fetch_bars") as fetch:
            fetch.return_value = FetchResult(bars=[_bar()], currency="EUR")
            result = probe_symbol("AAA.DE", now=NOW)
        assert result.verdict == Verdict.HAS_DATA
        assert result.currency == "EUR"
        assert result.bar_count == 1
        fetch.assert_called_once()

    def test_unknown_ticker(self):
        with patch("verify_catalog_symbols.fetch_bars") as fetch:
            fetch.return_value = FetchResult(error="no data for AAA.DE")
            result = probe_symbol("AAA.DE", now=NOW)
        assert result.verdict == Verdict.UNKNOWN_TICKER
        fetch.assert_called_once()

    def test_empty_window_reprobes_with_longer_lookback(self):
        with patch("verify_catalog_symbols.fetch_bars") as fetch:
            fetch.side_effect = [
                FetchResult(currency="EUR"),
                FetchResult(bars=[_bar()], currency="EUR"),
            ]
            result = probe_symbol("AAA.DE", now=NOW)
        assert result.verdict == Verdict.HAS_DATA
        assert fetch.call_count == 2
        short_start = fetch.call_args_list[0][0][2]
        long_start = fetch.call_args_list[1][0][2]
        assert (NOW - short_start).days == 365 * 2
        assert (NOW - long_start).days == 365 * 10

    def test_empty_window_on_both_probes(self):
        with patch("verify_catalog_symbols.fetch_bars") as fetch:
            fetch.return_value = FetchResult(currency="EUR")
            result = probe_symbol("AAA.DE", now=NOW)
        assert result.verdict == Verdict.EMPTY_WINDOW
        assert fetch.call_count == 2

    def test_rate_limited_is_unknown(self):
        with patch("verify_catalog_symbols.fetch_bars") as fetch:
            fetch.return_value = FetchResult(error="rate limited by Yahoo: 429")
            result = probe_symbol("AAA.DE", now=NOW)
        assert result.verdict == Verdict.UNKNOWN


class TestVerifyToolGuard:
    def test_catalog_hash_unchanged(self, tmp_path):
        catalog = tmp_path / "symbols.csv"
        catalog.write_text(
            "ticker,display_name,name,asset_class,instrument_type,"
            "exchange,quote_currency,point_size,price_divisor,enabled\n"
            "AAA.DE,name,AAA,ETF,REAL,XETRA,EUR,0.01,1,true\n",
            encoding="utf-8",
        )
        before = sha256(catalog)
        with patch("verify_catalog_symbols.fetch_bars") as fetch:
            fetch.return_value = FetchResult(bars=[_bar()], currency="EUR")
            results = verify_symbols(["AAA.DE"], now=NOW)
        assert results[0].verdict == Verdict.HAS_DATA
        assert sha256(catalog) == before
