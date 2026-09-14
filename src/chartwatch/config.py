"""Shared paths and timeframe definitions, including how deep each backfills.

Fetch depth is a property of the timeframe and the source's limits, not a value
a run tunes. Where a depth is expressed at all it is a bar count, never a number
of calendar days: day-based windows were the root cause of the reference app's
broken FVG indicator (365 days of D1 is only ~260 trading bars, below the EMA
377 warm-up of 380). Nothing here bounds how much is *kept* — storage is
append-only.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
WEB_DIR = ROOT / "web"
DB_PATH = DATA_DIR / "market.db"
CATALOG_CSV = DATA_DIR / "symbols.csv"
EXPORT_DIR = ROOT / "dist"

# yfinance keeps a small timezone cache. Point it inside the project so the app
# does not depend on a writable user cache directory.
YF_CACHE_DIR = DATA_DIR / ".yf-cache"

#: The portfolio is euro based; anything quoted in another currency gets flagged.
BASE_CURRENCY = "EUR"

#: Bars an indicator may need before it can emit anything. EMA 377 needs 380 bars;
#: the floor keeps a meaningful scannable region beyond that warm-up.
INDICATOR_WARMUP_BARS = 380


@dataclass(frozen=True)
class Timeframe:
    key: str
    label: str
    yahoo_interval: str
    #: Bar width in seconds, used for incremental overlap windows.
    seconds: int
    #: How far back Yahoo serves this interval, in days. None means no practical
    #: limit. Requests deeper than this come back as an empty frame that is
    #: indistinguishable from a dead ticker, so they must be clamped.
    yahoo_max_days: int | None
    #: How deep an initial backfill reaches, in bars. None means "as deep as the
    #: source serves", which ``yahoo_max_days`` then bounds where the source caps
    #: history. A count is a target, not a promise: the cap can bind first.
    fetch_bars: int | None
    #: Estimated bars per *calendar* day, deliberately low (short US sessions,
    #: 5 trading days out of 7) so window estimates err deep rather than shallow.
    bars_per_calendar_day: float


TIMEFRAMES: dict[str, Timeframe] = {
    "h1": Timeframe(
        key="h1",
        label="H1",
        yahoo_interval="1h",
        seconds=3_600,
        yahoo_max_days=730,
        fetch_bars=None,
        bars_per_calendar_day=7 * 5 / 7,
    ),
    "d1": Timeframe(
        key="d1",
        label="D1",
        yahoo_interval="1d",
        seconds=24 * 3_600,
        yahoo_max_days=None,
        fetch_bars=None,
        bars_per_calendar_day=5 / 7,
    ),
    "w1": Timeframe(
        key="w1",
        label="W1",
        yahoo_interval="1wk",
        seconds=7 * 24 * 3_600,
        yahoo_max_days=None,
        fetch_bars=None,
        bars_per_calendar_day=1 / 7,
    ),
}

#: Order used by the UI, the sync, and the exporter.
TIMEFRAME_ORDER = ["h1", "d1", "w1"]


def timeframe(key: str) -> Timeframe:
    try:
        return TIMEFRAMES[key]
    except KeyError:
        raise ValueError(
            f"unknown timeframe {key!r}, expected one of {', '.join(TIMEFRAME_ORDER)}"
        ) from None
