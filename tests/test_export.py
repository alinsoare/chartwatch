"""Export round-trip: the static files must match the dev endpoints in shape."""

from __future__ import annotations

import json
import re

import pytest
from fastapi.testclient import TestClient

from chartwatch import api, store
from chartwatch.config import ROOT, TIMEFRAME_ORDER
from chartwatch.export import export_site
from chartwatch.store import Bar


def scan_cache_version() -> int:
    scan_js = (ROOT / "web" / "screener" / "scan.js").read_text(encoding="utf-8")
    match = re.search(r"SCAN_CACHE_VERSION = (\d+)", scan_js)
    assert match, "SCAN_CACHE_VERSION not found in scan.js"
    return int(match.group(1))


@pytest.fixture
def client(monkeypatch, tmp_path):
    db = tmp_path / "market.db"
    monkeypatch.setattr(store, "DB_PATH", db)
    store.init_db(db)
    with store.connect() as conn:
        bars = [
            Bar(ts=1_700_000_000 + i * 3600, open=1, high=2, low=0.5, close=1.5, volume=9.0)
            for i in range(5)
        ]
        store.upsert_bars(conn, "ABEA.DE", "h1", bars)
        store.record_sync(
            conn, "ABEA.DE", "h1", status="ok", message="",
            last_sync_utc="2026-08-12T10:00:00+00:00", quote_currency="EUR",
        )
    with TestClient(api.app) as test_client:
        yield test_client


def test_export_round_trip(client, tmp_path):
    out = tmp_path / "dist"
    written = export_site(out)
    assert written > 0

    # Frontend files came along.
    assert (out / "index.html").exists()
    assert (out / "app.js").exists()
    assert (out / "indicators" / "fvg.js").exists()

    # meta.json: identical shape, mode flips to "static".
    exported_meta = json.loads((out / "data" / "meta.json").read_text())
    dev_meta = client.get("/data/meta.json").json()
    assert exported_meta["mode"] == "static"
    assert dev_meta["mode"] == "dev"
    for volatile in ("generated_utc", "mode"):
        exported_meta.pop(volatile), dev_meta.pop(volatile)
    assert exported_meta == dev_meta
    assert set(exported_meta["timeframes"]["d1"]) == {"label", "seconds"}

    # catalog.json: identical modulo generation time.
    exported_catalog = json.loads((out / "data" / "catalog.json").read_text())
    dev_catalog = client.get("/data/catalog.json").json()
    exported_catalog.pop("generated_utc"), dev_catalog.pop("generated_utc")
    assert exported_catalog == dev_catalog

    # scan-bars.json: identical modulo generation time.
    exported_scan = json.loads((out / "data" / "scan-bars.json").read_text())
    dev_scan = client.get("/data/scan-bars.json").json()
    exported_scan.pop("generated_utc")
    dev_scan.pop("generated_utc")
    assert exported_scan == dev_scan

    # screener-scores.json: identical modulo generation time.
    exported_scores = json.loads((out / "data" / "screener-scores.json").read_text())
    dev_scores = client.get("/data/screener-scores.json").json()
    assert exported_scores["scoring_model_version"] == scan_cache_version()
    assert exported_scores["scoring_model_version"] == dev_scores["scoring_model_version"]
    exported_scores.pop("generated_utc")
    dev_scores.pop("generated_utc")
    assert exported_scores == dev_scores

    disabled = exported_scores["symbols"]["GLD"]
    assert disabled["status"] == "not-screened"
    assert disabled["score"] == 0
    assert disabled["marks"] == 0
    assert disabled["reasons"] == []

    # Candle files exist for every symbol and timeframe, byte-identical in shape.
    symbols = [s["ticker"] for s in exported_catalog["symbols"]]
    for symbol in symbols:
        for tf_key in TIMEFRAME_ORDER:
            path = out / "data" / "candles" / symbol / f"{tf_key}.json"
            assert path.exists(), f"missing {path}"
            exported = json.loads(path.read_text())
            dev = client.get(f"/data/candles/{symbol}/{tf_key}.json").json()
            assert exported == dev

    # The seeded bars actually round-tripped.
    abea = json.loads((out / "data" / "candles" / "ABEA.DE" / "h1.json").read_text())
    assert len(abea["candles"]) == 5
    assert abea["candles"][0]["time"] == 1_700_000_000
