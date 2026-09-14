"""Probe Yahoo Finance for catalog or candidate symbols.

Uses ``fetch.fetch_bars`` so verification agrees with sync on what counts as
data. Never writes ``data/symbols.csv``.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import Enum
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "src"))
sys.path.insert(0, str(REPO / "tools"))

from import_broker_report_symbols import (  # noqa: E402
    collect_from_reports,
    guess_yahoo_symbol,
    load_catalog_symbols,
    missing_instruments,
)
from chartwatch.catalog import load_catalog  # noqa: E402
from chartwatch.config import TIMEFRAMES  # noqa: E402
from chartwatch.fetch import FetchResult, fetch_bars  # noqa: E402

SHORT_LOOKBACK = timedelta(days=365 * 2)
LONG_LOOKBACK = timedelta(days=365 * 10)


class Verdict(str, Enum):
    HAS_DATA = "has-data"
    UNKNOWN_TICKER = "unknown-ticker"
    EMPTY_WINDOW = "empty-window"
    UNKNOWN = "unknown"


@dataclass
class ProbeResult:
    symbol: str
    verdict: Verdict
    currency: str | None = None
    bar_count: int = 0
    error: str | None = None


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _classify(result: FetchResult) -> Verdict:
    if result.bars:
        return Verdict.HAS_DATA
    if result.error:
        lowered = result.error.lower()
        if "rate limit" in lowered:
            return Verdict.UNKNOWN
        return Verdict.UNKNOWN_TICKER
    return Verdict.EMPTY_WINDOW


def probe_symbol(symbol: str, now: datetime | None = None) -> ProbeResult:
    """Probe one Yahoo ticker with a two-year window, widening on empty-window."""
    now = now or datetime.now(UTC)
    tf = TIMEFRAMES["d1"]
    short_start = now - SHORT_LOOKBACK
    result = fetch_bars(symbol, tf, short_start, end=now)
    verdict = _classify(result)
    if verdict == Verdict.EMPTY_WINDOW:
        long_start = now - LONG_LOOKBACK
        result = fetch_bars(symbol, tf, long_start, end=now)
        verdict = _classify(result)
    return ProbeResult(
        symbol=symbol,
        verdict=verdict,
        currency=result.currency,
        bar_count=len(result.bars),
        error=result.error,
    )


def _catalog_tickers(catalog_path: Path) -> list[str]:
    return [inst.ticker for inst in load_catalog(catalog_path)]


def _candidate_tickers(reports_dir: Path, catalog_path: Path) -> list[str]:
    collected = collect_from_reports(reports_dir)
    catalog_symbols = load_catalog_symbols(catalog_path)
    missing = missing_instruments(collected, catalog_symbols)
    return [guess_yahoo_symbol(inst.ticker) for inst in missing]


def verify_symbols(symbols: list[str], now: datetime | None = None) -> list[ProbeResult]:
    return [probe_symbol(symbol, now=now) for symbol in symbols]


def _print_results(results: list[ProbeResult], stream=sys.stdout) -> None:
    counts: dict[Verdict, int] = {v: 0 for v in Verdict}
    for result in results:
        counts[result.verdict] += 1
        currency = result.currency or "-"
        extra = ""
        if result.verdict == Verdict.HAS_DATA:
            extra = f", bars={result.bar_count}"
        elif result.error:
            extra = f", error={result.error}"
        print(
            f"{result.symbol}\t{result.verdict.value}\t{currency}{extra}",
            file=stream,
        )
    print("", file=stream)
    print("Summary:", file=stream)
    for verdict in Verdict:
        print(f"  {verdict.value}: {counts[verdict]}", file=stream)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify Yahoo symbols have daily bars.")
    parser.add_argument(
        "--source",
        choices=("catalog", "candidates", "symbols"),
        default="catalog",
        help="symbol set to probe (default: catalog)",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=REPO / "data" / "symbols.csv",
        help="path to symbols.csv",
    )
    parser.add_argument(
        "--reports",
        type=Path,
        default=REPO / "data" / "broker-reports",
        help="reports directory for --source candidates",
    )
    parser.add_argument(
        "symbols",
        nargs="*",
        help="explicit Yahoo symbols when --source symbols",
    )
    args = parser.parse_args(argv)

    catalog_path: Path = args.catalog
    if not catalog_path.is_file():
        print(f"catalog not found: {catalog_path}", file=sys.stderr)
        return 1

    if args.source == "catalog":
        symbols = _catalog_tickers(catalog_path)
    elif args.source == "candidates":
        if not args.reports.is_dir():
            print(f"reports directory not found: {args.reports}", file=sys.stderr)
            return 1
        symbols = _candidate_tickers(args.reports, catalog_path)
    else:
        symbols = list(args.symbols)
        if not symbols:
            print("no symbols given for --source symbols", file=sys.stderr)
            return 1

    before = sha256(catalog_path)
    results = verify_symbols(symbols)
    _print_results(results)
    after = sha256(catalog_path)
    if before != after:
        print(
            f"ERROR: {catalog_path} changed on disk (hash mismatch)",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
