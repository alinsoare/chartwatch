"""Command-line entry point: serve (dev), sync (headless), export (static site).

The sync and export subcommands are exactly what the release workflow runs in
CI, so a release is rehearsable locally command for command.
"""

from __future__ import annotations

import argparse
import logging
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="chartwatch",
        description="Offline-first OHLC charts for a curated instrument list. "
        "Market data moves only when a command explicitly asks for it.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="run the dev server (charts + sync UI)")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)

    sync = sub.add_parser("sync", help="sync market data from Yahoo Finance now")
    sync.add_argument("--symbols", nargs="*", default=None, help="tickers; default: all enabled")
    sync.add_argument(
        "--full",
        action="store_true",
        help="re-pull each timeframe's whole fetch window instead of extending "
        "from the newest stored bar; older bars are kept either way",
    )

    export = sub.add_parser("export", help="export the static site (frontend + data)")
    export.add_argument("--out", default=None, help="output directory (default: dist/)")

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    if args.command == "serve":
        import uvicorn

        from .api import app

        uvicorn.run(app, host=args.host, port=args.port)
        return 0

    if args.command == "sync":
        from .sync import SyncRunner

        runner = SyncRunner()
        progress = runner.run(symbols=args.symbols or None, full=args.full)
        failed = [r for r in progress.results if r.status == "error"]
        for result in progress.results:
            marker = "FAIL" if result.status == "error" else "ok"
            notes = f" ({'; '.join(result.messages)})" if result.messages else ""
            print(f"[{marker}] {result.ticker}: {result.bars_written} bars{notes}")
        print(f"synced {len(progress.results)} instruments, {len(failed)} failed")
        # One dead ticker must not fail a CI release; a run where nothing
        # succeeded almost certainly should.
        return 1 if failed and len(failed) == len(progress.results) else 0

    if args.command == "export":
        from pathlib import Path

        from .config import EXPORT_DIR
        from .export import export_site

        out = Path(args.out) if args.out else EXPORT_DIR
        written = export_site(out)
        print(f"exported {written} files to {out}")
        return 0

    raise AssertionError(f"unhandled command {args.command!r}")


if __name__ == "__main__":
    sys.exit(main())
