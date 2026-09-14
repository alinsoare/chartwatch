"""Generate golden fixtures for the JS MACD port from an in-repo reference.

Dev-time only. Builds a deterministic synthetic bar series and computes MACD
using the numeric conventions stated in the indicators spec — typical price,
SMA-seeded EMAs, main line from the slow period warm-up, signal EMA seeded from
the main line's first defined index — without calling the JS port.

NaN warm-up positions are encoded as null. Floats use Python's default repr via
json.dumps (shortest round-trippable form).

Run:  uv run python tools/generate_macd_fixtures.py
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
OUT_DIR = REPO / "tests" / "fixtures" / "macd"

FAST = 13
SLOW = 34
SIGNAL = 9

MAIN_FIRST = SLOW - 1
SIGNAL_FIRST = MAIN_FIRST + SIGNAL - 1
HIST_FIRST = SIGNAL_FIRST


def make_bars(seed: int, count: int) -> list[dict]:
    """A drifting random walk in the shape FVG fixtures use."""
    rng = random.Random(seed)
    bars: list[dict] = []
    price = 100.0
    drift = 0.05
    ts = 1_600_000_000

    for _ in range(count):
        change = rng.gauss(drift, 0.9)
        o = price
        c = o + change
        h = max(o, c) + abs(rng.gauss(0, 0.3))
        low = min(o, c) - abs(rng.gauss(0, 0.3))
        bars.append({"time": ts, "open": o, "high": h, "low": low, "close": c})
        price = c
        ts += 3600

    return bars


def typical_prices(bars: list[dict]) -> list[float]:
    return [(b["high"] + b["low"] + b["close"]) / 3.0 for b in bars]


def sma(values: list[float], start: int, count: int) -> float:
    total = 0.0
    for i in range(start, start + count):
        total += values[i]
    return total / count


def sma_seeded_ema(values: list[float], period: int, first_valid: int = 0) -> list[float]:
    """SMA-seeded EMA: first defined at first_valid + period - 1."""
    n = len(values)
    out: list[float] = [math.nan] * n
    if n < first_valid + period:
        return out

    alpha = 2.0 / (period + 1)
    seed_idx = first_valid + period - 1
    out[seed_idx] = sma(values, first_valid, period)

    for i in range(seed_idx + 1, n):
        out[i] = alpha * values[i] + (1.0 - alpha) * out[i - 1]

    return out


def macd_reference(bars: list[dict]) -> tuple[list[float], list[float], list[float]]:
    applied = typical_prices(bars)
    fast_ema = sma_seeded_ema(applied, FAST)
    slow_ema = sma_seeded_ema(applied, SLOW)

    n = len(bars)
    main: list[float] = [math.nan] * n
    for i in range(MAIN_FIRST, n):
        main[i] = fast_ema[i] - slow_ema[i]

    signal = sma_seeded_ema(main, SIGNAL, first_valid=MAIN_FIRST)

    hist: list[float] = [math.nan] * n
    for i in range(SIGNAL_FIRST, n):
        hist[i] = main[i] - signal[i]

    return main, signal, hist


def direct_slow_anchor(applied: list[float]) -> float:
    return sma(applied, 0, SLOW)


def direct_signal_anchor(main: list[float]) -> float:
    return sma(main, MAIN_FIRST, SIGNAL)


def assert_anchors(
    applied: list[float],
    slow_ema: list[float],
    main: list[float],
    signal: list[float],
) -> tuple[float, float]:
    slow_anchor = direct_slow_anchor(applied)
    signal_anchor = direct_signal_anchor(main)

    if slow_ema[MAIN_FIRST] != slow_anchor:
        raise SystemExit(
            f"slow EMA anchor mismatch at {MAIN_FIRST}: "
            f"{slow_ema[MAIN_FIRST]!r} != {slow_anchor!r}"
        )
    if signal[SIGNAL_FIRST] != signal_anchor:
        raise SystemExit(
            f"signal anchor mismatch at {SIGNAL_FIRST}: "
            f"{signal[SIGNAL_FIRST]!r} != {signal_anchor!r}"
        )

    for label, arr, expected_first in (
        ("main", main, MAIN_FIRST),
        ("signal", signal, SIGNAL_FIRST),
    ):
        first = next((i for i, v in enumerate(arr) if not math.isnan(v)), -1)
        if first != expected_first:
            raise SystemExit(f"{label} first defined index {first} != {expected_first}")

    hist: list[float] = []
    for i in range(len(main)):
        if math.isnan(signal[i]):
            hist.append(math.nan)
        else:
            hist.append(main[i] - signal[i])
    hist_first = next((i for i, v in enumerate(hist) if not math.isnan(v)), -1)
    if hist_first != HIST_FIRST:
        raise SystemExit(f"histogram first defined index {hist_first} != {HIST_FIRST}")

    return slow_anchor, signal_anchor


def nan_to_null(values: list[float]) -> list:
    return [None if (isinstance(v, float) and math.isnan(v)) else float(v) for v in values]


def write_fixture(name: str, seed: int, count: int) -> None:
    bars = make_bars(seed, count)
    applied = typical_prices(bars)
    slow_ema = sma_seeded_ema(applied, SLOW)
    main, signal, hist = macd_reference(bars)
    slow_anchor, signal_anchor = assert_anchors(applied, slow_ema, main, signal)

    payload = {
        "name": name,
        "params": {"fast": FAST, "slow": SLOW, "signal": SIGNAL},
        "seed": seed,
        "bar_count": count,
        "bar_window": {
            "count": count,
            "oldest_time": bars[0]["time"],
            "newest_time": bars[-1]["time"],
        },
        "bars": bars,
        "main": nan_to_null(main),
        "signal": nan_to_null(signal),
        "histogram": nan_to_null(hist),
        "main_first": MAIN_FIRST,
        "signal_first": SIGNAL_FIRST,
        "hist_first": HIST_FIRST,
        "anchors": {
            "slow_ema_at_main_first": slow_anchor,
            "signal_at_signal_first": signal_anchor,
        },
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{name}.json"
    out.write_text(json.dumps(payload), encoding="utf-8")
    print(f"{name}: {count} bars, window {bars[0]['time']}..{bars[-1]['time']}")


def main() -> None:
    write_fixture("random-walk-400", seed=42, count=400)
    write_fixture("boundary-43", seed=7, count=43)


if __name__ == "__main__":
    main()
