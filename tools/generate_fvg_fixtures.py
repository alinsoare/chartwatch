"""Generate golden fixtures for the JS FVG port from the reference implementation.

Dev-time only. Imports ``xtb_trading.indicators`` from the sibling reference
repo (../xtb-trading) and records, for deterministic synthetic bar series:
- the bars themselves,
- SMA-seeded EMA arrays (13/89/377) and the stochastic array,
- the zones found with the scan cap disabled (bar_limit -> whole series),
- the parameters used.

NaN is encoded as null (JSON has no NaN); the harness converts back.

Run:  uv run python tools/generate_fvg_fixtures.py
"""

from __future__ import annotations

import json
import math
import random
import sys
from dataclasses import asdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
REFERENCE_SRC = REPO.parent / "xtb-trading" / "src"
OUT_DIR = REPO / "tests" / "fixtures" / "fvg"

sys.path.insert(0, str(REFERENCE_SRC))

from xtb_trading.db import Bar  # noqa: E402
from xtb_trading.indicators import (  # noqa: E402
    FvgParams,
    fvg_zones,
)

from reference_math import low_high_stochastic, sma_seeded_ema  # noqa: E402

#: Effectively "no cap": the deviation the rebuild makes by design.
NO_CAP = 10**9


def nan_to_null(values) -> list:
    return [None if (isinstance(v, float) and math.isnan(v)) else float(v) for v in values]


def make_bars(seed: int, count: int, engineer_patterns: bool) -> list[Bar]:
    """A drifting random walk, optionally salted with engineered FVG triplets."""
    rng = random.Random(seed)
    bars: list[Bar] = []
    price = 100.0
    drift = 0.05
    ts = 1_600_000_000

    i = 0
    while i < count:
        make_pattern = engineer_patterns and i > 420 and i % 37 == 0 and count - i > 4

        if make_pattern:
            # Small pullback, then bar1 (modest up), bar2 (dominant body up),
            # bar3 gapping above bar1's high: the bullish stair-step shape.
            o1 = price
            c1 = o1 + 0.4
            h1, l1 = c1 + 0.15, o1 - 0.15
            bars.append(Bar(ts=ts, open=o1, high=h1, low=l1, close=c1, volume=1000.0))
            ts += 3600

            o2 = c1
            c2 = o2 + 1.6
            h2, l2 = c2 + 0.2, o2 - 0.1
            bars.append(Bar(ts=ts, open=o2, high=h2, low=l2, close=c2, volume=1000.0))
            ts += 3600

            o3 = h1 + 0.8  # gap over bar1's high
            c3 = o3 + 0.9
            h3, l3 = c3 + 0.2, o3 - 0.05
            assert l3 > h1
            bars.append(Bar(ts=ts, open=o3, high=h3, low=l3, close=c3, volume=1000.0))
            ts += 3600

            price = c3
            i += 3
            continue

        change = rng.gauss(drift, 0.9)
        o = price
        c = o + change
        h = max(o, c) + abs(rng.gauss(0, 0.3))
        low = min(o, c) - abs(rng.gauss(0, 0.3))
        bars.append(Bar(ts=ts, open=o, high=h, low=low, close=c, volume=1000.0))
        price = c
        ts += 3600
        i += 1

    return bars


def write_fixture(name: str, bars: list[Bar], point_size: float, params: FvgParams) -> int:
    closes = [b.close for b in bars]
    highs = [b.high for b in bars]
    lows = [b.low for b in bars]
    import numpy as np

    closes_a, highs_a, lows_a = map(np.array, (closes, highs, lows))
    zones, warning = fvg_zones(bars, point_size, params)

    payload = {
        "name": name,
        "point_size": point_size,
        "params": asdict(params),
        "bars": [
            {"time": b.ts, "open": b.open, "high": b.high, "low": b.low, "close": b.close}
            for b in bars
        ],
        "ema": {
            str(p): nan_to_null(sma_seeded_ema(closes_a, p))
            for p in (params.ema_fast, params.ema_center, params.ema_slow)
        },
        "stoch": nan_to_null(
            low_high_stochastic(highs_a, lows_a, closes_a, params.stoch_k, params.stoch_slowing)
        ),
        "zones": [asdict(z) for z in zones],
        "warning": warning,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{name}.json"
    out.write_text(json.dumps(payload), encoding="utf-8")
    print(f"{name}: {len(bars)} bars, {len(zones)} zones, warning={warning!r}")
    return len(zones)


def main() -> None:
    defaults = FvgParams(bar_limit=NO_CAP)

    # Default parameters over a trending walk with engineered patterns.
    zones_a = write_fixture(
        "trending-defaults", make_bars(seed=7, count=900, engineer_patterns=True),
        0.01, defaults,
    )

    # Relaxed filters guarantee a rich zone set for shape comparison.
    relaxed = FvgParams(
        bar_limit=NO_CAP,
        stoch_overbought=101.0,
        stoch_oversold=-1.0,
        min_fvg_points=10.0,
    )
    zones_b = write_fixture(
        "trending-relaxed", make_bars(seed=11, count=900, engineer_patterns=True),
        0.01, relaxed,
    )

    # Pure random walk, default params: exercises the filters on organic data.
    write_fixture(
        "random-walk", make_bars(seed=42, count=1200, engineer_patterns=False),
        0.01, defaults,
    )

    # Too short for the slow EMA: warning parity.
    write_fixture(
        "too-short", make_bars(seed=3, count=200, engineer_patterns=False),
        0.01, defaults,
    )

    if zones_a + zones_b == 0:
        raise SystemExit("no zones in any engineered fixture — fixtures are toothless")


if __name__ == "__main__":
    main()
