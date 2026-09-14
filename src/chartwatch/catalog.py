"""The instrument catalog: loading, validation, and portfolio compatibility.

`data/symbols.csv` is the single source of truth for instruments; nothing else
in the codebase defines or hardcodes them.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from .config import BASE_CURRENCY, CATALOG_CSV

_REQUIRED_COLUMNS = [
    "ticker",
    "display_name",
    "name",
    "asset_class",
    "instrument_type",
    "exchange",
    "quote_currency",
    "point_size",
    "price_divisor",
    "enabled",
]


@dataclass(frozen=True)
class Instrument:
    ticker: str
    display_name: str
    name: str
    asset_class: str
    instrument_type: str
    exchange: str
    quote_currency: str
    point_size: float
    price_divisor: float
    enabled: bool

    @property
    def is_cfd(self) -> bool:
        return self.instrument_type == "CFD"

    def effective_currency(self, observed_currency: str | None) -> str:
        """The currency compatibility is judged against.

        The currency Yahoo actually reported wins over the hand-typed catalog
        value; the catalog value is only a fallback for never-synced symbols.
        """
        return (observed_currency or self.quote_currency or "").upper()

    def incompatibility_reasons(self, observed_currency: str | None = None) -> list[str]:
        """Why this instrument does not suit a EUR-based real-asset portfolio.

        Warnings only — an incompatible instrument still syncs and charts.
        """
        reasons: list[str] = []
        currency = self.effective_currency(observed_currency)
        if currency and currency != BASE_CURRENCY:
            reasons.append(f"not {BASE_CURRENCY} ({currency})")
        if self.is_cfd:
            reasons.append("CFD")
        return reasons

    def warnings(self, observed_currency: str | None = None) -> list[str]:
        """Data-quality notes, e.g. the catalog disagreeing with Yahoo."""
        notes: list[str] = []
        if (
            observed_currency
            and self.quote_currency
            and observed_currency.upper() != self.quote_currency.upper()
        ):
            notes.append(
                f"catalog says {self.quote_currency.upper()} "
                f"but Yahoo reports {observed_currency.upper()}"
            )
        return notes


def load_catalog(path: Path | None = None) -> list[Instrument]:
    """Load and validate the catalog CSV. Raises ValueError on malformed rows."""
    path = path or CATALOG_CSV
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = [c for c in _REQUIRED_COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{path}: catalog is missing columns {missing}")

        instruments: list[Instrument] = []
        seen: set[str] = set()
        for line, row in enumerate(reader, start=2):
            ticker = (row["ticker"] or "").strip()
            if not ticker:
                raise ValueError(f"{path}:{line}: empty ticker")
            if ticker in seen:
                raise ValueError(f"{path}:{line}: duplicate ticker {ticker!r}")
            seen.add(ticker)
            try:
                point_size = float(row["point_size"])
                price_divisor = float(row["price_divisor"])
            except ValueError as exc:
                raise ValueError(f"{path}:{line}: {exc}") from None
            if point_size <= 0 or price_divisor <= 0:
                raise ValueError(
                    f"{path}:{line}: point_size and price_divisor must be positive"
                )
            instruments.append(
                Instrument(
                    ticker=ticker,
                    display_name=(row["display_name"] or "").strip(),
                    name=(row["name"] or "").strip(),
                    asset_class=(row["asset_class"] or "").strip(),
                    instrument_type=(row["instrument_type"] or "").strip(),
                    exchange=(row["exchange"] or "").strip(),
                    quote_currency=(row["quote_currency"] or "").strip().upper(),
                    point_size=point_size,
                    price_divisor=price_divisor,
                    enabled=(row["enabled"] or "").strip().lower() in ("true", "1", "yes"),
                )
            )
    return instruments


def enabled_instruments(instruments: list[Instrument]) -> list[Instrument]:
    """The sync scope: disabled entries stay visible in the catalog but never sync."""
    return [i for i in instruments if i.enabled]


def by_ticker(instruments: list[Instrument]) -> dict[str, Instrument]:
    return {i.ticker: i for i in instruments}
