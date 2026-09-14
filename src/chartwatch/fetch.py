"""Yahoo Finance access. This is the only module that performs network calls.

Bars are fetched per symbol (never a bulk download) so the currency Yahoo
reports arrives in the same response as the prices (``Ticker.history_metadata``):
the compatibility rule checks the live currency, not the hand-typed catalog
value. Per-symbol fetching also isolates failures — one delisted ticker cannot
abort a run.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import pandas as pd
import yfinance as yf
from yfinance.exceptions import YFRateLimitError

from .config import YF_CACHE_DIR, Timeframe
from .store import Bar

log = logging.getLogger(__name__)

#: Symbols fetched between pauses. Yahoo rate limits aggressively and
#: undocumented 429s are the main failure mode of a full sync.
CHUNK_SIZE = 50
CHUNK_PAUSE_SECONDS = 1.0

MAX_RETRIES = 4
BACKOFF_BASE_SECONDS = 2.0

#: Extra depth on window estimates: under-estimating a window silently starves
#: the timeframe's fetch depth, over-estimating just fetches a few bars more.
WINDOW_SAFETY = 1.15

#: Start for "as deep as the source goes". Deliberately not the Unix epoch:
#: Yahoo treats a period1 of 0 as unset and returns only a handful of bars.
FULL_HISTORY_START = datetime(1980, 1, 1, tzinfo=UTC)

EPOCH = pd.Timestamp("1970-01-01", tz="UTC")

_cache_configured = False


def _configure_cache() -> None:
    """Keep yfinance's timezone cache inside the project directory."""
    global _cache_configured
    if _cache_configured:
        return
    YF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    yf.set_tz_cache_location(str(YF_CACHE_DIR))
    _cache_configured = True


@dataclass
class FetchResult:
    bars: list[Bar] = field(default_factory=list)
    #: Currency Yahoo reports for the instrument, used to verify the EUR rule.
    currency: str | None = None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


def backfill_start(tf: Timeframe, now: datetime | None = None) -> datetime:
    """Where a full backfill of this timeframe begins.

    A timeframe carrying a bar count turns it into a date estimate — conservative
    bars-per-calendar-day plus a safety factor, so the window errs deep. A
    timeframe with no depth starts at the fixed early date instead. Either way the
    result is clamped to how far back Yahoo serves the interval, because over-deep
    requests come back as an empty frame that is indistinguishable from a dead
    ticker; that clamp is what turns "no depth" into 730 days for h1.
    """
    now = now or datetime.now(UTC)
    if tf.fetch_bars is None:
        start = FULL_HISTORY_START
    else:
        days_needed = tf.fetch_bars / tf.bars_per_calendar_day * WINDOW_SAFETY
        start = max(now - timedelta(days=days_needed), FULL_HISTORY_START)
    return clamp_start(tf, start, now)


def clamp_start(tf: Timeframe, start: datetime, now: datetime | None = None) -> datetime:
    """Clamp a start date inside Yahoo's per-interval history cap."""
    if tf.yahoo_max_days is None:
        return start
    now = now or datetime.now(UTC)
    # Stay a day inside the limit; the boundary itself is unreliable.
    earliest = now - timedelta(days=tf.yahoo_max_days - 1)
    return max(start, earliest)


def _currency_of(meta: dict | None) -> str | None:
    currency = (meta or {}).get("currency")
    return currency.upper() if currency else None


