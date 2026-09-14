"""Build ``data/screener-scores.json`` by invoking the Node scoring script.

The payload shape mirrors ``scoreInstrument()`` output for every catalog symbol.
``scoring_model_version`` is read from ``SCAN_CACHE_VERSION`` in ``scan.js`` so
export and dev backend scores cannot drift from the in-browser screener.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

from .config import ROOT

BUILD_SCRIPT = ROOT / "scripts" / "build-screener-scores.mjs"


def build_screener_scores(catalog: dict, scan_bars: dict) -> dict:
    """Return the screener-scores payload for the given catalog and scan-bars dicts."""
    if not BUILD_SCRIPT.is_file():
        raise RuntimeError(f"screener scores build script not found: {BUILD_SCRIPT}")

    with tempfile.TemporaryDirectory() as tmpdir:
        catalog_path = Path(tmpdir) / "catalog.json"
        scan_path = Path(tmpdir) / "scan-bars.json"
        catalog_path.write_text(json.dumps(catalog, separators=(",", ":")), encoding="utf-8")
        scan_path.write_text(json.dumps(scan_bars, separators=(",", ":")), encoding="utf-8")

        try:
            result = subprocess.run(
                ["node", str(BUILD_SCRIPT), str(catalog_path), str(scan_path)],
                capture_output=True,
                text=True,
                check=False,
            )
        except FileNotFoundError:
            raise RuntimeError(
                "node is required to build screener-scores.json but was not found on PATH"
            ) from None

        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(
                f"build-screener-scores.mjs failed (exit {result.returncode})"
                + (f": {detail}" if detail else "")
            )

        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"build-screener-scores.mjs returned invalid JSON: {exc}"
            ) from exc
