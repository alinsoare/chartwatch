"""Sync orchestration: window math, append-only runs, skipping, isolation."""

from __future__ import annotations

import inspect
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from chartwatch import fetch, store, sync
from chartwatch.config import TIMEFRAMES
from chartwatch.store import Bar
from chartwatch.sync import OVERLAP_BARS, SyncRunner

HEADER = (
    "ticker,display_name,name,asset_class,instrument_type,"
    "exchange,quote_currency,point_size,price_divisor,enabled"
)
ROW = "{s},{name},{s},STOCK,REAL,XETRA,{cur},0.01,1,{enabled}"


@pytest.fixture
def catalog_csv(tmp_path) -> Path:
    path = tmp_path / "symbols.csv"
    rows = [
        ROW.format(s="AAA.DE", name="Aaa AG", cur="EUR", enabled="true"),
        ROW.format(s="BBB.DE", name="Bbb AG", cur="EUR", enabled="true"),
        ROW.format(s="OFF.DE", name="Off AG", cur="EUR", enabled="false"),
    ]
    path.write_text("\n".join([HEADER, *rows]) + "\n", encoding="utf-8")
    return path


@pytest.fixture
def db_path(tmp_path) -> Path:
    return tmp_path / "market.db"


class FetchRecorder:
    """Replaces fetch.fetch_bars; returns canned bars and records every call."""

    def __init__(self, bars_by_symbol=None, errors=None):
        self.calls: list[dict] = []
        self.bars_by_symbol = bars_by_symbol or {}
        self.errors = errors or {}

    def __call__(self, ticker, tf, start, end=None, price_divisor=1.0):
        self.calls.append(
            {"symbol": ticker, "tf": tf.key, "start": start, "divisor": price_divisor}
        )
        if ticker in self.errors:
            return fetch.FetchResult(error=self.errors[ticker])
        bars = self.bars_by_symbol.get((ticker, tf.key), [])
        return fetch.FetchResult(bars=bars, currency="EUR")


@pytest.fixture
def recorder(monkeypatch):
    rec = FetchRecorder()
    monkeypatch.setattr(sync.fetch, "fetch_bars", rec)
    monkeypatch.setattr(sync.fetch, "pause_between_chunks", lambda _: None)
    return rec


def seed_bars(db_path, symbol, tf_key, count, end: datetime | None = None):
    """Store `count` bars ending near `end` (default: now)."""
    tf = TIMEFRAMES[tf_key]
    end = end or datetime.now(UTC)
    end_ts = int(end.timestamp()) // tf.seconds * tf.seconds
    bars = [
        Bar(ts=end_ts - i * tf.seconds, open=1, high=2, low=0.5, close=1.5)
        for i in range(count)
    ][::-1]
    store.init_db(db_path)
    with store.connect(db_path) as conn:
        store.upsert_bars(conn, symbol, tf_key, bars)
    return bars


def seed_newest(db_path, symbol, tf_key, newest: datetime):
    """Store a single bar stamped exactly at `newest`.

    The skip rule measures age from the newest stored bar, so these tests need
    an exact timestamp rather than one rounded to a bar boundary — flooring a
    W1 bar can move it most of a week.
    """
    bar = Bar(ts=int(newest.timestamp()), open=1, high=2, low=0.5, close=1.5)
    store.init_db(db_path)
    with store.connect(db_path) as conn:
        store.upsert_bars(conn, symbol, tf_key, [bar])
    return bar


