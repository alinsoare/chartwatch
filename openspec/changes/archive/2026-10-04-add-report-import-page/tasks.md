## 1. Page scaffold and settings

- [x] 1.1 Create `web/reports/index.html` with an import control, a disabled check-screener control, empty-state messaging, and a link back to the chart page; verify it loads standalone and shows no data (`report-dashboard` "page is empty")
- [x] 1.2 Add one link from `web/index.html` to the reports page; verify clicking through in both directions and that the chart page otherwise behaves unchanged
- [x] 1.3 Create `web/reports/settings.js` exporting every strategy and ranking constant with the shipped values from design.md (rungs, triggers, net TP, tax, min net profit, max ladder, floor step/period, equity cap, velocity references, weights, confidence, semaphore thresholds, watch-list cap, stale hours); verify the module imports in Node and the derived cumulative amounts are 300/800/1600/2900/5000
- [x] 1.4 Create `web/reports/app.js` as the page's module entry point, wired to the file input/drag-drop control; verify picking a non-`.xlsx` file surfaces an error without touching any cached state

## 2. XLSX unzip + sheet reading (`report-parser`, foundation)

- [x] 2.1 Implement `web/reports/xlsx/unzip.js`: read local file/central-directory records from the zip's `ArrayBuffer`, inflate each entry with `DecompressionStream('deflate-raw')`; verify against a small hand-built fixture zip with a known raw-deflate entry
- [x] 2.2 Implement `web/reports/xlsx/sheet.js`: workbook/sheet relationships, shared strings, inline strings, numeric cells, and Excel serial dates → row/cell values; verify against a minimal synthetic `.xlsx` fixture (no real data committed)
- [x] 2.3 Verify end-to-end: a synthetic `.xlsx` with one Closed Positions row round-trips to the expected row/cell values

## 3. Report parsing (`report-parser`)

- [x] 3.1 Implement sheet-presence validation (all three sheets required) and metadata extraction (account, period start/end as as-of date, stated realized total, open position value header); verify spec scenarios "Not a valid XTB export" and "As-of date is the period end"
- [x] 3.2 Implement Closed Positions parsing (instrument name, direction normalization, profit/loss as-is, trailing-row exclusion, category pass-through); verify spec scenarios "Every category parsed" and "Costs are not double-counted"
- [x] 3.3 Implement Open Positions parsing (group headers vs. legs, position id, instrument name, direction); verify spec scenario "Multi-rung ladder"
- [x] 3.4 Implement Cash Operations parsing (tax entries, free cash sum excluding the Total row); verify spec scenarios "RO tax comment parsing" and "Free cash matches the sheet's own total"
- [x] 3.5 Implement within-workbook de-duplication with partial-close retention; verify spec scenario "Partial closes retained"
- [x] 3.6 Implement percentage-basis fallback (purchase value → margin → notional) and sub-hour duration flooring; verify spec scenarios "Margin product falls back to margin" and "Sub-hour trade"
- [x] 3.7 Implement stated-vs-parsed reconciliation and account-equity derivation (undeterminable when the open-position-value header is missing); verify spec scenarios "Discrepancy is surfaced" and "Undeterminable equity is stated, not defaulted"
- [x] 3.8 Run the full parser against a real (uncommitted, local-only) XTB export: confirm zero reconciliation discrepancy, equity matches the sheet totals, and record whether XTB writes dates as text or serials (adjust 2.2 if needed)

## 4. Ranking (`report-ranking`)

- [x] 4.1 Implement per-ticker statistics (count, wins, win rate, total profit, median hold, best/worst, long/short split, open drawdown) from whatever categories are present, including open-leg-only categories; verify spec scenario "Every category is ranked"
- [x] 4.2 Implement velocity computation (median/mean of profit_pct/hold_days) with undefined-return exclusion; verify spec scenario "No measurable velocity"
- [x] 4.3 Implement the calibrated-reference gate from the settings module (CFD uncalibrated), including the unrated-for-no-velocity case; verify spec scenarios "Intraday category is unrated by default" and "Opting a category into rating"
- [x] 4.4 Implement star rating (weighted composite, confidence shrink, exposed score) and semaphore (red/green/amber rules); verify spec scenarios "Single winning trade" and "Deep open drawdown"
- [x] 4.5 Implement ranking order (rated first, score desc, velocity desc), the no-history list, and the capped watch list; verify spec scenarios "Held instrument never traded", "Uncalibrated ticker cannot qualify", "Held tickers stay off the list", and "Cap applies in ranking order"

## 5. Ladder projection (`ladder-projection`)

