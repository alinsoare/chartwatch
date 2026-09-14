# chartwatch

Offline-first OHLC candlestick charts for a curated instrument list
(stocks / ETF / ETC), with price data sourced from Yahoo Finance and stored
locally in SQLite. A ground-up rebuild of an earlier version of this app,
planned and tracked with [OpenSpec](https://openspec.dev/) (see `openspec/`).

**The data is always offline.** Nothing is fetched because you opened a chart.
A sync happens only when you ask for one — a button in the dev UI, the sync
CLI, a manually dispatched release workflow, or the release workflow's
twice-daily schedule at
03:00 and 15:00 UTC
(which keeps the published site fresh without anyone touching GitHub). If the
data looks stale, the answer is a sync, never an implicit fetch.

## Quick start (dev mode)

```bash
uv sync
uv run chartwatch serve          # http://127.0.0.1:8000
```

Open the app and press **Sync all** to populate the database. Run the tests
with:

```bash
uv run pytest                    # backend
node tests/js/run_fixtures.mjs   # FVG golden-fixture tests (dev-time only)
node tests/js/run_space_fixtures.mjs # FVG close-to-open-space rule tests (dev-time only)
node tests/js/run_macd_fixtures.mjs # MACD parity fixtures (dev-time only)
node tests/js/run_series_math.mjs  # shared EMA/stochastic helpers (dev-time only)
node tests/js/run_measure.mjs    # ruler measurement math (dev-time only)
node tests/js/run_settings.mjs   # persisted settings + display limit (dev-time only)
node tests/js/run_scroll_lock.mjs # chart-tool drag-pan suppression + undo (dev-time only)
node tests/js/run_viewport.mjs   # default chart framing (dev-time only)
node tests/js/run_auto_scale.mjs # AUTO vertical-scale range math (dev-time only)
node tests/js/run_screener.mjs    # accumulation screener rules (dev-time only)
```

## Two modes, one frontend

The frontend reads a static-friendly JSON contract (`data/meta.json`,
`data/catalog.json`, `data/candles/<symbol>/<timeframe>.json`) and behaves the
same wherever those files come from:

- **Dev mode** — `uv run chartwatch serve`: FastAPI serves the contract
  dynamically from SQLite and adds the sync endpoints. Sync controls visible.
- **Static mode** — the exporter writes the same shapes to `dist/`; any static
  file server can host the result. Sync controls absent. This is exactly what
  GitHub Pages serves.

## Timeframes and fetch depth

**How deep a sync fetches** is a fixed property of the timeframe, not something
a run tunes. There is no bar target to set: on D1 and W1 the answer is already
"everything the source has".

| Timeframe | Yahoo interval | Initial backfill | Note |
| --------- | -------------- | ---------------- | ---- |
| H1        | `1h`           | as deep as served | Yahoo caps `1h` at ~730 days |
| D1        | `1d`           | full history      | uncapped by the source |
| W1        | `1wk`          | full history      | uncapped by the source |

**Storage is append-only.** A sync adds bars and overwrites bars it re-fetched;
it never deletes one. A series therefore only grows, keeps history the source
will no longer serve, and may reach further back than the fetch window above.
Every supported timeframe backfills completely.

A repeat sync requests only from just before the newest stored bar, so its cost
does not grow with how deep the series has become. `--full` re-pulls each
timeframe's whole fetch window; bars older than that window survive it.

## Chart display limit and default zoom

How much is *available* to pan across is separate from how much is *visible* at
once, and from how much is fetched.

The **bars** field in the toolbar bounds availability: a positive whole number or
the word `all`, defaulting to the 5,000 most recent bars on every timeframe.
Changing it re-slices the bars already in the browser — there is no refetch, and
a lower limit does not make the page load faster (the limit bounds drawing, not
downloading). Zero, a negative number, and anything that is not a number are
refused, leaving the previous limit in force. Because a measurement's anchors
may fall outside the new view, changing the limit discards a drawn measurement.

**Zoom** bounds visibility: whenever a series is presented afresh — selecting an
instrument, switching timeframe, changing the display limit, or reloading after a
sync — the chart frames the 200 most recent bars of the displayed slice rather
than fitting the whole slice. A series with 200 bars or fewer is shown in full.
Zoom is not persisted across reloads.

The **Latest** button in the toolbar scrolls back to the newest bar without
changing the current zoom, leaving about 10% of the chart width to its right.
It reads only bars already in memory and never triggers a fetch.

### What the browser remembers

Settings are stored per browser under a single `localStorage` key and restored
on the next load: display limit, automatic vertical scale, selected instrument, selected timeframe,
enabled indicators, and the sidebar filters (search text, asset class,
compatible-only). Anything that no longer resolves — a renamed instrument, an
unknown timeframe — falls back to its default without disturbing the rest, and
a browser that denies storage just runs on defaults.

Sync state is deliberately excluded, so a reload can never resume fetching:
**full refresh** comes back off on every load. Measurements
and zoom position are not restored either — the restored instrument and timeframe
open on the default 200-bar framing instead. None of this travels with the
exported data.

## Indicators

Indicators are computed client-side in JavaScript from the bars on the chart
and toggle individually — no server, so they work identically on the static
site. Three indicators are ports of external source indicators with their
signal-parity conventions preserved, and each scans the whole displayed series
so every detected zone is visible at once. Raising the display limit deepens the
scan; setting it below an indicator's warm-up produces the insufficient-history
warning rather than a silently empty chart, even when far more bars are stored.

**FVG** is a Fair Value Gap scanner ported from an external source indicator.
Two deliberate deviations from that source, recorded in the file header and the
indicators spec:

- The recent-bars scan cap is dropped, so every detected zone is visible deep in
  history.
- Displacement rules (body dominance, bar3's wick limit, the gap-vs-bar2-range
  ratio) read **close-to-open-spaces**: when two same-type bars are adjacent and
  the later opens beyond the earlier's close, the move from the previous close
  to this close is credited to the later bar's body and range. The gap, zone
  edges, and drawing still use recorded OHLC.

Golden fixtures under `tests/fixtures/fvg/` come from the Python reference and
prove numeric conventions (EMA seeding, stochastic, warm-up warning). Space
behaviour is covered separately by hand-checked cases in
`tests/fixtures/fvg-spaces/`.

**OB** is an Order Block scanner ported from an external source indicator.
It marks the last opposing candle before an impulse that broke structure:
**demand zones only** are drawn in green, each labelled `OB`.
Supply zones are still detected internally but are not rendered.
They rest on a full internal port of the source's swing-pivot detection,
points-based confirmation, structural break tracking and impulse/pullback
classification, none of which is rendered. The source's slow-RSI block is not
ported at all — it is dead code there, computed but never read.

Six deliberate deviations from the source indicator, recorded in `OB_PARAMS`:

- The lookback cap is dropped, so zones stay visible deep in history.
- Every detected **demand** zone is drawn, matching the source's history mode
  rather than its live view, which hides counter-trend zones and all but the
  newest swing. There is no show-history switch — full history is always on.
- Supply zones are detected but never drawn (rendering deviation only).
- The newest stored bar stands in for the source's forming bar — the still-open
  newest bar of a live chart — and never becomes a zone or a confirmed pivot,
  the same convention FVG follows.
- The skip-bar interval is dropped: the source refuses pivots on bars opening in
  a server-time window below H4, while this port takes **every bar as real
  data**. Parity is therefore claimed only at H4 and above, where that filter is
  inert in the source; on h1 the two read different bar sets and their
  zones can legitimately differ.
- Only the source's fresh-load path is reproduced; incremental per-bar
  refinements are not modelled.

### Regenerating the MACD fixtures

The committed fixtures under `tests/fixtures/macd/` are what the parity check
runs against — `node tests/js/run_macd_fixtures.mjs` needs no trading terminal, no
market data, and no network. Regeneration is only for replacing those files
after a change to the port or the reference computation.

```bash
uv run python tools/generate_macd_fixtures.py
node tests/js/run_macd_fixtures.mjs
```

The generator builds a deterministic synthetic bar series and computes the
expected MACD arrays from the stated numeric conventions (typical price,
SMA-seeded EMAs, main-line-seeded signal). The check pins the port against
those conventions and catches regressions; it does not re-derive agreement
with the source indicator running on a live chart.

## Releasing to GitHub Pages

`main` is development. A release is a GitHub Actions workflow — dispatched
manually or fired twice a day at **03:00 and 15:00 UTC** — that restores the previous
`market.db` snapshot from the `data` branch, runs an incremental sync, commits
the snapshot back, exports the static site, and deploys it to Pages. Each run
does this unconditionally, even when no code changed, so the published snapshot
stays fresh. Data is never re-pulled from scratch on a normal run, and no
release drops bars the snapshot already holds.

Manual dispatch carries one choice, **full refresh**; scheduled runs are always
incremental. There are no bar-target inputs: fetch depth is fixed per
timeframe. Each release exports every stored bar, so the published payload grows
as history accumulates.

The schedule is read from the workflow file on the default branch; the job still
checks out the `release` ref, so a scheduled run never publishes unreleased work
from `main`. GitHub's cron is best-effort and may be delayed. After **60 days
without repository activity**, GitHub disables scheduled workflows — re-enable
them from the Actions tab if the scheduled release stops firing.

### Rehearse locally first

Every step except the deploy runs the same commands locally:

```bash
uv run chartwatch sync           # or: sync --full
uv run chartwatch export         # writes the static site to dist/
python3 -m http.server -d dist 8080
```

Browse <http://127.0.0.1:8080> — that is byte-for-byte the site Pages will
serve.

### Deepening an existing database

A database synced before fetch depth and pruning were separated holds roughly
1,000 bars per timeframe. Nothing breaks: bars are only ever added from here on.
To actually reach the new depth, run **one full refresh per symbol**
(`uv run chartwatch sync --full`, or a dispatch with full refresh) — a slow,
expected, one-time pull. Until then the app behaves as before, with the display
limit simply exceeding what is stored.

Expect the export to grow accordingly: roughly 3.6 MB before, about 20 MB after
deepening the eight seeded instruments, and larger with each release.

Rolling this change back is **not** symmetric — the restored code prunes to its
target on the next sync and would delete the accumulated history. Copy the
current snapshot aside before reverting.

### Manual snapshot fallback

If Yahoo rate-limits the CI runner, or you would rather do the first long
backfill on your own connection, sync locally and push the snapshot yourself.
The workflow restores whatever the `data` branch holds, so the next dispatch
picks up from your snapshot and syncs incrementally on top of it.

The branch layout is a contract: `data` is a single root commit whose tree
holds exactly one file, `market.db`, **at the root** — not under `data/`.
Committing it the ordinary way (`git add data/market.db`) puts the blob at the
wrong path, and the workflow's restore step then finds nothing and falls back
to a full backfill. These commands write it the way CI does, without touching
your working tree, branches, or `HEAD`:

```bash
uv run chartwatch sync           # refresh data/market.db locally first
blob=$(git hash-object -w data/market.db)
tree=$(printf '100644 blob %s\tmarket.db\n' "$blob" | git mktree)
commit=$(git commit-tree "$tree" -m "data snapshot $(date -u +%FT%TZ)")
git push --force origin "$commit:refs/heads/data"
```

The force push is deliberate: every snapshot is a fresh root commit, so the
branch keeps one copy of the database rather than accumulating each release's
binary forever. Never merge or rebase `data` into a code branch — it is an
orphan ref holding that single file.

To go the other way and inspect the snapshot CI produced:

```bash
git fetch origin data
git cat-file blob FETCH_HEAD:market.db > data/market.db
```

## Adding a symbol

Broker account statements live in `data/broker-reports/` (one or more
`*.xlsx` files, plus optional plain-text shortlists such as `ETFs.txt` and
`STCs.txt`). To see which instruments they name that the catalog does not
yet cover, run:

```bash
uv run python tools/import_broker_report_symbols.py
```

The tool scans every workbook sheet and every `*.txt` shortlist, deduplicates
tickers, and prints proposed CSV rows for anything missing from
`data/symbols.csv`. It **never writes the catalog** — completing and committing
rows is manual work. The report's Instrument column and the shortlist's
comma-separated hints are maintainer notes for filling in `display_name`.

Before enabling a new row, verify its Yahoo ticker returns daily bars:

```bash
uv run python tools/verify_catalog_symbols.py --source candidates
uv run python tools/verify_catalog_symbols.py              # sweep whole catalog
```

Both tools hash `data/symbols.csv` before and after the run and exit non-zero
if the file changed. A candidate whose ticker cannot be confirmed at Yahoo is
not added; record it in the change's `rejected-candidates.md` instead.

Add a row to `data/symbols.csv` and verify the ticker against Yahoo before
enabling it — broker-reported and Yahoo tickers differ in exchange suffix
(`.UK` → `.L`, `.FR` → `.PA`, `IDR.ES` → `IDR.MC`) and sometimes in ticker
root (`TSLA.DE` is `TL0.DE` on Yahoo). Set `instrument_type` to `CFD` or
`REAL` explicitly; CFD classification reads that field, not the display name.

`point_size` should be the instrument's real tick size, because it sets how many
decimals the chart shows: `0.01` gives two, `0.00001` gives five, everywhere a
price appears (price scale, crosshair, OHLC legend, ruler readout). Claiming a
finer tick than the instrument trades at surfaces floating-point noise — a close
of `296.30` renders as `296.29999`.

The portfolio compatibility flags (non-EUR quote currency, CFD) are warnings,
not blocks — flagged instruments still chart normally.
