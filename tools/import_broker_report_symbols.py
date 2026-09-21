"""Scan broker account statements and report catalog gaps.

Reads ``*.xlsx`` files under ``data/broker-reports/`` with the standard library
only (``zipfile`` + ``xml.etree``). Prints proposed CSV rows for tickers the
catalog does not yet carry; never writes ``data/symbols.csv``.
"""

from __future__ import annotations

import csv
import hashlib
import sys
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

INSTRUMENT_HEADERS = frozenset({"Instrument", "Instrument/Position"})
PRICE_HEADERS = frozenset(
    {"Open Price", "Close Price", "Current price", "Open price", "Value"}
)

#: Broker-reported root -> Yahoo Finance root (suffix unchanged).
YAHOO_ROOT_OVERRIDES: dict[str, str] = {
    "TSLA": "TL0",
}

#: Broker-reported suffix -> (exchange, quote currency, Yahoo suffix)
SUFFIX_MAP: dict[str, tuple[str, str, str]] = {
    ".DE": ("XETRA", "EUR", ".DE"),
    ".FR": ("Euronext Paris", "EUR", ".PA"),
    ".NL": ("Euronext Amsterdam", "EUR", ".AS"),
    ".FI": ("Nasdaq Helsinki", "EUR", ".HE"),
    ".UK": ("London Stock Exchange", "GBP", ".L"),
    ".US": ("NYSE / NASDAQ", "USD", ""),
    ".BE": ("Euronext Brussels", "EUR", ".BR"),
    ".ES": ("BME Madrid", "EUR", ".MC"),
    ".NO": ("Oslo Børs", "NOK", ".OL"),
    ".SE": ("Nasdaq Stockholm", "SEK", ".ST"),
}


@dataclass
class ReportInstrument:
    ticker: str
    name: str = ""
    category: str = ""
    max_price_decimals: int = 0
    #: Comma-separated fields after the ticker on a shortlist line (hints only).
    label_hints: str = ""


@dataclass
class CollectedReport:
    instruments: dict[str, ReportInstrument] = field(default_factory=dict)


def col_letter(cell_ref: str) -> str:
    return "".join(ch for ch in cell_ref if ch.isalpha())


def _cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    value_el = cell.find("m:v", NS)
    if value_el is None or value_el.text is None:
        return ""
    if cell.get("t") == "s":
        return shared_strings[int(value_el.text)]
    return value_el.text


def _load_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for si in root.findall(".//m:si", NS):
        text_el = si.find("m:t", NS)
        if text_el is not None and text_el.text is not None:
            strings.append(text_el.text)
        else:
            strings.append("".join(t.text or "" for t in si.findall(".//m:t", NS)))
    return strings


