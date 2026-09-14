"""SQLite persistence. Nothing else in the codebase writes SQL.

Three tables:
- ``bars``       — OHLC keyed by (symbol, timeframe, ts), ts in UTC epoch seconds.
- ``sync_state`` — per symbol/timeframe outcome of the last sync attempt.
- ``settings``   — key/value store for server-side settings that should ride the
  ``data`` branch snapshot. Currently unused: it once held per-timeframe bar
  targets, and any surviving ``target_bars.*`` rows are inert.

Bars are append-only. Nothing here deletes one: a sync adds bars and overwrites
bars it re-fetched, so history the source can no longer serve is kept forever.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from .config import DB_PATH

_SCHEMA = """
CREATE TABLE IF NOT EXISTS bars (
    symbol    TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    ts        INTEGER NOT NULL,
    open      REAL NOT NULL,
    high      REAL NOT NULL,
    low       REAL NOT NULL,
    close     REAL NOT NULL,
    volume    REAL,
    PRIMARY KEY (symbol, timeframe, ts)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS sync_state (
    symbol         TEXT NOT NULL,
    timeframe      TEXT NOT NULL,
    last_sync_utc  TEXT,
    status         TEXT,
    message        TEXT,
    last_bar_ts    INTEGER,
    quote_currency TEXT,
    PRIMARY KEY (symbol, timeframe)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
) WITHOUT ROWID;
"""


@dataclass(frozen=True)
class Bar:
    ts: int  # UTC epoch seconds
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


def init_db(path: Path | None = None) -> None:
    with connect(path) as conn:
        conn.executescript(_SCHEMA)


@contextmanager
def connect(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    path = path or DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------- bars ----------

def upsert_bars(conn: sqlite3.Connection, symbol: str, tf_key: str, bars: list[Bar]) -> int:
    """Insert or overwrite bars. Overwriting matters: Yahoo revises recent candles."""
    if not bars:
        return 0
    conn.executemany(
        """
        INSERT INTO bars (symbol, timeframe, ts, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (symbol, timeframe, ts) DO UPDATE SET
            open = excluded.open, high = excluded.high,
            low = excluded.low, close = excluded.close, volume = excluded.volume
        """,
        [(symbol, tf_key, b.ts, b.open, b.high, b.low, b.close, b.volume) for b in bars],
    )
    return len(bars)


def get_bars(
    conn: sqlite3.Connection,
    symbol: str,
    tf_key: str,
    start: int | None = None,
    end: int | None = None,
) -> list[Bar]:
    query = "SELECT ts, open, high, low, close, volume FROM bars WHERE symbol = ? AND timeframe = ?"
    params: list = [symbol, tf_key]
    if start is not None:
        query += " AND ts >= ?"
        params.append(start)
    if end is not None:
        query += " AND ts <= ?"
        params.append(end)
    query += " ORDER BY ts ASC"
    return [Bar(*row) for row in conn.execute(query, params)]


def last_ts(conn: sqlite3.Connection, symbol: str, tf_key: str) -> int | None:
    row = conn.execute(
        "SELECT MAX(ts) FROM bars WHERE symbol = ? AND timeframe = ?", (symbol, tf_key)
    ).fetchone()
    return row[0]


def first_ts(conn: sqlite3.Connection, symbol: str, tf_key: str) -> int | None:
    row = conn.execute(
        "SELECT MIN(ts) FROM bars WHERE symbol = ? AND timeframe = ?", (symbol, tf_key)
    ).fetchone()
    return row[0]


def bar_count(conn: sqlite3.Connection, symbol: str, tf_key: str) -> int:
    row = conn.execute(
        "SELECT COUNT(*) FROM bars WHERE symbol = ? AND timeframe = ?", (symbol, tf_key)
    ).fetchone()
    return row[0]


def bar_counts(conn: sqlite3.Connection) -> dict[tuple[str, str], int]:
    return {
        (symbol, tf): count
        for symbol, tf, count in conn.execute(
            "SELECT symbol, timeframe, COUNT(*) FROM bars GROUP BY symbol, timeframe"
        )
    }


# ---------- sync state ----------

def record_sync(
    conn: sqlite3.Connection,
    symbol: str,
    tf_key: str,
    *,
    status: str,
    message: str,
    last_sync_utc: str,
    last_bar_ts: int | None = None,
    quote_currency: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO sync_state (symbol, timeframe, last_sync_utc, status, message, last_bar_ts, quote_currency)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (symbol, timeframe) DO UPDATE SET
            last_sync_utc = excluded.last_sync_utc,
            status = excluded.status,
            message = excluded.message,
            last_bar_ts = COALESCE(excluded.last_bar_ts, sync_state.last_bar_ts),
            quote_currency = COALESCE(excluded.quote_currency, sync_state.quote_currency)
        """,
        (symbol, tf_key, last_sync_utc, status, message, last_bar_ts, quote_currency),
    )


def get_sync_state(conn: sqlite3.Connection) -> dict[tuple[str, str], dict]:
    return {
        (symbol, tf): {
            "last_sync_utc": last_sync,
            "status": status,
            "message": message,
            "last_bar_ts": bar_ts,
            "quote_currency": currency,
        }
        for symbol, tf, last_sync, status, message, bar_ts, currency in conn.execute(
            "SELECT symbol, timeframe, last_sync_utc, status, message, last_bar_ts, quote_currency"
            " FROM sync_state"
        )
    }


def observed_currency(conn: sqlite3.Connection, symbol: str) -> str | None:
    """The currency Yahoo most recently reported for the symbol, if any."""
    row = conn.execute(
        """
        SELECT quote_currency FROM sync_state
        WHERE symbol = ? AND quote_currency IS NOT NULL
        ORDER BY last_sync_utc DESC LIMIT 1
        """,
        (symbol,),
    ).fetchone()
    return row[0] if row else None
