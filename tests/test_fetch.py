"""Fetch behavior against a mocked yfinance: windows, pinning, disambiguation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pandas as pd
import pytest
from yfinance.exceptions import YFRateLimitError

from chartwatch import fetch
from chartwatch.config import TIMEFRAMES

NOW = datetime(2026, 8, 12, 12, 0, tzinfo=UTC)


class FakeTicker:
    """Stands in for yf.Ticker; behavior injected per test."""

    frame: pd.DataFrame | None = None
    metadata: dict | None = None
    raises: Exception | None = None
    calls: list[dict] = []

    def __init__(self, symbol: str):
        self.symbol = symbol

    def history(self, **kwargs):
        FakeTicker.calls.append(kwargs)
        if FakeTicker.raises is not None:
            raise FakeTicker.raises
        return FakeTicker.frame

    @property
    def history_metadata(self):
        return FakeTicker.metadata


@pytest.fixture(autouse=True)
def fake_yf(monkeypatch, tmp_path):
    monkeypatch.setattr(fetch.yf, "Ticker", FakeTicker)
    monkeypatch.setattr(fetch.yf, "set_tz_cache_location", lambda _: None)
    monkeypatch.setattr(fetch.time, "sleep", lambda _: None)  # no real backoff waits
    FakeTicker.frame = None
    FakeTicker.metadata = None
    FakeTicker.raises = None
    FakeTicker.calls = []
    yield


def ohlc_frame(index: pd.DatetimeIndex, price: float = 100.0) -> pd.DataFrame:
    n = len(index)
    return pd.DataFrame(
        {
            "Open": [price] * n,
            "High": [price * 1.01] * n,
            "Low": [price * 0.99] * n,
            "Close": [price * 1.005] * n,
            "Volume": [1000.0] * n,
        },
        index=index,
    )


class TestBackfillStart:
    def test_h1_reaches_the_730_day_cap(self):
        tf = TIMEFRAMES["h1"]
        start = fetch.backfill_start(tf, now=NOW)
        # No depth of its own: "as deep as the source serves" is exactly the cap.
        assert tf.fetch_bars is None
        assert (NOW - start).days == tf.yahoo_max_days - 1

    @pytest.mark.parametrize("key", ["d1", "w1"])
    def test_uncapped_timeframes_start_at_the_fixed_early_date(self, key):
        tf = TIMEFRAMES[key]
        assert tf.fetch_bars is None and tf.yahoo_max_days is None
        # Deliberately not the Unix epoch: Yahoo treats period1=0 as unset.
        assert fetch.backfill_start(tf, now=NOW) == fetch.FULL_HISTORY_START
        assert fetch.FULL_HISTORY_START.year > 1970

    def test_clamp_start_stays_a_day_inside_the_cap(self):
        tf = TIMEFRAMES["h1"]
        too_deep = NOW - timedelta(days=5000)
        clamped = fetch.clamp_start(tf, too_deep, now=NOW)
        assert (NOW - clamped).days == tf.yahoo_max_days - 1

    def test_clamp_start_leaves_an_uncapped_timeframe_alone(self):
        deep = NOW - timedelta(days=5000)
        assert fetch.clamp_start(TIMEFRAMES["d1"], deep, now=NOW) == deep


class TestTimestampNormalization:
    def test_daily_bars_pin_to_local_session_date(self):
        # Yahoo stamps a Xetra daily bar at local midnight: 22:00 UTC the day
        # before in summer. The bar must land on UTC midnight of the LOCAL date.
        index = pd.DatetimeIndex(
            [pd.Timestamp("2026-03-09 22:00", tz="UTC").tz_convert("Europe/Berlin")]
        )
        assert index[0].hour == 23  # sanity: local midnight-ish stamp, pre-DST
        index = pd.DatetimeIndex([pd.Timestamp("2026-03-10 00:00", tz="Europe/Berlin")])
        FakeTicker.frame = ohlc_frame(index)
        FakeTicker.metadata = {"currency": "EUR"}

        result = fetch.fetch_bars("ABEA.DE", TIMEFRAMES["d1"], NOW - timedelta(days=5))
        assert result.ok
        pinned = datetime.fromtimestamp(result.bars[0].ts, UTC)
        assert (pinned.year, pinned.month, pinned.day) == (2026, 3, 10)
        assert (pinned.hour, pinned.minute) == (0, 0)

    def test_intraday_bars_keep_true_utc_instant(self):
        stamp = pd.Timestamp("2026-08-12 07:00", tz="UTC")
        FakeTicker.frame = ohlc_frame(pd.DatetimeIndex([stamp.tz_convert("Europe/Berlin")]))
        FakeTicker.metadata = {"currency": "EUR"}

        result = fetch.fetch_bars("ABEA.DE", TIMEFRAMES["h1"], NOW - timedelta(days=5))
        assert result.ok
        assert result.bars[0].ts == int(stamp.timestamp())


class TestPricesAndDisambiguation:
    def test_price_divisor_is_applied(self):
        index = pd.DatetimeIndex([pd.Timestamp("2026-08-11", tz="UTC")])
        FakeTicker.frame = ohlc_frame(index, price=1000.0)
        FakeTicker.metadata = {"currency": "GBP"}

        result = fetch.fetch_bars(
            "X.L", TIMEFRAMES["d1"], NOW - timedelta(days=5), price_divisor=100.0
        )
        assert result.bars[0].open == pytest.approx(10.0)
        assert result.currency == "GBP"

    def test_empty_frame_without_metadata_is_a_dead_ticker(self):
        FakeTicker.frame = pd.DataFrame()
        FakeTicker.metadata = {}
        result = fetch.fetch_bars("BOGUS.XX", TIMEFRAMES["d1"], NOW - timedelta(days=5))
        assert not result.ok
        assert "BOGUS.XX" in result.error

    def test_empty_frame_with_metadata_is_no_new_bars(self):
        FakeTicker.frame = pd.DataFrame()
        FakeTicker.metadata = {"currency": "EUR"}
        result = fetch.fetch_bars("ABEA.DE", TIMEFRAMES["d1"], NOW - timedelta(days=5))
        assert result.ok
        assert result.bars == []
        assert result.currency == "EUR"

    def test_start_at_or_after_end_is_an_empty_success(self):
        result = fetch.fetch_bars("ABEA.DE", TIMEFRAMES["d1"], NOW, end=NOW)
        assert result.ok and result.bars == []
        assert FakeTicker.calls == []  # no network attempt at all


class TestRateLimiting:
    def test_backoff_exhaustion_reports_rate_limit(self):
        FakeTicker.raises = YFRateLimitError()
        result = fetch.fetch_bars("ABEA.DE", TIMEFRAMES["d1"], NOW - timedelta(days=5))
        assert not result.ok
        assert "rate limited" in result.error
        assert len(FakeTicker.calls) == fetch.MAX_RETRIES

    def test_other_errors_fail_fast_without_retry(self):
        FakeTicker.raises = RuntimeError("boom")
        result = fetch.fetch_bars("ABEA.DE", TIMEFRAMES["d1"], NOW - timedelta(days=5))
        assert not result.ok
        assert "RuntimeError" in result.error
        assert len(FakeTicker.calls) == 1