def _to_bars(df: pd.DataFrame, tf: Timeframe, price_divisor: float) -> list[Bar]:
    """Convert a yfinance frame to bars keyed by UTC epoch seconds.

    Intraday bars keep their true UTC instant. Daily and weekly bars are pinned
    to UTC midnight of the exchange-local session date: Yahoo stamps them at
    local midnight, which for Xetra is 22:00 UTC the day before, and charting
    that raw labels every daily candle with the previous day.
    """
    if df is None or df.empty:
        return []

    frame = df.copy()
    required = ["Open", "High", "Low", "Close"]
    missing = [c for c in required if c not in frame.columns]
    if missing:
        raise ValueError(f"missing columns in Yahoo response: {missing}")

    frame = frame.dropna(subset=required)
    if frame.empty:
        return []

    index = pd.DatetimeIndex(frame.index)
    if index.tz is None:
        index = index.tz_localize(UTC)

    if tf.seconds >= 24 * 3600:
        # Take the calendar date as the exchange saw it, re-read as UTC midnight.
        local_dates = index.normalize().tz_localize(None)
        index = pd.DatetimeIndex(local_dates).tz_localize(UTC)
    else:
        index = index.tz_convert(UTC)

    # Subtracting the epoch is resolution independent. Casting the underlying
    # int64 is not: pandas 3 stores datetimes as microseconds, older versions
    # as nanoseconds, so a fixed divisor silently produces garbage timestamps.
    timestamps = ((index - EPOCH) // pd.Timedelta("1s")).tolist()

    divisor = price_divisor or 1.0
    volumes = (
        frame["Volume"].tolist() if "Volume" in frame.columns else [None] * len(frame)
    )

    bars = []
    for ts, o, h, low, c, v in zip(
        timestamps, frame["Open"], frame["High"], frame["Low"], frame["Close"], volumes,
        strict=True,
    ):
        bars.append(
            Bar(
                ts=int(ts),
                open=float(o) / divisor,
                high=float(h) / divisor,
                low=float(low) / divisor,
                close=float(c) / divisor,
                volume=None if v is None or pd.isna(v) else float(v),
            )
        )
    return bars


def fetch_bars(
    yahoo_symbol: str,
    tf: Timeframe,
    start: datetime,
    end: datetime | None = None,
    price_divisor: float = 1.0,
) -> FetchResult:
    """Fetch one symbol at one timeframe, with retry on rate limiting."""
    _configure_cache()
    start = clamp_start(tf, start)
    end = end or datetime.now(UTC)
    if start >= end:
        return FetchResult()

    last_error: str | None = None
    for attempt in range(MAX_RETRIES):
        try:
            ticker = yf.Ticker(yahoo_symbol)
            df = ticker.history(
                start=start,
                end=end,
                interval=tf.yahoo_interval,
                auto_adjust=False,  # unadjusted prices, matching a broker's platform display
                actions=False,
                raise_errors=False,
            )
            bars = _to_bars(df, tf, price_divisor)
            if not bars:
                # Empty frame: dead ticker, or live one with no bars in the
                # window? Metadata tells them apart — an unknown symbol has none.
                try:
                    meta = ticker.history_metadata or {}
                except Exception:
                    meta = {}
                if not meta:
                    return FetchResult(
                        error=f"no data for {yahoo_symbol}; symbol may be delisted "
                        "or the Yahoo ticker may be wrong"
                    )
                return FetchResult(currency=_currency_of(meta))

            return FetchResult(bars=bars, currency=_currency_of(ticker.history_metadata))
        except YFRateLimitError as exc:
            delay = BACKOFF_BASE_SECONDS * (2**attempt)
            last_error = f"rate limited by Yahoo: {exc}"
            log.warning(
                "%s %s rate limited, retrying in %.0fs (attempt %d/%d)",
                yahoo_symbol, tf.key, delay, attempt + 1, MAX_RETRIES,
            )
            time.sleep(delay)
        except Exception as exc:  # noqa: BLE001 - one bad symbol must not abort a sync
            return FetchResult(error=f"{type(exc).__name__}: {exc}")

    return FetchResult(error=last_error or "exhausted retries")


def pause_between_chunks(index: int) -> None:
    """Sleep between chunks of symbols to stay under Yahoo's rate limit."""
    if index and index % CHUNK_SIZE == 0:
        time.sleep(CHUNK_PAUSE_SECONDS)
