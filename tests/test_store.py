"""Storage: upsert semantics, append-only guarantees, sync state."""

from __future__ import annotations

import pytest

from chartwatch import store
from chartwatch.store import Bar


@pytest.fixture
def db(tmp_path):
    path = tmp_path / "market.db"
    store.init_db(path)
    return path


def make_bars(count: int, start_ts: int = 1_700_000_000, step: int = 3600) -> list[Bar]:
    return [
        Bar(ts=start_ts + i * step, open=1.0 + i, high=2.0 + i, low=0.5 + i, close=1.5 + i, volume=100.0)
        for i in range(count)
    ]


class TestUpsert:
    def test_roundtrip(self, db):
        bars = make_bars(5)
        with store.connect(db) as conn:
            written = store.upsert_bars(conn, "ABEA.DE", "h1", bars)
            assert written == 5
            assert store.get_bars(conn, "ABEA.DE", "h1") == bars

    def test_revised_bar_overwrites(self, db):
        bars = make_bars(3)
        with store.connect(db) as conn:
            store.upsert_bars(conn, "ABEA.DE", "h1", bars)
            revised = Bar(ts=bars[-1].ts, open=9.0, high=10.0, low=8.0, close=9.5, volume=42.0)
            store.upsert_bars(conn, "ABEA.DE", "h1", [revised])
            stored = store.get_bars(conn, "ABEA.DE", "h1")
        assert len(stored) == 3
        assert stored[-1] == revised

    def test_symbols_and_timeframes_are_isolated(self, db):
        with store.connect(db) as conn:
            store.upsert_bars(conn, "ABEA.DE", "h1", make_bars(2))
            store.upsert_bars(conn, "ABEA.DE", "d1", make_bars(3))
            store.upsert_bars(conn, "NVD.DE", "h1", make_bars(4))
            assert store.bar_count(conn, "ABEA.DE", "h1") == 2
            assert store.bar_count(conn, "ABEA.DE", "d1") == 3
            assert store.bar_counts(conn)[("NVD.DE", "h1")] == 4

    def test_range_query_and_last_ts(self, db):
        bars = make_bars(10, start_ts=1000, step=100)
        with store.connect(db) as conn:
            store.upsert_bars(conn, "S", "h1", bars)
            window = store.get_bars(conn, "S", "h1", start=1200, end=1500)
            assert [b.ts for b in window] == [1200, 1300, 1400, 1500]
            assert store.last_ts(conn, "S", "h1") == 1900
            assert store.last_ts(conn, "S", "d1") is None


class TestAppendOnly:
    def test_overlapping_upsert_revises_without_deleting(self, db):
        original = make_bars(10)
        # What an incremental sync sends: the newest few bars again, revised, plus
        # genuinely new ones.
        revised = [
            Bar(ts=b.ts, open=b.open + 100, high=b.high + 100, low=b.low + 100,
                close=b.close + 100, volume=1.0)
            for b in original[-3:]
        ]
        new = make_bars(2, start_ts=original[-1].ts + 3600)

        with store.connect(db) as conn:
            store.upsert_bars(conn, "S", "h1", original)
            store.upsert_bars(conn, "S", "h1", revised + new)
            stored = store.get_bars(conn, "S", "h1")

        assert len(stored) == 12  # 10 + 2 appended, nothing removed
        assert stored[:7] == original[:7]  # bars outside the overlap are untouched
        assert stored[7:10] == revised  # bars inside it carry the new values
        assert stored[10:] == new

    def test_a_shallow_refetch_never_shrinks_a_deep_series(self, db):
        # The case removing pruning exists for: a series far deeper than any
        # single fetch window must survive a sync that returns only recent bars.
        deep = make_bars(1_500)
        with store.connect(db) as conn:
            store.upsert_bars(conn, "S", "d1", deep)
            store.upsert_bars(conn, "S", "d1", deep[-5:])
            assert store.bar_count(conn, "S", "d1") == 1_500
            assert store.first_ts(conn, "S", "d1") == deep[0].ts

    def test_repeated_upserts_only_grow_the_count(self, db):
        with store.connect(db) as conn:
            counts = []
            for batch in range(4):
                store.upsert_bars(conn, "S", "h1", make_bars(10, start_ts=1_700_000_000 + batch * 5 * 3600))
                counts.append(store.bar_count(conn, "S", "h1"))
        assert counts == sorted(counts)
        assert all(b >= a for a, b in zip(counts, counts[1:], strict=False))

    def test_no_write_path_deletes_bars(self, db):
        # Guards the invariant rather than a single call site: if a delete helper
        # comes back, this fails before anything ships that could lose history.
        assert not [name for name in dir(store) if "prune" in name or "delete" in name]


class TestSyncState:
    def test_record_and_read_back(self, db):
        with store.connect(db) as conn:
            store.record_sync(
                conn, "ABEA.DE", "d1",
                status="ok", message="", last_sync_utc="2026-08-12T10:00:00+00:00",
                last_bar_ts=1_700_000_000, quote_currency="EUR",
            )
            state = store.get_sync_state(conn)[("ABEA.DE", "d1")]
        assert state["status"] == "ok"
        assert state["last_bar_ts"] == 1_700_000_000
        assert state["quote_currency"] == "EUR"

    def test_error_update_keeps_last_known_currency_and_bar(self, db):
        with store.connect(db) as conn:
            store.record_sync(
                conn, "S", "d1", status="ok", message="",
                last_sync_utc="t1", last_bar_ts=100, quote_currency="EUR",
            )
            store.record_sync(
                conn, "S", "d1", status="error", message="rate limited",
                last_sync_utc="t2", last_bar_ts=None, quote_currency=None,
            )
            state = store.get_sync_state(conn)[("S", "d1")]
        assert state["status"] == "error"
        assert state["last_bar_ts"] == 100
        assert state["quote_currency"] == "EUR"

    def test_observed_currency(self, db):
        with store.connect(db) as conn:
            assert store.observed_currency(conn, "S") is None
            store.record_sync(
                conn, "S", "d1", status="ok", message="",
                last_sync_utc="t1", quote_currency="USD",
            )
            assert store.observed_currency(conn, "S") == "USD"