- [x] 5.1 Implement (ticker, direction) grouping with assumed-long for unknown direction, blended average, invested amount, base price, and active-rung inference; verify spec scenarios "Unknown direction is assumed long and flagged" and "Below the first tier still reports R1"
- [x] 5.2 Implement net-rate-to-gross-move derivation at full precision; verify spec scenario "Gross move derived from net rate and tax rate"
- [x] 5.3 Implement the time-escalating net TP floor anchored to the report's as-of date (periods_held with ceil, effective-rate propagation, per-rung escalated flag); verify spec scenarios "Floor raises the terminal rung after one period", "Any part of a period counts", "Escalation is disabled by a zero step", and "Reload does not age the ladder"
- [x] 5.4 Implement per-rung blended-average derivation (pure plan below active, held position at active, topped-up above); verify spec scenarios "Rung above the active one depends on the position held" and "On-plan ladder matches the staged plan"
- [x] 5.5 Implement the five projected levels with explicit basis, exit price, offset, distance-to-target on the active rung only, and per-level net profit (tax once, losses untaxed); verify spec scenarios "Five levels, one basis each", "Plan net figure equals rate times cumulative amount" (15/32/48/58/50 EUR), and "Loss is not taxed"
- [x] 5.6 Implement plan state (filled / awaiting / due), the active rung's reached/pending with past-target magnitude, and the sell-now projection; verify spec scenarios "Leg without committed amount is still awaiting", "Reached but below floor", and "Sell-now on an underwater ladder"
- [x] 5.7 Implement the min-net-profit floor judged at the active rung's target and the max-ladder-budget flag; verify spec scenarios "Small R1 fails the floor" and "Over budget"
- [x] 5.8 Implement ideal-schedule spacing and trigger re-anchoring (anchor drawdown, raw/effective trigger, chaining, delay-never-accelerate); verify spec scenarios "Re-anchoring delays, never accelerates" and "Slippage pushes the next trigger deeper"
- [x] 5.9 Implement the next-rung recommendation with the full suppression set (terminal, trigger not crossed, short/assumed/no base, red semaphore) carrying tier, drawdown, shortfall; verify spec scenarios "Deep drawdown still recommends only the next rung" and "No averaging into red"
- [x] 5.10 Implement the 20 % equity concentration cap (flag, breach note on recommendations, unenforceable when equity undeterminable); verify spec scenario "Breach is annotated, not suppressed"
- [x] 5.11 Implement short-position handling and per-ladder compliance-flag aggregation; verify spec scenarios "Short position surfaced without projection" and "Trigger hit and recommendation are separate flags"

## 6. Screener confirmation (`ladder-projection`, button-triggered)

- [x] 6.1 Wire the check-screener control to fetch `../data/screener-scores.json` and `../data/catalog.json` relative to the page, with no automatic trigger; verify no network request fires on page load or import (spec scenario "No implicit fetch") and that the same page works on the dev server and on a static `dist/` preview
- [x] 6.2 Persist both payloads with their fetch time and keep the previous ones on a failed fetch; verify spec scenarios "Cached confirmation survives a reload" and "Failed check keeps the last good data"
- [x] 6.3 Implement ticker resolution: verbatim → catalog `aliases` → 14-entry suffix table confirmed by normalized instrument-name match against catalog `name`/`display_name`, exposing matched key and name; verify spec scenarios "Catalog alias wins over the suffix table", "Same-listing suffix alias confirmed by name", and "Suffix alias rejected on name mismatch"
- [x] 6.4 Implement status derivation (stale via wall-clock vs 18 h, unknown with reason, confirmed, not-confirmed; raw score/marks/generated_utc exposed); verify spec scenarios "Stale payload overrides every ticker's status", "Screener age uses wall-clock time", and "`marks` is independent of `score`"
- [x] 6.5 Attach the resolved status to the next-rung recommendation from section 5; verify a confirmed, score ≥ 1 ticker yields a tiered RECOMMENDED outcome and an unconfirmed one does not

## 7. Caching (`report-dashboard`)

- [x] 7.1 Implement `web/reports/cache.js`: IndexedDB wrapper (versioned schema, never throws into the render path) storing parsed records, report metadata, filter selection, and screener/catalog payloads; verify in the browser that read/write round-trips and that a corrupt or old-version record is discarded, not thrown
- [x] 7.2 Wire import → parse → cache-write → rank → ladder → render, and load → cache-read → rank → ladder → render; verify spec scenarios "Reload restores the dashboard" and "Settings change applies to a cached report" (edit a constant, reload, observe)
- [x] 7.3 Implement the storage-denied fallback (in-memory session, visible notice); verify spec scenario "Storage denied still allows the current session to work" with IndexedDB blocked in the browser
- [x] 7.4 Implement replace-on-reimport with a confirmation prompt that keeps the screener/catalog payloads; verify spec scenarios "Re-import replaces, not merges" and "Re-import is confirmed first"

## 8. Dashboard rendering (`report-dashboard`)

- [x] 8.1 Render the fixed header (summary with conditional reconciliation notice, import and check-screener controls, three freshness indicators, category filter) and the four tabs with filter-aware counts and arrow-key navigation; verify spec scenarios "Import renders every section", "Reconciliation notice only when needed", "Tab counts follow the filter", and "Three independent indicators"
- [x] 8.2 Render the sortable ranking table with empty-last and severity-ordered signal sorting, basis text per row, and not-applicable cells; verify spec scenarios "Unrated rows sort last both ways" and "Signal sorts by severity"
- [x] 8.3 Render each projecting ladder's summary facts (effective net target in strategy, age, periods held) and its levels from the active rung upward with basis labels, plan state, net result, and escalation markers; render shorts as a single unsupported entry; verify spec scenarios "Projecting ladder shows both views", "Basis is on every line", and "Escalated terminal rung is marked"
- [x] 8.4 Render ACTIVE and tiered RECOMMENDED markers, withheld-state notes with reason and matched alias symbol; verify spec scenarios "Markers never coincide", "Recommendation without confirmation is still shown, unbadged", and "Tier follows marks"
- [x] 8.5 Implement the per-category checkbox filter (derived from data, affecting every section and tab count, persisted with the cached report); verify spec scenarios "Unticking hides rows everywhere" and "Filter persists across reloads"

## 9. Integration and release

- [x] 9.1 Run a local export (`uv run chartwatch export`) and confirm `web/reports/` is present and functional under `dist/`, the check-screener control resolves both relative data files, and no personal data is present in the repo or the export
- [x] 9.2 Document the reports page in `README.md` (what it reads, where data lives, the check-screener control, how to change the shipped constants); verify the section reads correctly
- [x] 9.3 Confirm `openspec validate add-report-import-page --strict` passes and the four new capability specs read correctly via `openspec show <id> --type spec`
