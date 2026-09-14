"""The dev HTTP surface: the data contract served from SQLite, sync endpoints,
and the static frontend.

Only the sync endpoints can cause network traffic to Yahoo, and only because
the user posted to them. Every ``data/*`` endpoint reads local storage.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict

from . import contract, screener_scores, store
from .catalog import by_ticker, load_catalog
from .config import TIMEFRAME_ORDER, TIMEFRAMES, WEB_DIR
from .sync import runner


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    store.init_db()
    yield


app = FastAPI(title="chartwatch", version="0.1.0", lifespan=lifespan)


class SyncRequest(BaseModel):
    # Unknown fields are refused rather than dropped: a caller still sending the
    # removed `targets` is working from a contract that no longer exists, and
    # should hear so instead of silently syncing at a depth it did not ask for.
    model_config = ConfigDict(extra="forbid")

    symbols: list[str] | None = None
    full: bool = False


@app.get("/data/meta.json")
def meta() -> dict:
    with store.connect() as conn:
        return contract.build_meta(conn, mode="dev")


@app.get("/data/catalog.json")
def catalog_payload() -> dict:
    instruments = load_catalog()
    with store.connect() as conn:
        return contract.build_catalog(conn, instruments)


@app.get("/data/scan-bars.json")
def scan_bars() -> dict:
    instruments = load_catalog()
    with store.connect() as conn:
        return contract.build_scan_bars(conn, instruments)


@app.get("/data/screener-scores.json")
def screener_scores_payload() -> dict:
    instruments = load_catalog()
    with store.connect() as conn:
        catalog = contract.build_catalog(conn, instruments)
        scan_bars = contract.build_scan_bars(conn, instruments)
        return screener_scores.build_screener_scores(catalog, scan_bars)


@app.get("/data/candles/{symbol}/{timeframe}.json")
def candles(symbol: str, timeframe: str) -> dict:
    if timeframe not in TIMEFRAMES:
        raise HTTPException(
            status_code=400,
            detail=f"unknown timeframe {timeframe!r}, expected one of {TIMEFRAME_ORDER}",
        )
    if symbol not in by_ticker(load_catalog()):
        raise HTTPException(status_code=404, detail=f"unknown symbol {symbol!r}")
    with store.connect() as conn:
        return contract.build_candles(conn, symbol, timeframe)


@app.post("/api/sync")
def start_sync(request: SyncRequest) -> dict:
    started = runner.try_start(symbols=request.symbols, full=request.full)
    if not started:
        raise HTTPException(status_code=409, detail="a sync is already running")
    return {"started": True, "status": runner.snapshot()}


@app.get("/api/sync/status")
def sync_status() -> dict:
    return runner.snapshot()


# Mounted last: real routes above always win, so this only serves the frontend
# files (index.html at "/", app.js, styles, indicator modules).
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="frontend")
