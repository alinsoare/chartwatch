"""On-demand synchronisation of Yahoo data into SQLite.

A run happens only because the user asked for one — a button in the dev UI, a
periodic refresh the user switched on for the current session, the headless CLI,
or a manually dispatched CI workflow. Nothing here starts a run on its own.

A run only ever adds bars. It carries no depth parameter: how deep an initial
backfill reaches is the timeframe's own property, and an incremental run starts
from just before the newest stored bar however deep the series has grown.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

from . import fetch, store
from .catalog import Instrument, enabled_instruments, load_catalog
from .config import BASE_CURRENCY, TIMEFRAME_ORDER, timeframe

log = logging.getLogger(__name__)

#: Bars re-requested past the newest stored one, so Yahoo's late revisions to
#: recent candles overwrite what we already have instead of being missed.
OVERLAP_BARS = 5


@dataclass
class SymbolResult:
    ticker: str
    status: str = "pending"
    bars_written: int = 0
    #: Timeframe keys a periodic run left alone because no new bar can exist yet.
    skipped: list[str] = field(default_factory=list)
    currency: str | None = None
    messages: list[str] = field(default_factory=list)


@dataclass
class SyncProgress:
    running: bool = False
    started_utc: str | None = None
    finished_utc: str | None = None
    total: int = 0
    completed: int = 0
    current: str | None = None
    full: bool = False
    #: True for a run driven by the periodic refresh, which skips timeframes that
    #: cannot yet have a new bar. A manual run always fetches every timeframe.
    periodic: bool = False
    results: list[SymbolResult] = field(default_factory=list)

    def snapshot(self) -> dict:
        return asdict(self)


class SyncRunner:
    """Owns sync execution and the progress state the UI polls.

    A single lock enforces one run at a time; the API turns a rejected
    acquisition into an HTTP 409 rather than queueing work nobody asked for twice.
    """

    def __init__(self, db_path: Path | None = None, catalog_path: Path | None = None) -> None:
        self._lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._progress = SyncProgress()
        self._db_path = db_path
        self._catalog_path = catalog_path

    @property
    def running(self) -> bool:
        return self._progress.running

    def snapshot(self) -> dict:
        with self._state_lock:
            return self._progress.snapshot()

    def try_start(
        self,
        *,
        symbols: list[str] | None = None,
        full: bool = False,
        periodic: bool = False,
    ) -> bool:
        """Begin a run in a worker thread. False when one is already running."""
        if not self._lock.acquire(blocking=False):
            return False
        thread = threading.Thread(
            target=self._run_and_release,
            kwargs={"symbols": symbols, "full": full, "periodic": periodic},
            daemon=True,
        )
        thread.start()
        return True

    def _run_and_release(self, **kwargs) -> None:
        try:
            self.run(**kwargs)
        finally:
            self._lock.release()

    def run(
        self,
        *,
        symbols: list[str] | None = None,
        full: bool = False,
        periodic: bool = False,
    ) -> SyncProgress:
        store.init_db(self._db_path)

        catalog = enabled_instruments(load_catalog(self._catalog_path))
        if symbols:
            wanted = set(symbols)
            catalog = [s for s in catalog if s.ticker in wanted]

        with self._state_lock:
            self._progress = SyncProgress(
                running=True,
                started_utc=_now_iso(),
                total=len(catalog),
                full=full,
                periodic=periodic,
                results=[SymbolResult(ticker=s.ticker) for s in catalog],
            )

        for index, instrument in enumerate(catalog):
            with self._state_lock:
                self._progress.current = instrument.ticker
            result = self._progress.results[index]
            try:
                self._sync_symbol(instrument, full=full, periodic=periodic, result=result)
                result.status = (
                    "error" if result.messages and not result.bars_written else "ok"
                )
            except Exception as exc:  # noqa: BLE001 - never let one symbol kill the run
                log.exception("sync failed for %s", instrument.ticker)
                result.status = "error"
                result.messages.append(f"{type(exc).__name__}: {exc}")
            finally:
                with self._state_lock:
                    self._progress.completed = index + 1
            fetch.pause_between_chunks(index + 1)

        with self._state_lock:
            self._progress.running = False
            self._progress.current = None
            self._progress.finished_utc = _now_iso()
            return self._progress

    def _sync_symbol(
        self,
        instrument: Instrument,
        *,
        full: bool,
        periodic: bool,
        result: SymbolResult,
    ) -> None:
        now = datetime.now(UTC)

        with store.connect(self._db_path) as conn:
            for tf_key in TIMEFRAME_ORDER:
                tf = timeframe(tf_key)
                if periodic and _cannot_have_a_new_bar(
                    conn, instrument.ticker, tf_key, now=now
                ):
                    # Deliberately no record_sync: freshness must keep reflecting
                    # the last run that actually fetched.
                    result.skipped.append(tf_key)
                    continue

                start = _start_for(conn, instrument.ticker, tf_key, full=full, now=now)

                outcome = fetch.fetch_bars(
                    instrument.ticker,
                    tf,
                    start,
                    price_divisor=instrument.price_divisor,
                )
                if outcome.currency:
                    result.currency = outcome.currency

                if not outcome.ok:
                    result.messages.append(f"{tf_key}: {outcome.error}")
                    store.record_sync(
                        conn,
                        instrument.ticker,
                        tf_key,
                        status="error",
                        message=outcome.error or "",
                        last_sync_utc=_now_iso(),
                        quote_currency=outcome.currency,
                    )
                    continue

                result.bars_written += store.upsert_bars(
                    conn, instrument.ticker, tf_key, outcome.bars
                )
                store.record_sync(
                    conn,
                    instrument.ticker,
                    tf_key,
                    status="ok",
                    message="" if outcome.bars else "no new bars",
                    last_sync_utc=_now_iso(),
                    last_bar_ts=outcome.bars[-1].ts if outcome.bars else None,
                    quote_currency=outcome.currency,
                )

        if result.currency and result.currency != BASE_CURRENCY:
            result.messages.append(
                f"quote currency is {result.currency}, not {BASE_CURRENCY}"
            )
        if (
            result.currency
            and instrument.quote_currency
            and result.currency != instrument.quote_currency
        ):
            result.messages.append(
                f"catalog says {instrument.quote_currency} but Yahoo reports {result.currency}"
            )


def _start_for(conn, symbol: str, tf_key: str, *, full: bool, now: datetime) -> datetime:
    """Where to begin fetching.

    A full refresh and a first sync take the timeframe's whole fetch window.
    Otherwise incremental: just past the newest stored bar with a small overlap,
    deliberately *not* raised to the fetch window's start. A series is allowed to
    have grown deeper than the window, and pushing the start forward would make
    a request's size grow with the stored depth for no benefit.
    """
    tf = timeframe(tf_key)
    if full:
        return fetch.backfill_start(tf, now)

    newest = store.last_ts(conn, symbol, tf_key)
    if newest is None:
        return fetch.backfill_start(tf, now)

    return datetime.fromtimestamp(newest, UTC) - timedelta(
        seconds=OVERLAP_BARS * tf.seconds
    )


def _cannot_have_a_new_bar(conn, symbol: str, tf_key: str, *, now: datetime) -> bool:
    """Whether the source cannot yet hold a bar this series lacks.

    Measured from the newest stored bar rather than the last sync timestamp: a
    timeframe whose last attempt failed is exactly the one a retry should reach.
    A timeframe holding nothing has no bar to measure against, so it never skips.
    """
    newest = store.last_ts(conn, symbol, tf_key)
    if newest is None:
        return False
    elapsed = now - datetime.fromtimestamp(newest, UTC)
    return elapsed < timedelta(seconds=timeframe(tf_key).seconds)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


#: Shared runner used by the dev API.
runner = SyncRunner()
