"""Shared pytest fixtures for catalog-backed tests.

Cross-module behavioral tests use ``tests/fixtures/symbols.csv`` instead of the
live ``data/symbols.csv`` so maintainer catalog edits do not break assertions
about disabled rows, CFD flags, aliases, and similar behavior.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from chartwatch import catalog


@pytest.fixture
def fixture_catalog(monkeypatch):
    path = Path(__file__).parent / "fixtures" / "symbols.csv"
    monkeypatch.setattr(catalog, "CATALOG_CSV", path)
    return path


def test_fixture_catalog_loads(fixture_catalog):
    from chartwatch.catalog import load_catalog

    instruments = load_catalog()
    assert len(instruments) == 6
    assert fixture_catalog.exists()
