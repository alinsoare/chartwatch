"""Static site exporter.

Writes the frontend plus the same JSON contract the dev server serves — built
by the shared ``contract`` module, so the two cannot drift — into an output
directory that any plain static file server (or GitHub Pages) can host.

``data/screener-scores.json`` is built by invoking ``scripts/build-screener-scores.mjs``
(Node required) so scores match ``web/screener/score.js`` exactly.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from . import contract, screener_scores, store
from .catalog import load_catalog
from .config import TIMEFRAME_ORDER, WEB_DIR


def export_site(out_dir: Path) -> int:
    """Export frontend + data. Returns the number of files written."""
    store.init_db()
    instruments = load_catalog()

    if out_dir.exists():
        shutil.rmtree(out_dir)
    shutil.copytree(WEB_DIR, out_dir)
    written = sum(1 for p in out_dir.rglob("*") if p.is_file())

    data_dir = out_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    with store.connect() as conn:
        written += _write_json(data_dir / "meta.json", contract.build_meta(conn, mode="static"))
        catalog = contract.build_catalog(conn, instruments)
        scan_bars = contract.build_scan_bars(conn, instruments)
        written += _write_json(data_dir / "catalog.json", catalog)
        written += _write_json(data_dir / "scan-bars.json", scan_bars)
        written += _write_json(
            data_dir / "screener-scores.json",
            screener_scores.build_screener_scores(catalog, scan_bars),
        )
        for instrument in instruments:
            symbol_dir = data_dir / "candles" / instrument.ticker
            symbol_dir.mkdir(parents=True, exist_ok=True)
            for tf_key in TIMEFRAME_ORDER:
                payload = contract.build_candles(conn, instrument.ticker, tf_key)
                written += _write_json(symbol_dir / f"{tf_key}.json", payload)

    return written


def _write_json(path: Path, payload: dict) -> int:
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return 1
