## Context

See proposal.md for motivation. This design covers how a fully client-side XTB report page fits into a repo whose only prior client-side data source was published, pre-synced market data (`web/` + `dist/data/`), and whose non-negotiable rule is no implicit network call.

The reference implementation (`xtb-reports`, a sibling repo) is a Python CLI: `openpyxl` parses the `.xlsx`, a ranking/ladder pipeline computes everything, and a single string-templated `docs/index.html` is regenerated on each run. That repo, its code, and its history are a behavioral reference only, per the project's standing instruction — nothing here imports it. Its specs, however, are the contract this change ports: every ladder rule it defines (per-rung blended averages, staged-plan vs current-position bases, plan state, reached/pending, sell-now, floor and budget flags, re-anchoring, escalation) is carried into the delta specs here so an implementer never needs to read the Python source.

## Goals / Non-Goals

**Goals:**
- A new page, isolated from the chart page, published for free by the existing `shutil.copytree(WEB_DIR, out_dir)` export step.
- Full parse → rank → ladder pipeline running in the browser, matching the reference implementation's business rules (verified against its spec, not its code).
- Imported file and all derived state never leave the browser; there is no server endpoint to send it to.
- Screener confirmation reachable only via an explicit control, so the page's one network-capable feature obeys the same rule as the rest of the site.

**Non-Goals:**
- A settings UI. All strategy and ranking constants live in one shipped module (see Decisions).
- Multi-account support, incremental merge of successive imports, or any cross-session dedup — v1 replaces on re-import.
- The reference dashboard's category-scoped summary strip, its screener provenance details (`generated_utc` / `scoring_model_version` beside every badge), and account id / report period in the header. Recorded here as deliberate v1 omissions; the parser still extracts the metadata so a later change can surface it.
- Pixel parity with the reference (print stylesheet, exact column widths). Sort semantics, tabs, basis labels, and the escalation marker are *in* scope because they change what a reader concludes, not how it looks.
- Any backend involvement. `src/chartwatch/` and `tools/` are untouched; `tools/import_broker_report_symbols.py` keeps its own Python suffix table.

## Decisions

### Unzip/inflate via native `DecompressionStream`, not a CDN library

`.xlsx` is a zip of XML parts, normally DEFLATE-compressed per entry with no zlib wrapper (raw deflate). `DecompressionStream('deflate-raw')` (Baseline across Chrome/Edge/Firefox/Safari 16.4+) can inflate each entry with zero dependencies. This mirrors what `tools/import_broker_report_symbols.py` already does server-side with `zipfile` + `xml.etree`. Alternative considered: pin SheetJS via CDN like `lightweight-charts` is pinned. Rejected because the zip subset this file type needs (local headers, central directory, raw-deflate entries) is narrow enough to hand-roll, and it keeps `web/` dependency-free except for the chart library.

### Strategy and ranking constants ship as code, no settings UI

The reference reads `config.toml`; the user's live values differ from the reference's shipped defaults on nearly every knob. Rather than build a settings panel in v1, one module `web/reports/settings.js` exports every constant, seeded with the user's current strategy (R 300/500/800/1300/2100 EUR; triggers −8/−13/−21/−34 %; net TP 5/4/3/2/1 %; tax 10 %; min net profit 15 EUR; max ladder 5000 EUR; floor 1 %/30 d; equity cap 20 %; velocity reference 0.002 for ETF/ETN/ETC/STOCK; weights 0.55/0.45; confidence at 5 trades; semaphore −8 %/−15 %/60 %; watch-list cap 10; stale after 18 h). These are strategy parameters, not account data, so publishing them does not breach the no-personal-data rule. Every rule module takes settings as a parameter so a future settings UI is a storage-and-form change only. Alternatives considered: in-page form over localStorage (deferred — more UI than the first version warrants), JSON paste (same, with worse ergonomics).

### "Now" is the report's as-of date

Holding period, escalation periods, and ladder age are measured to the report period's end date, not to page-view time. The report's current prices are frozen at export; measuring time to "now" while prices stand still would escalate TP floors on stale prices and make a cached report drift between visits. Screener staleness is the exception and uses wall-clock time, since it describes the payload's age, not the report's. Alternative considered: page-view time, matching the reference CLI — rejected for the drift reason above.