class TestWindows:
    def test_a_run_carries_no_depth_parameter(self):
        # The whole target surface is gone: nothing about a run says how deep.
        for method in (SyncRunner.run, SyncRunner.try_start):
            params = set(inspect.signature(method).parameters)
            assert "targets" not in params
            assert params == {"self", "symbols", "full", "periodic"}

    def test_first_sync_uses_the_timeframes_fetch_window(self, db_path, catalog_csv, recorder):
        SyncRunner(db_path, catalog_csv).run(symbols=["AAA.DE"])
        by_tf = {c["tf"]: c["start"] for c in recorder.calls}
        # D1 and W1 are uncapped, so a first sync reaches the fixed early date.
        assert by_tf["d1"] == fetch.FULL_HISTORY_START
        assert by_tf["w1"] == fetch.FULL_HISTORY_START
        # H1 goes as deep as the source serves it.
        assert (datetime.now(UTC) - by_tf["h1"]).days == TIMEFRAMES["h1"].yahoo_max_days - 1

    def test_repeat_sync_is_incremental(self, db_path, catalog_csv, recorder):
        for tf_key in TIMEFRAMES:
            seed_bars(db_path, "AAA.DE", tf_key, 50)
        SyncRunner(db_path, catalog_csv).run(symbols=["AAA.DE"])

        for call in recorder.calls:
            tf = TIMEFRAMES[call["tf"]]
            with store.connect(db_path) as conn:
                newest = store.last_ts(conn, "AAA.DE", call["tf"])
            expected = datetime.fromtimestamp(newest, UTC) - timedelta(
                seconds=OVERLAP_BARS * tf.seconds
            )
            assert call["start"] == expected, f"{call['tf']} was not incremental"

    def test_incremental_start_is_not_raised_to_the_fetch_window(
        self, db_path, catalog_csv, recorder
    ):
        # An H1 series that has accumulated past the 730-day cap: the incremental
        # start sits *outside* the fetch window and must be left there. Clamping
        # it forward is the request-size-grows-with-depth bug this guards.
        tf = TIMEFRAMES["h1"]
        seeded = seed_newest(db_path, "AAA.DE", "h1", datetime.now(UTC) - timedelta(days=800))

        SyncRunner(db_path, catalog_csv).run(symbols=["AAA.DE"])
        h1_start = next(c["start"] for c in recorder.calls if c["tf"] == "h1")

        expected = datetime.fromtimestamp(seeded.ts, UTC) - timedelta(
            seconds=OVERLAP_BARS * tf.seconds
        )
        assert h1_start == expected
        assert h1_start < fetch.backfill_start(tf)

    def test_repeat_sync_never_shrinks_the_stored_series(
        self, db_path, catalog_csv, recorder
    ):
        for tf_key in TIMEFRAMES:
            seed_bars(db_path, "AAA.DE", tf_key, 1_500)
        with store.connect(db_path) as conn:
            before = {tf: store.bar_count(conn, "AAA.DE", tf) for tf in TIMEFRAMES}

        SyncRunner(db_path, catalog_csv).run(symbols=["AAA.DE"])

        with store.connect(db_path) as conn:
            after = {tf: store.bar_count(conn, "AAA.DE", tf) for tf in TIMEFRAMES}
        assert all(after[tf] >= before[tf] for tf in TIMEFRAMES), (before, after)

    def test_full_refresh_re_pulls_the_window_and_keeps_older_bars(
        self, db_path, catalog_csv, recorder
    ):
        # H1 bars from well outside the 730-day cap: a full refresh re-requests
        # the window, and the bars the source can no longer serve stay put.
        old = seed_bars(
            db_path, "AAA.DE", "h1", 40, end=datetime.now(UTC) - timedelta(days=800)
        )
        SyncRunner(db_path, catalog_csv).run(symbols=["AAA.DE"], full=True)

        h1_start = next(c["start"] for c in recorder.calls if c["tf"] == "h1")
        # The fetch window, not the stored depth: 800-day-old bars do not drag it
        # back, and the request stays inside what the source will serve.
        assert (datetime.now(UTC) - h1_start).days <= TIMEFRAMES["h1"].yahoo_max_days
        assert h1_start > datetime.fromtimestamp(old[-1].ts, UTC)

        with store.connect(db_path) as conn:
            assert store.bar_count(conn, "AAA.DE", "h1") == len(old)
            assert store.first_ts(conn, "AAA.DE", "h1") == old[0].ts

    def test_a_sync_never_prunes_what_it_wrote(self, db_path, catalog_csv, monkeypatch):
        tf = TIMEFRAMES["d1"]
        now_ts = int(datetime.now(UTC).timestamp()) // tf.seconds * tf.seconds
        bars = [
            Bar(ts=now_ts - i * tf.seconds, open=1, high=2, low=0.5, close=1.5)
            for i in range(1_500)
        ][::-1]
        rec = FetchRecorder(bars_by_symbol={("AAA.DE", "d1"): bars})
        monkeypatch.setattr(sync.fetch, "fetch_bars", rec)
        monkeypatch.setattr(sync.fetch, "pause_between_chunks", lambda _: None)

        SyncRunner(db_path, catalog_csv).run(symbols=["AAA.DE"])
        with store.connect(db_path) as conn:
            # 1,500 — deeper than the old 1,000-bar target, and nothing trims it.
            assert store.bar_count(conn, "AAA.DE", "d1") == 1_500


