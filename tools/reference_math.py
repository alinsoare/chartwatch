"""Vendored EMA and stochastic helpers for FVG fixture generation.

Transcribed from the sibling reference implementation and kept in this
repository so no vendor-named symbol is imported. The committed FVG fixtures
are the equivalence proof: regenerating them with these functions must leave
``tests/fixtures/fvg/`` byte-for-byte unchanged.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def sma_seeded_ema(values: np.ndarray, period: int) -> np.ndarray:
    """EMA seeded with the SMA of the first ``period`` values.

    Values before index ``period - 1`` are NaN, mirroring the source's empty
    value region where the plot has not begun.
    """
    n = len(values)
    out = np.full(n, np.nan)
    if n < period:
        return out
    out[period - 1] = float(np.mean(values[:period]))
    k = 2.0 / (period + 1)
    for i in range(period, n):
        out[i] = out[i - 1] + k * (values[i] - out[i - 1])
    return out


def low_high_stochastic(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    k_period: int = 21,
    slowing: int = 9,
) -> np.ndarray:
    """Low/high stochastic main line with SMA slowing.

    %K = 100 * SMA(close - LL, slowing) / SMA(HH - LL, slowing), where LL/HH
    are the rolling low/high extremes over ``k_period`` bars. Warm-up values
    and flat windows are NaN.
    """
    low_s = pd.Series(low)
    high_s = pd.Series(high)
    close_s = pd.Series(close)

    ll = low_s.rolling(k_period).min()
    hh = high_s.rolling(k_period).max()
    num = (close_s - ll).rolling(slowing).sum()
    den = (hh - ll).rolling(slowing).sum()

    k = 100.0 * num / den.replace(0.0, np.nan)
    return k.to_numpy()