def _sheet_targets(zf: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {rel.get("Id"): rel.get("Target") for rel in rels}
    sheets: list[tuple[str, str]] = []
    for sheet in workbook.findall(".//m:sheet", NS):
        name = sheet.get("name") or ""
        rid = sheet.get(f"{{{REL_NS}}}id")
        target = rid_to_target.get(rid or "", "")
        if target and not target.startswith("xl/"):
            target = "xl/" + target.lstrip("/")
        sheets.append((name, target))
    return sheets


def iter_sheet_rows(path: Path) -> list[tuple[str, list[dict[str, str]]]]:
    """Yield ``(sheet_name, rows)`` where each row is a column-letter-keyed dict."""
    sheets_out: list[tuple[str, list[dict[str, str]]]] = []
    with zipfile.ZipFile(path) as zf:
        shared_strings = _load_shared_strings(zf)
        for sheet_name, target in _sheet_targets(zf):
            if not target or target not in zf.namelist():
                continue
            root = ET.fromstring(zf.read(target))
            rows: list[dict[str, str]] = []
            for row_el in root.findall(".//m:sheetData/m:row", NS):
                cells: dict[str, str] = {}
                for cell in row_el.findall("m:c", NS):
                    ref = cell.get("r") or ""
                    cells[col_letter(ref)] = _cell_value(cell, shared_strings)
                rows.append(cells)
            sheets_out.append((sheet_name, rows))
    return sheets_out


@dataclass(frozen=True)
class SheetHeader:
    instrument_col: str
    ticker_col: str
    category_col: str | None
    price_cols: tuple[str, ...]


def find_sheet_header(rows: list[dict[str, str]]) -> SheetHeader | None:
    """Locate the header row by content, not by fixed index."""
    for cells in rows:
        instrument_col = ticker_col = category_col = None
        col_names: dict[str, str] = {}
        for col, value in cells.items():
            label = value.strip()
            if not label:
                continue
            col_names[col] = label
            if label == "Ticker":
                ticker_col = col
            elif label in INSTRUMENT_HEADERS:
                instrument_col = col
            elif label == "Category":
                category_col = col
        if instrument_col and ticker_col:
            price_cols = tuple(
                col for col, name in col_names.items() if name in PRICE_HEADERS
            )
            return SheetHeader(
                instrument_col=instrument_col,
                ticker_col=ticker_col,
                category_col=category_col,
                price_cols=price_cols,
            )
    return None


def _price_decimals(value: str) -> int:
    text = value.strip()
    if not text or "." not in text:
        return 0
    fraction = text.split(".", 1)[1]
    trimmed = fraction.rstrip("0")
    return len(trimmed) if trimmed else 0


def _is_numeric_instrument(value: str) -> bool:
    text = value.strip()
    if not text:
        return False
    try:
        float(text)
    except ValueError:
        return False
    return True


def _suffix_for(ticker: str) -> str | None:
    for suffix in sorted(SUFFIX_MAP, key=len, reverse=True):
        if ticker.endswith(suffix):
            return suffix
    return None


def point_size_from_decimals(decimals: int) -> float:
    if decimals <= 0:
        return 0.01
    return 10 ** (-decimals)


def guess_yahoo_symbol(ticker: str) -> str:
    suffix = _suffix_for(ticker)
    if suffix is None:
        return ticker
    exchange, _currency, yahoo_suffix = SUFFIX_MAP[suffix]
    root = YAHOO_ROOT_OVERRIDES.get(ticker[: -len(suffix)], ticker[: -len(suffix)])
    if suffix == ".US":
        return root
    return f"{root}{yahoo_suffix}"


def guess_catalog_fields(ticker: str, instrument: ReportInstrument) -> dict[str, str]:
    suffix = _suffix_for(ticker)
    if suffix is None:
        exchange = ""
        currency = ""
        yahoo = ticker
    else:
        exchange, currency, _yahoo_suffix = SUFFIX_MAP[suffix]
        yahoo = guess_yahoo_symbol(ticker)
    asset_class = instrument.category or "ETF"
    return {
        "ticker": yahoo,
        "display_name": "<fill by hand from report/shortlist hints>",
        "name": instrument.name,
        "asset_class": asset_class,
        "instrument_type": "REAL",
        "exchange": exchange,
        "quote_currency": currency,
        "point_size": str(point_size_from_decimals(instrument.max_price_decimals)),
        "price_divisor": "1",
        "enabled": "false",
    }


def load_catalog_symbols(catalog_path: Path) -> set[str]:
    with open(catalog_path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return {
            (row.get("ticker") or "").strip()
            for row in reader
            if (row.get("ticker") or "").strip()
        }


def collect_from_shortlist(path: Path, collected: CollectedReport) -> None:
    """Parse a plain-text shortlist: one ticker per line, comma-separated hints."""
    text = path.read_text(encoding="utf-8")
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        parts = [part.strip() for part in stripped.split(",")]
        ticker = parts[0]
        if not ticker:
            continue
        hints = ", ".join(parts[1:]) if len(parts) > 1 else ""
        entry = collected.instruments.setdefault(ticker, ReportInstrument(ticker=ticker))
        if hints and not entry.label_hints:
            entry.label_hints = hints


def collect_from_workbook(path: Path, collected: CollectedReport) -> None:
    for sheet_name, rows in iter_sheet_rows(path):
        header = find_sheet_header(rows)
        if header is None:
            print(f"no instruments found in {path.name} / {sheet_name}", file=sys.stderr)
            continue
        started = False
        for cells in rows:
            if not started:
                if (
                    cells.get(header.ticker_col, "").strip() == "Ticker"
                    or cells.get(header.instrument_col, "").strip() in INSTRUMENT_HEADERS
                ):
                    started = True
                continue
            ticker = cells.get(header.ticker_col, "").strip()
            if not ticker:
                continue
            instrument_cell = cells.get(header.instrument_col, "").strip()
            category = (
                cells.get(header.category_col, "").strip()
                if header.category_col
                else ""
            )
            for price_col in header.price_cols:
                price = cells.get(price_col, "").strip()
                if price:
                    try:
                        float(price)
                    except ValueError:
                        continue
                    collected.instruments.setdefault(ticker, ReportInstrument(ticker))
                    collected.instruments[ticker].max_price_decimals = max(
                        collected.instruments[ticker].max_price_decimals,
                        _price_decimals(price),
                    )
            if instrument_cell and not _is_numeric_instrument(instrument_cell):
                entry = collected.instruments.setdefault(
                    ticker, ReportInstrument(ticker=ticker)
                )
                if not entry.name:
                    entry.name = instrument_cell
                if category and not entry.category:
                    entry.category = category


def collect_from_reports(reports_dir: Path) -> CollectedReport:
    collected = CollectedReport()
    for path in sorted(reports_dir.glob("*.xlsx")):
        collect_from_workbook(path, collected)
    for path in sorted(reports_dir.glob("*.txt")):
        collect_from_shortlist(path, collected)
    return collected


def missing_instruments(
    collected: CollectedReport, catalog_symbols: set[str]
) -> list[ReportInstrument]:
    missing = [
        inst
        for ticker, inst in sorted(collected.instruments.items())
        if guess_yahoo_symbol(ticker) not in catalog_symbols
    ]
    return missing


def format_proposed_row(fields: dict[str, str]) -> str:
    order = [
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
    return ",".join(fields[key] for key in order)


def report_missing(
    reports_dir: Path,
    catalog_path: Path,
    *,
    stream=sys.stdout,
) -> tuple[CollectedReport, list[ReportInstrument]]:
    catalog_symbols = load_catalog_symbols(catalog_path)
    collected = collect_from_reports(reports_dir)
    missing = missing_instruments(collected, catalog_symbols)
    print(
        f"Found {len(collected.instruments)} distinct tickers in {reports_dir}",
        file=stream,
    )
    print(
        f"{len(missing)} missing from {catalog_path.name}; "
        f"{len(collected.instruments) - len(missing)} already catalogued",
        file=stream,
    )
    if not missing:
        print("Nothing missing.", file=stream)
        return collected, missing
    print("", file=stream)
    print(
        "# Proposed rows (complete display_name before committing):",
        file=stream,
    )
    for inst in missing:
        fields = guess_catalog_fields(inst.ticker, inst)
        if inst.label_hints:
            print(f"# shortlist hints: {inst.label_hints!r}", file=stream)
        else:
            print(
                f"# report label: {inst.name!r}; category: {inst.category or '?'}",
                file=stream,
            )
        print(format_proposed_row(fields), file=stream)
    return collected, missing


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(argv: list[str] | None = None) -> int:
    repo = Path(__file__).resolve().parents[1]
    reports_dir = repo / "data" / "broker-reports"
    catalog_path = repo / "data" / "symbols.csv"

    args = list(sys.argv[1:] if argv is None else argv)
    if "--reports" in args:
        idx = args.index("--reports")
        reports_dir = Path(args[idx + 1])
    if "--catalog" in args:
        idx = args.index("--catalog")
        catalog_path = Path(args[idx + 1])

    if not catalog_path.is_file():
        print(f"catalog not found: {catalog_path}", file=sys.stderr)
        return 1
    if not reports_dir.is_dir():
        print(f"reports directory not found: {reports_dir}", file=sys.stderr)
        return 1

    before = sha256(catalog_path)
    report_missing(reports_dir, catalog_path)
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