class TestPeriodicSkipping:
    """A periodic run leaves alone what the source cannot yet have added."""

    def seed_mixed_ages(self, db_path):
        now = datetime.now(UTC)
        seed_newest(db_path, "AAA.DE", "w1", now - timedelta(days=2))  # < 7d: skip
        seed_newest(db_path, "AAA.DE", "d1", now - timedelta(hours=2))  # < 24h: skip
        seed_newest(db_path, "AAA.DE", "h1", now - timedelta(minutes=70))  # > 1h: fetch

    def test_periodic_run_skips_only_what_cannot_have_a_new_bar(
        self, db_path, catalog_csv, recorder
    ):
        self.seed_mixed_ages(db_path)
        progress = SyncRunner(db_path, catalog_csv).run(
            symbols=["AAA.DE"], periodic=True
        )

        assert {c["tf"] for c in recorder.calls} == {"h1"}
        assert progress.results[0].skipped == ["d1", "w1"]
        assert progress.periodic is True

    def test_periodic_run_fetches_nothing_when_every_timeframe_is_too_recent(
        self, db_path, catalog_csv, recorder
    ):
        now = datetime.now(UTC)
        seed_newest(db_path, "AAA.DE", "w1", now - timedelta(days=2))
        seed_newest(db_path, "AAA.DE", "d1", now - timedelta(hours=2))
        seed_newest(db_path, "AAA.DE", "h1", now - timedelta(minutes=30))
        with store.connect(db_path) as conn:
            store.record_sync(
                conn, "AAA.DE", "h1", status="ok", message="",
                last_sync_utc="2026-01-01T00:00:00+00:00", last_bar_ts=42,
            )

        progress = SyncRunner(db_path, catalog_csv).run(
            symbols=["AAA.DE"], periodic=True
        )

        assert recorder.calls == []
        assert progress.results[0].skipped == ["h1", "d1", "w1"]
        assert progress.results[0].status == "ok"
        with store.connect(db_path) as conn:
            h1 = store.get_sync_state(conn)[("AAA.DE", "h1")]
        assert h1["last_sync_utc"] == "2026-01-01T00:00:00+00:00"
        assert h1["last_bar_ts"] == 42

    def test_a_timeframe_holding_no_bars_is_never_skipped(
        self, db_path, catalog_csv, recorder
    ):
        now = datetime.now(UTC)
        seed_newest(db_path, "AAA.DE", "w1", now - timedelta(days=2))
        seed_newest(db_path, "AAA.DE", "d1", now - timedelta(hours=2))
        # h1 deliberately left empty: no newest bar to measure against.
        SyncRunner(db_path, catalog_csv).run(symbols=["AAA.DE"], periodic=True)
        assert any(c["tf"] == "h1" for c in recorder.calls)

    def test_a_skip_leaves_the_recorded_sync_state_untouched(
        self, db_path, catalog_csv, recorder
    ):
        self.seed_mixed_ages(db_path)
        with store.connect(db_path) as conn:
            store.record_sync(
                conn, "AAA.DE", "w1", status="ok", message="",
                last_sync_utc="2026-01-01T00:00:00+00:00", last_bar_ts=42,
            )

        SyncRunner(db_path, catalog_csv).run(symbols=["AAA.DE"], periodic=True)

        with store.connect(db_path) as conn:
            w1 = store.get_sync_state(conn)[("AAA.DE", "w1")]
        # Freshness must keep reflecting the last run that actually fetched.
        assert w1["last_sync_utc"] == "2026-01-01T00:00:00+00:00"
        assert w1["last_bar_ts"] == 42

    def test_a_manual_run_skips_nothing(self, db_path, catalog_csv, recorder):
        self.seed_mixed_ages(db_path)
        progress = SyncRunner(db_path, catalog_csv).run(symbols=["AAA.DE"])

        assert {c["tf"] for c in recorder.calls} == set(TIMEFRAMES)
        assert progress.results[0].skipped == []
        assert progress.periodic is False


