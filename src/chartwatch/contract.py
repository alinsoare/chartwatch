"""The JSON data contract shared by the dev server and the static exporter.

The frontend fetches these shapes at the same relative URLs in both modes:
- ``data/meta.json``
- ``data/catalog.json``
- ``data/scan-bars.json``
- ``data/screener-scores.json``
- ``data/candles/<symbol>/<timeframe>.json``

``data/screener-scores.json`` carries one scored entry per catalog symbol (enabled
and disabled), keyed by ``ticker``. Each entry mirrors ``scoreInstrument()``
from ``web/screener/score.js``. File-level fields include ``generated_utc`` (from
the catalog snapshot), ``scoring_model_version`` (``SCAN_CACHE_VERSION`` in
``scan.js``), and summary counts. Consumers should ignore unknown fields; breaking
changes are signaled by ``scoring_model_version``.

Both the dev API and the exporter build their payloads here, so the two
cannot drift apart.
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from . import store
from .catalog import Instrument
from .config import BASE_CURRENCY, TIMEFRAME_ORDER, TIMEFRAMES

SCAN_BAR_CAP = 420
SCAN_TIMEFRAMES = ("h1", "d1")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def build_meta(conn: sqlite3.Connection, mode: str) -> dict:
    """``data/meta.json``: mode, snapshot time, timeframe definitions."""
    return {
        "generated_utc": _now_iso(),
        "mode": mode,  # "dev" | "static" — the frontend keys sync controls off this
        "base_currency": BASE_CURRENCY,
        "timeframe_order": TIMEFRAME_ORDER,
        "timeframes": {
            key: {"label": tf.label, "seconds": tf.seconds}
            for key, tf in TIMEFRAMES.items()
        },
    }


def build_catalog(conn: sqlite3.Connection, instruments: list[Instrument]) -> dict:
    """``data/catalog.json``: instruments enriched with what the database knows."""
    counts = store.bar_counts(conn)
    state = store.get_sync_state(conn)

    payload = []
    for instrument in instruments:
        observed = store.observed_currency(conn, instrument.ticker)
        reasons = instrument.incompatibility_reasons(observed)

        per_tf = {}
        for tf_key in TIMEFRAME_ORDER:
            entry = state.get((instrument.ticker, tf_key), {})
            per_tf[tf_key] = {
                "bars": counts.get((instrument.ticker, tf_key), 0),
                "last_sync_utc": entry.get("last_sync_utc"),
                "status": entry.get("status"),
                "message": entry.get("message"),
            }

        last_syncs = [v["last_sync_utc"] for v in per_tf.values() if v["last_sync_utc"]]
        payload.append(
            {
                "ticker": instrument.ticker,
                "display_name": instrument.display_name,
                "name": instrument.name,
                "asset_class": instrument.asset_class,
                "instrument_type": instrument.instrument_type,
                "exchange": instrument.exchange,
                "quote_currency": instrument.effective_currency(observed),
                "catalog_currency": instrument.quote_currency,
                "observed_currency": observed,
                "point_size": instrument.point_size,
                "enabled": instrument.enabled,
                "compatible": not reasons,
                "incompatibility": reasons,
                "warnings": instrument.warnings(observed),
                "total_bars": sum(v["bars"] for v in per_tf.values()),
                "last_sync_utc": max(last_syncs) if last_syncs else None,
                "timeframes": per_tf,
            }
        )
    return {"generated_utc": _now_iso(), "symbols": payload}


def build_scan_bars(conn: sqlite3.Connection, instruments: list[Instrument]) -> dict:
    """``data/scan-bars.json``: recent H1/D1 bars for enabled instruments.

    Columnar, volume-free, capped at ``SCAN_BAR_CAP`` bars per timeframe (most
    recent, oldest first). Shorter series are served whole.
    """
    symbols: dict[str, dict] = {}
    for instrument in instruments:
        if not instrument.enabled:
            continue
        per_tf: dict[str, dict] = {}
        for tf_key in SCAN_TIMEFRAMES:
            bars = store.get_bars(conn, instrument.ticker, tf_key)
            if len(bars) > SCAN_BAR_CAP:
                bars = bars[-SCAN_BAR_CAP:]
            per_tf[tf_key] = {
                "t": [b.ts for b in bars],
                "o": [b.open for b in bars],
                "h": [b.high for b in bars],
                "l": [b.low for b in bars],
                "c": [b.close for b in bars],
            }
        symbols[instrument.ticker] = per_tf
    return {"generated_utc": _now_iso(), "symbols": symbols}


def build_candles(conn: sqlite3.Connection, symbol: str, tf_key: str) -> dict:
    """``data/candles/<symbol>/<timeframe>.json``.

    ``time`` is UTC epoch SECONDS — what lightweight-charts expects. JavaScript
    ``Date`` works in milliseconds; the frontend must multiply before any date
    arithmetic.
    """
    bars = store.get_bars(conn, symbol, tf_key)
    return {
        "symbol": symbol,
        "timeframe": tf_key,
        "candles": [
            {
                "time": b.ts,
                "open": b.open,
                "high": b.high,
                "low": b.low,
                "close": b.close,
                "volume": b.volume,
            }
            for b in bars
        ],
    }