### IndexedDB caches parsed data; rankings and ladders are recomputed on load

A real account history (1,642 closed trades, 51 open legs in the reference run) risks localStorage's ~5–10 MB synchronous budget, so IndexedDB is used. The cache holds parsed records, report metadata, the filter selection, and the last screener + catalog payloads with their fetch time — not computed results. Rank/ladder computation is cheap at this size, and recomputing means a settings change or a code fix applies to the cached report without re-import. Alternative considered: cache computed state as the original proposal said — rejected because it freezes figures against the module that produced them.

The wrapper is narrow and defensive (never throws into the render path; storage failure degrades to an in-memory session with a notice). It is verified in the browser only: Node has no IndexedDB, the repo has no npm dependencies, and the wrapper carries no business logic worth a stub harness.

### Screener confirmation stays a pull, behind a button, and fetches two files

The reference fetches `screener-scores.json` on every CLI run. Inside chartwatch the same fetch on load would be the implicit network call the project forbids, so it moves behind a "check screener" control. One press fetches both `../data/screener-scores.json` and `../data/catalog.json` as same-origin relative paths — served by `api.py` in dev and present under `dist/data/` on the published site — and caches both. The catalog is needed because screener scores carry no names or aliases.

### Ticker resolution: verbatim → catalog alias → suffix table confirmed by name

The catalog already models "the broker's listing of the same instrument" via its `aliases` column (e.g. `C7A0.DU → C7A0.DE`), so it is the first fallback. The 14-entry XTB→Yahoo suffix table is the last resort and is only trusted when the report's instrument name matches the catalog's `name`/`display_name` after normalization (lowercase, strip punctuation and legal/fund suffixes; identical or containment). This guards against a suffix coincidence pointing at a different security. The Python tool's `SUFFIX_MAP` is left alone; sharing one file would widen scope into `tools/` for little gain.

### Replace, not merge, on re-import (v1)

The reference merges multiple files by de-duplicating trades across them. Reproducing that client-side means persisting raw per-trade identity indefinitely and re-running the join on every import — real complexity for a first version. v1 treats each import as authoritative and replaces the cached report (after a confirmation prompt). The parser still performs the same partial-close-aware dedup *within* one workbook, so nothing in the data model forecloses multi-file accumulation later.

### Capability boundaries carried from the reference, with one fold

`report-parser`, `report-ranking` (renamed from `instrument-ranking` to avoid implying overlap with chartwatch's `instrument-catalog`), and `ladder-projection` map to the reference's split. `screener-signals` is folded into `ladder-projection` because chartwatch already owns the screener *production* side (`accumulation-screener`, `screener-export`); a standalone consumer capability would read as competing with those. `html-dashboard` becomes `report-dashboard` since there is no HTML generation step.

## Risks / Trade-offs

- [Hand-rolled zip/inflate and sheet reading is untested-by-time, unlike `openpyxl`] → Scope it to the shape XTB's exporter produces; pure functions over bytes, unit-testable with synthetic fixtures. The sheet reader must handle shared strings, inline strings, numbers, and Excel serial dates — `openpyxl` converts serials silently, a raw XML reader does not; task 3.7 confirms against a real file which form XTB uses.
- [Porting several modules' worth of business rules risks drift from the reference] → The delta specs now carry every ladder rule; tests assert against the specs' worked examples (shipped-schedule net figures 15/32/48/58/50 EUR, the 45-day escalation case, re-anchoring cases) rather than against the Python source.
- [Shipped constants are the user's strategy, visible in a public repo] → Accepted; they are parameters, not account data.
- [Name-confirmed aliasing can reject a true match when names differ wildly] → The ticker then resolves to unknown/absent, which only withholds a badge; the recommendation itself is still shown. The rejected candidate is exposed for audit.
- [`DecompressionStream('deflate-raw')` is a relatively recent API] → consistent with chartwatch's existing evergreen-browser baseline.

## Migration Plan

Net-new page and capabilities, plus one link added to `web/index.html`. Nothing to migrate; rollback is removing `web/reports/`, the link, and the four specs.