class TestScopeAndIsolation:
    def test_disabled_symbols_are_never_fetched(self, db_path, catalog_csv, recorder):
        SyncRunner(db_path, catalog_csv).run()
        symbols = {c["symbol"] for c in recorder.calls}
        assert symbols == {"AAA.DE", "BBB.DE"}

    def test_symbol_subset_is_respected(self, db_path, catalog_csv, recorder):
        SyncRunner(db_path, catalog_csv).run(symbols=["BBB.DE"])
        assert {c["symbol"] for c in recorder.calls} == {"BBB.DE"}

    def test_one_failing_symbol_does_not_abort_the_run(self, db_path, catalog_csv, monkeypatch):
        rec = FetchRecorder(errors={"AAA.DE": "no data for AAA.DE"})
        monkeypatch.setattr(sync.fetch, "fetch_bars", rec)
        monkeypatch.setattr(sync.fetch, "pause_between_chunks", lambda _: None)

        progress = SyncRunner(db_path, catalog_csv).run()
        by_symbol = {r.ticker: r for r in progress.results}
        assert by_symbol["AAA.DE"].status == "error"
        assert any("no data" in m for m in by_symbol["AAA.DE"].messages)
        assert by_symbol["BBB.DE"].status == "ok"
        # The failing symbol's error is recorded per timeframe too.
        with store.connect(db_path) as conn:
            state = store.get_sync_state(conn)
        assert state[("AAA.DE", "d1")]["status"] == "error"

    def test_unexpected_exception_is_isolated(self, db_path, catalog_csv, monkeypatch):
        def explode(ticker, tf, start, **kwargs):
            if ticker == "AAA.DE":
                raise RuntimeError("boom")
            return fetch.FetchResult(bars=[], currency="EUR")

        monkeypatch.setattr(sync.fetch, "fetch_bars", explode)
        monkeypatch.setattr(sync.fetch, "pause_between_chunks", lambda _: None)
        progress = SyncRunner(db_path, catalog_csv).run()
        by_symbol = {r.ticker: r for r in progress.results}
        assert by_symbol["AAA.DE"].status == "error"
        assert by_symbol["BBB.DE"].status == "ok"


class TestConcurrencyAndState:
    def test_second_trigger_is_rejected_while_running(self, db_path, catalog_csv, recorder):
        runner = SyncRunner(db_path, catalog_csv)
        assert runner._lock.acquire(blocking=False)  # simulate a run in flight
        try:
            assert runner.try_start() is False
        finally:
            runner._lock.release()

    def test_try_start_runs_in_background(self, db_path, catalog_csv, recorder):
        runner = SyncRunner(db_path, catalog_csv)
        assert runner.try_start(symbols=["AAA.DE"]) is True
        for _ in range(200):
            if not runner.running and runner.snapshot()["finished_utc"]:
                break
            import time

            time.sleep(0.01)
        snapshot = runner.snapshot()
        assert snapshot["finished_utc"] is not None
        assert snapshot["completed"] == snapshot["total"] == 1

    def test_sync_state_and_currency_notes(self, db_path, catalog_csv, monkeypatch):
        tf = TIMEFRAMES["d1"]
        ts = int(datetime.now(UTC).timestamp()) // tf.seconds * tf.seconds
        bars = [Bar(ts=ts, open=1, high=2, low=0.5, close=1.5)]

        def usd_fetch(ticker, tf, start, **kwargs):
            return fetch.FetchResult(bars=bars if tf.key == "d1" else [], currency="USD")

        monkeypatch.setattr(sync.fetch, "fetch_bars", usd_fetch)
        monkeypatch.setattr(sync.fetch, "pause_between_chunks", lambda _: None)

        progress = SyncRunner(db_path, catalog_csv).run(symbols=["AAA.DE"])
        result = progress.results[0]
        # Catalog says EUR, Yahoo said USD: both notes must surface.
        assert "quote currency is USD, not EUR" in result.messages
        assert "catalog says EUR but Yahoo reports USD" in result.messages

        with store.connect(db_path) as conn:
            state = store.get_sync_state(conn)[("AAA.DE", "d1")]
            assert state["status"] == "ok"
            assert state["last_bar_ts"] == ts
            assert store.observed_currency(conn, "AAA.DE") == "USD"
