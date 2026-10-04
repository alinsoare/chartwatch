import { signalSeverity } from "./rank.js";
import { computeScopedSummary } from "./summary.js";

const TABS = [
  { id: "ladders", label: "Open ladders & TP projections" },
  { id: "ranking", label: "Instrument ranking" },
  { id: "watch", label: "Watch list" },
  { id: "nohist", label: "No closed trade history" },
];

const DEFAULT_TAB_SORT = {
  ranking: { column: "score", dir: "desc" },
  watch: { column: "score", dir: "desc" },
  nohist: { column: "ticker", dir: "asc" },
  ladders: { column: "ticker", dir: "asc" },
};

const RECOMMENDED_BADGE = {
  1: "RECOMMENDED",
  2: "RECOMMENDED+",
  3: "RECOMMENDED++",
};

const FLAG_CHIP_WARN = new Set([
  "min-net-profit-floor",
  "over-budget",
  "equity-cap-breach",
  "no-averaging-into-red",
]);

function esc(text) {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtEur(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)} EUR`;
}

function fmtEurAmount(n, { signed = false } = {}) {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const body = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!signed) return `${body} EUR`;
  if (n > 0) return `+${body} EUR`;
  if (n < 0) return `-${body} EUR`;
  return `${body} EUR`;
}

function signClass(n) {
  if (n == null || Number.isNaN(n)) return "";
  if (n > 0) return "pos";
  if (n < 0) return "neg";
  return "";
}

function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

/** Ladder P/L: EUR amount plus its percentage of the invested amount shown in the same row. */
function plCell(lad) {
  if (lad.unrealized == null || Number.isNaN(lad.unrealized)) return "—";
  const eur = fmtEurAmount(lad.unrealized, { signed: true });
  if (!(lad.invested > 0)) return eur;
  const pct = (lad.unrealized / lad.invested) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${eur} <span class="pl-pct">(${sign}${pct.toFixed(2)}%)</span>`;
}

function fmtVelocity(n) {
  if (n == null || Number.isNaN(n)) return "n/a";
  const abs = Math.abs(n);
  if (abs >= 0.01) return n.toFixed(4);
  if (abs >= 0.0001) return n.toFixed(5);
  return n.toFixed(6);
}

function summaryStat(label, displayValue, signCls = "") {
  const cls = signCls ? ` ${signCls}` : "";
  return `<span class="stat"><span class="k">${esc(label)}</span><span class="v${cls}">${displayValue}</span></span>`;
}

function starsCell(rating, reason) {
  if (rating == null) {
    return naCell(reason ?? "not rated");
  }
  const n = Math.max(0, Math.min(5, Math.round(Number(rating))));
  const glyphs = `${"★".repeat(n)}${"☆".repeat(5 - n)}`;
  return `<span class="stars" title="${esc(`${n}/5`)}" aria-label="${esc(`${n} out of 5 stars`)}"><span class="stars-glyphs" aria-hidden="true">${glyphs}</span><span class="sr-only">${esc(String(n))}</span></span>`;
}

function signalBadgeClass(signal) {
  if (signal === "green") return "badge-signal-green";
  if (signal === "amber") return "badge-signal-amber";
  if (signal === "red") return "badge-signal-red";
  return "badge-signal-neutral";
}

function signalCell(signal, reason) {
  if (signal == null) {
    return naCell(reason ?? "no signal");
  }
  const label =
    signal === "green"
      ? "green"
      : signal === "amber"
        ? "amber"
        : signal === "red"
          ? "red"
          : String(signal);
  return `<span class="badge ${signalBadgeClass(signal)}">${esc(label)}</span>`;
}

function naCell(reason) {
  const tip = reason ? ` title="${esc(reason)}"` : "";
  return `<span class="na"${tip}>n/a</span>`;
}

function basisPill(label) {
  if (!label) return "—";
  return `<span class="pill basis-pill">${esc(label)}</span>`;
}

function flagChips(lad) {
  const list = lad.flags;
  if (!Array.isArray(list) || !list.length) {
    return '<span class="chip chip-ok">Compliant</span>';
  }
  return list
    .map((f) => {
      const warn = FLAG_CHIP_WARN.has(f);
      const cls = warn ? "chip-warn" : "chip-info";
      return `<span class="chip ${cls}">${esc(f)}</span>`;
    })
    .join("");
}

function recommendedBadgeLabel(badge) {
  const n = badge ?? 1;
  return RECOMMENDED_BADGE[n] ?? RECOMMENDED_BADGE[1];
}

function screenerTooltipAttrs(screener, ticker) {
  if (!screener) return "";
  const bits = [];
  if (screener.screenerKey && screener.screenerKey !== ticker) {
    bits.push(`as ${screener.screenerKey}`);
  }
  if (screener.generatedUtc) bits.push(screener.generatedUtc);
  if (!bits.length) return "";
  return ` title="${esc(`screener ${bits.join(" ")}`)}"`;
}

function stripFreshPrefix(label, prefix) {
  if (!label) return label;
  return label.startsWith(prefix) ? label.slice(prefix.length).trim() : label;
}

function categoryAllowed(rowCategory, filterSet) {
  const cat = rowCategory || "";
  if (!cat) return true;
  return filterSet.has(cat);
}

function emptyLastCompare(va, vb) {
  const aEmpty = va == null || va === "n/a" || va === "";
  const bEmpty = vb == null || vb === "n/a" || vb === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return 0;
}

function sortValue(row, column, ladderSort) {
  if (ladderSort && row._sort) return row._sort[column];
  if (column === "signal") return row.signal;
  if (column === "flags") {
    if (row.flagsText != null) return row.flagsText;
    const list = row.flags;
    return Array.isArray(list) ? list.join(", ") : list ?? "";
  }
  if (column === "strategy") return row._strategySort ?? "";
  if (column === "name") return row.name ?? "";
  return row[column];
}

export function sortRows(rows, column, dir, { ladderSort = false } = {}) {
  const mul = dir === "asc" ? 1 : -1;
  const copy = [...rows];
  copy.sort((a, b) => {
    if (column === "signal") {
      const el = emptyLastCompare(a.signal, b.signal);
      if (el) return el * mul;
      return (signalSeverity(a.signal) - signalSeverity(b.signal)) * mul;
    }
    const av = sortValue(a, column, ladderSort);
    const bv = sortValue(b, column, ladderSort);
    const el = emptyLastCompare(av, bv);
    if (el) return el * mul;
    if (typeof av === "string" || typeof bv === "string") {
      return String(av).localeCompare(String(bv)) * mul;
    }
    return (av - bv) * mul;
  });
  return copy;
}

/** Take-profit lines shown per ladder (active + next only; matches xtb-reports). */
export function visibleTpLevels(levels, activeRung) {
  return (levels ?? []).filter(
    (lvl) => lvl.rung >= activeRung && lvl.rung <= activeRung + 1,
  );
}

export function deriveCategories(parsed) {
  const cats = new Set();
  for (const t of parsed.closedTrades) if (t.category) cats.add(t.category);
  for (const l of parsed.openLegs) if (l.category) cats.add(l.category);
  return [...cats].sort();
}

function ladderStrategyLabel(lad) {
  if (lad.unsupported) {
    if (lad.direction === "short") return "Short — unsupported";
    return "Long — no projection";
  }
  return `R${lad.activeRung} (${lad.effectiveNetTpPct ?? "—"}% net TP)`;
}

function ladderFlagsText(lad) {
  const list = lad.flags;
  if (Array.isArray(list)) return list.length ? list.join(", ") : "";
  return list ? String(list) : "";
}

function ladderSortMeta(lad) {
  const legCount = lad.legs?.length ?? 0;
  const flagsText = ladderFlagsText(lad);
  const strategy = ladderStrategyLabel(lad);
  return {
    ...lad,
    name: lad.name || lad.legs?.[0]?.name || "",
    category: lad.category || lad.legs?.[0]?.category || "",
    legCount,
    flagsText,
    _strategySort: lad.unsupported ? `z-${strategy}` : strategy,
    _sort: {
      name: lad.name || lad.legs?.[0]?.name || "",
      ticker: lad.ticker,
      category: lad.category || lad.legs?.[0]?.category || "",
      strategy,
      legCount,
      invested: lad.invested ?? lad.held?.invested ?? null,
      blendedAverage: lad.blendedAverage ?? lad.held?.avg ?? null,
      currentPrice: lad.currentPrice ?? null,
      unrealized: lad.unrealized ?? null,
      ageDays: lad.ageDays ?? null,
      flags: flagsText,
    },
  };
}

function formatTpLine(lvl, lad) {
  const basis =
    lvl.basis === "current-position"
      ? `current position (${fmtEur(lad.invested)})`
      : `staged plan (${fmtEur(lvl.cumulativeEur)})`;
  const escalated = lvl.escalated ? " · escalated" : "";
  const state =
    lvl.rung === lad.activeRung && lvl.reached != null
      ? lvl.reached
        ? "reached"
        : "pending"
      : (lvl.planState ?? "");
  return `R${lvl.rung}: ${basis} · exit ${lvl.exitPrice?.toFixed(4) ?? "—"} · net ${fmtEur(lvl.netProfitEur)} · ${state}${escalated}`;
}

function tpCardStateClass(lvl, lad) {
  const isActive = lvl.rung === lad.activeRung;
  if (!isActive) return "plan";
  const flags = lad.flags;
  const belowFloor =
    Array.isArray(flags) && flags.includes("min-net-profit-floor");
  if (belowFloor) return "below-floor";
  if (lvl.reached) return "reached";
  return "pending";
}

function renderTpCardHtml(lvl, lad) {
  const state = tpCardStateClass(lvl, lad);
  const line = esc(formatTpLine(lvl, lad));
  const isActive = lvl.rung === lad.activeRung;
  const activeBadge = isActive
    ? ' <span class="badge badge-active">ACTIVE</span>'
    : "";
  return `<div class="tp-card tp-${state}"><span class="tp-line">${line}</span>${activeBadge}</div>`;
}

function renderRecommendationCallout(lad) {
  if (!lad.recommendation) return "";
  const rec = lad.recommendation;
  const screener = lad.screener;
  const tip = screenerTooltipAttrs(screener, lad.ticker);
  let badgeHtml = "";
  const status = screener?.status;
  if (status === "confirmed" && lad.recommendedBadge != null) {
    badgeHtml = `<span class="badge badge-recommended"${tip}>${esc(recommendedBadgeLabel(lad.recommendedBadge))}</span>`;
  } else if (status === "not-confirmed") {
    badgeHtml = `<span class="callout-note"${tip}>not confirmed by screener</span>`;
  } else if (status === "stale") {
    const stamp = screener?.generatedUtc ?? "unknown time";
    badgeHtml = `<span class="callout-note">screener snapshot stale (${esc(stamp)})</span>`;
  } else if (status === "unknown") {
    const reason = screener?.reason ?? "unknown";
    badgeHtml = `<span class="callout-note"${tip}>Screener withheld: ${esc(reason)}</span>`;
  }
  const shortfall = esc(fmtEur(rec.shortfallEur));
  return `<div class="ladder-callout"${tip}>Next R${esc(String(rec.tier))}: shortfall ${shortfall} ${badgeHtml}</div>`;
}

export function createRenderer(root) {
  const tabSort = structuredClone(DEFAULT_TAB_SORT);
  let activeTab = "ladders";
  let lastState = null;

  const els = {
    summary: root.querySelector("#report-summary"),
    recon: root.querySelector("#recon-notice"),
    empty: root.querySelector("#empty-state"),
    dashboard: root.querySelector("#dashboard"),
    tabs: root.querySelector("#tab-bar"),
    panels: root.querySelector("#tab-panels"),
    categoryFilters: root.querySelector("#category-filters"),
    reportFresh: root.querySelector("#fresh-report"),
    screenerFresh: root.querySelector("#fresh-screener"),
    importFresh: root.querySelector("#fresh-import"),
    storageNotice: root.querySelector("#storage-notice"),
  };

  function setFreshness(reportLabel, screenerLabel, importLabel) {
    if (els.reportFresh) {
      els.reportFresh.textContent = stripFreshPrefix(reportLabel, "Report:");
    }
    if (els.screenerFresh) {
      els.screenerFresh.textContent = stripFreshPrefix(
        screenerLabel,
        "Screener:",
      );
    }
    if (els.importFresh) {
      els.importFresh.textContent = stripFreshPrefix(importLabel, "Import:");
    }
  }

  function renderCategoryFilters(categories, filterSet, onChange) {
    if (!els.categoryFilters) return;
    els.categoryFilters.innerHTML = "";
    const title = document.createElement("span");
    title.className = "filter-title";
    title.textContent = "Categories";
    els.categoryFilters.append(title);
    for (const cat of categories) {
      const label = document.createElement("label");
      label.className = "filter-pill check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = filterSet.has(cat);
      cb.addEventListener("change", () => {
        if (cb.checked) filterSet.add(cat);
        else filterSet.delete(cat);
        onChange();
      });
      label.append(cb, document.createTextNode(` ${cat}`));
      els.categoryFilters.append(label);
    }
    const hidden = categories.filter((c) => !filterSet.has(c));
    if (hidden.length) {
      const status = document.createElement("div");
      status.className = "filter-status";
      const text = document.createElement("span");
      text.textContent = `Hidden: ${hidden.join(", ")}`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Show all";
      btn.addEventListener("click", () => {
        for (const c of categories) filterSet.add(c);
        onChange();
      });
      status.append(text, " ", btn);
      els.categoryFilters.append(status);
    }
  }

  function onHeaderSort(tabId, column, refresh) {
    const s = tabSort[tabId];
    if (s.column === column) s.dir = s.dir === "asc" ? "desc" : "asc";
    else {
      s.column = column;
      const textAsc = new Set([
        "ticker",
        "name",
        "category",
        "basisLabel",
        "strategy",
        "flags",
      ]);
      s.dir = textAsc.has(column) ? "asc" : "desc";
    }
    refresh();
  }

  const NUM_COLS = new Set([
    "tradeCount",
    "winRate",
    "velocityMedian",
    "score",
    "rating",
    "totalProfit",
    "openLegCount",
    "openDrawdownPct",
    "legCount",
    "invested",
    "blendedAverage",
    "currentPrice",
    "unrealized",
    "ageDays",
  ]);

  function appendSortableHead(table, headers, tabId, refresh) {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    const s = tabSort[tabId];
    for (const [key, label] of headers) {
      const th = document.createElement("th");
      th.className = "sortable";
      if (NUM_COLS.has(key)) th.classList.add("num");
      if (s.column === key) th.classList.add("sorted", s.dir);
      const labelSpan = document.createElement("span");
      labelSpan.className = "th-label";
      labelSpan.textContent = label;
      th.append(labelSpan);
      if (s.column === key) {
        const ind = document.createElement("span");
        ind.className = "sort-ind";
        ind.setAttribute("aria-hidden", "true");
        ind.textContent = s.dir === "asc" ? "↑" : "↓";
        th.append(ind);
      }
      th.addEventListener("click", () => onHeaderSort(tabId, key, refresh));
      tr.append(th);
    }
    thead.append(tr);
    table.append(thead);
  }

  function wrapTable(table) {
    const wrap = document.createElement("div");
    wrap.className = "table-scroll";
    wrap.append(table);
    return wrap;
  }

  function renderSummary(parsed, rankings, ladders, filterSet, categories) {
    const m = parsed.metadata;
    const scoped = computeScopedSummary(
      parsed,
      rankings,
      ladders,
      filterSet,
      categories,
    );
    const equityLabel = scoped.subset ? "Equity (account)" : "Equity";
    const equityValue =
      scoped.equity != null
        ? fmtEurAmount(scoped.equity)
        : scoped.equityUndeterminable
          ? "undeterminable"
          : "—";
    const taxesCls = scoped.taxes != null && scoped.taxes !== 0 ? "neg" : "";
    els.summary.innerHTML = `
      <div class="stat-strip">
        ${summaryStat("Realized", fmtEurAmount(scoped.realized, { signed: true }), signClass(scoped.realized))}
        ${summaryStat("Open", fmtEurAmount(scoped.openPnl, { signed: true }), signClass(scoped.openPnl))}
        ${summaryStat("Taxes", fmtEurAmount(scoped.taxes), taxesCls)}
        ${summaryStat("Closed", String(scoped.closedCount), "")}
        ${summaryStat("Legs", String(scoped.openLegCount), "")}
        ${summaryStat(equityLabel, equityValue, signClass(scoped.equity))}
      </div>
      ${
        scoped.subset
          ? '<div class="banner banner-info summary-subset-note">Totals reflect selected categories only. Equity is the whole-account figure from the report.</div>'
          : ""
      }`;
    if (!scoped.subset && m.reconciliation && els.recon) {
      els.recon.classList.remove("hidden");
      els.recon.classList.add("banner", "banner-warn");
      els.recon.textContent = `Reconciliation: parsed ${fmtEur(m.reconciliation.parsed)} vs stated ${fmtEur(m.reconciliation.stated)} (Δ ${fmtEur(m.reconciliation.diff)}, ${m.reconciliation.tradeCount} trades).`;
    } else if (els.recon) {
      els.recon.classList.add("hidden");
      els.recon.classList.remove("banner", "banner-warn");
    }
  }

  function renderRankingTable(rows, refresh) {
    const table = document.createElement("table");
    table.className = "data-table";
    const headers = [
      ["ticker", "Ticker"],
      ["category", "Category"],
      ["tradeCount", "Trades"],
      ["winRate", "Win rate"],
      ["velocityMedian", "Velocity"],
      ["score", "Score"],
      ["rating", "Stars"],
      ["signal", "Signal"],
      ["totalProfit", "Total P/L"],
      ["basisLabel", "Basis"],
    ];
    appendSortableHead(table, headers, "ranking", refresh);
    const tbody = document.createElement("tbody");
    for (const row of rows) {
      const trb = document.createElement("tr");
      const plCls = signClass(row.totalProfit);
      trb.innerHTML = `
        <td><span class="ticker-code">${esc(row.ticker)}</span></td>
        <td>${esc(row.category)}</td>
        <td class="num">${row.tradeCount}</td>
        <td class="num">${fmtPct(row.winRate * 100)}</td>
        <td class="num">${fmtVelocity(row.velocityMedian)}</td>
        <td class="num">${row.score != null ? row.score.toFixed(3) : "n/a"}</td>
        <td class="num">${starsCell(row.rating, row.ratingReason)}</td>
        <td>${signalCell(row.signal, row.signalReason)}</td>
        <td class="num ${plCls}">${fmtEurAmount(row.totalProfit, { signed: true })}</td>
        <td>${basisPill(row.basisLabel)}</td>`;
      tbody.append(trb);
    }
    table.append(tbody);
    return wrapTable(table);
  }

  function renderWatchPanel(rows, refresh) {
    const wrap = document.createElement("div");
    wrap.className = "section-panel";
    const note = document.createElement("p");
    note.className = "section-note callout-muted";
    note.textContent =
      "Green-rated instruments with closed trade history and no current open position — ladder candidates when capital is free.";
    wrap.append(note);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No candidates right now.";
      wrap.append(empty);
      return wrap;
    }
    const table = document.createElement("table");
    table.className = "data-table";
    const headers = [
      ["name", "Instrument"],
      ["ticker", "Ticker"],
      ["category", "Category"],
      ["rating", "Stars"],
      ["signal", "Signal"],
      ["velocityMedian", "Velocity"],
      ["winRate", "Win rate"],
      ["tradeCount", "Trades"],
      ["score", "Score"],
    ];
    appendSortableHead(table, headers, "watch", refresh);
    const tbody = document.createElement("tbody");
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(row.name || "—")}</td>
        <td><span class="ticker-code">${esc(row.ticker)}</span></td>
        <td>${esc(row.category || "—")}</td>
        <td class="num">${starsCell(row.rating, row.ratingReason)}</td>
        <td>${signalCell(row.signal, row.signalReason)}</td>
        <td class="num">${fmtVelocity(row.velocityMedian)}</td>
        <td class="num">${fmtPct(row.winRate * 100)}</td>
        <td class="num">${row.tradeCount}</td>
        <td class="num">${row.score != null ? row.score.toFixed(3) : "n/a"}</td>`;
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(wrapTable(table));
    return wrap;
  }

  function renderNoHistoryPanel(rows, refresh) {
    const wrap = document.createElement("div");
    wrap.className = "section-panel";
    const note = document.createElement("p");
    note.className = "section-note callout-muted";
    note.textContent =
      "Instruments with open positions but no closed trades in this report. Ranking statistics need at least one closed trade; take-profit projections for these names are on the Open ladders tab.";
    wrap.append(note);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "None.";
      wrap.append(empty);
      return wrap;
    }
    const table = document.createElement("table");
    table.className = "data-table";
    const headers = [
      ["name", "Instrument"],
      ["ticker", "Ticker"],
      ["category", "Category"],
      ["openLegCount", "Open legs"],
      ["openDrawdownPct", "Open DD"],
    ];
    appendSortableHead(table, headers, "nohist", refresh);
    const tbody = document.createElement("tbody");
    for (const row of rows) {
      const dd = row.openDrawdownPct;
      const ddCls = dd != null ? signClass(dd) : "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(row.name || "—")}</td>
        <td><span class="ticker-code">${esc(row.ticker)}</span></td>
        <td>${esc(row.category || "—")}</td>
        <td class="num">${row.openLegCount}</td>
        <td class="num ${ddCls}">${dd != null ? fmtPct(dd) : "—"}</td>`;
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(wrapTable(table));
    return wrap;
  }

  function strategyCell(lad) {
    const label = ladderStrategyLabel(lad);
    if (lad.unsupported) {
      return `<span class="badge badge-muted">${esc(label)}</span>`;
    }
    return `<span class="badge badge-strategy">${esc(label)}</span>`;
  }

  function renderLaddersPanel(rows, refresh) {
    const wrap = document.createElement("div");
    wrap.className = "section-panel";
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No open positions.";
      wrap.append(empty);
      return wrap;
    }
    const table = document.createElement("table");
    table.className = "data-table ladder-table";
    const headers = [
      ["name", "Instrument"],
      ["ticker", "Ticker"],
      ["category", "Category"],
      ["strategy", "Strategy"],
      ["legCount", "Legs"],
      ["invested", "Invested"],
      ["blendedAverage", "Avg price"],
      ["currentPrice", "Current"],
      ["unrealized", "P/L"],
      ["ageDays", "Age (d)"],
      ["flags", "Compliance"],
    ];
    appendSortableHead(table, headers, "ladders", refresh);
    const tbody = document.createElement("tbody");
    const colCount = headers.length;
    for (const lad of rows) {
      const name = lad.name || "—";
      const dir = lad.direction === "short" ? "Short" : "Long";
      const unrealCls = signClass(lad.unrealized);
      const tr = document.createElement("tr");
      const hasRungs = !lad.unsupported && lad.levels?.length > 0;
      tr.className = hasRungs ? "ladder-row has-rungs" : "ladder-row";
      tr.innerHTML = `
        <td class="instrument-cell"><span class="instrument-name">${esc(name)}</span> <span class="badge badge-dir">${esc(dir)}</span></td>
        <td><span class="ticker-code">${esc(lad.ticker)}</span></td>
        <td>${esc(lad.category || "—")}</td>
        <td>${strategyCell(lad)}</td>
        <td class="num">${lad.legCount}</td>
        <td class="num">${lad.invested != null ? fmtEurAmount(lad.invested) : "—"}</td>
        <td class="num">${lad.blendedAverage != null ? lad.blendedAverage.toFixed(4) : "—"}</td>
        <td class="num">${lad.currentPrice != null ? lad.currentPrice.toFixed(4) : "—"}</td>
        <td class="num ${unrealCls}">${plCell(lad)}</td>
        <td class="num">${lad.ageDays != null ? lad.ageDays.toFixed(1) : "—"}</td>
        <td class="flags-cell">${flagChips(lad)}</td>`;
      tbody.append(tr);

      if (!lad.unsupported && lad.levels?.length) {
        const active = lad.activeRung;
        const levels = visibleTpLevels(lad.levels, active);
        const cards = levels.map((lvl) => renderTpCardHtml(lvl, lad)).join("");
        const callout = renderRecommendationCallout(lad);
        const detail = document.createElement("tr");
        detail.className = "projections-row";
        const td = document.createElement("td");
        td.colSpan = colCount;
        td.innerHTML = `<div class="tp-cards">${cards}</div>${callout}`;
        detail.append(td);
        tbody.append(detail);
      }
    }
    table.append(tbody);
    wrap.append(wrapTable(table));
    return wrap;
  }

  function render(state) {
    lastState = state;
    const { parsed, rankings, ladders, filterSet, categories } = state;
    const refresh = () => render(state);

    if (!parsed) {
      els.empty?.classList.remove("hidden");
      els.dashboard?.classList.add("hidden");
      return;
    }
    els.empty?.classList.add("hidden");
    els.dashboard?.classList.remove("hidden");

    renderCategoryFilters(categories, filterSet, state.onFilterChange);
    renderSummary(parsed, rankings, ladders, filterSet, categories);

    const rankRows = rankings.ranking.filter((r) =>
      categoryAllowed(r.category, filterSet),
    );
    const ladderRows = ladders
      .filter((l) =>
        categoryAllowed(l.category || l.legs?.[0]?.category, filterSet),
      )
      .map(ladderSortMeta);
    const watchRows = rankings.watchList.filter((r) =>
      categoryAllowed(r.category, filterSet),
    );
    const noHist = rankings.noHistory.filter((r) =>
      categoryAllowed(r.category, filterSet),
    );

    const counts = {
      ranking: rankRows.length,
      ladders: ladderRows.length,
      watch: watchRows.length,
      nohist: noHist.length,
    };

    els.tabs.innerHTML = "";
    for (const tab of TABS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.role = "tab";
      btn.id = `tab-${tab.id}`;
      btn.setAttribute("aria-controls", `panel-${tab.id}`);
      const selected = tab.id === activeTab;
      btn.setAttribute("aria-selected", selected ? "true" : "false");
      btn.tabIndex = selected ? 0 : -1;
      btn.className = selected ? "tab active" : "tab";
      btn.dataset.tab = tab.id;
      const labelSpan = document.createElement("span");
      labelSpan.className = "tab-label";
      labelSpan.textContent = tab.label;
      const countSpan = document.createElement("span");
      countSpan.className = "tab-count";
      countSpan.textContent = String(counts[tab.id]);
      btn.append(labelSpan, countSpan);
      btn.addEventListener("click", () => {
        activeTab = tab.id;
        render(state);
      });
      els.tabs.append(btn);
    }

    els.panels.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "tab-panel";
    panel.role = "tabpanel";
    panel.id = `panel-${activeTab}`;
    panel.setAttribute("aria-labelledby", `tab-${activeTab}`);

    if (activeTab === "ranking") {
      const s = tabSort.ranking;
      const sorted = sortRows(rankRows, s.column, s.dir);
      panel.append(renderRankingTable(sorted, refresh));
    } else if (activeTab === "ladders") {
      const s = tabSort.ladders;
      const sorted = sortRows(ladderRows, s.column, s.dir, {
        ladderSort: true,
      });
      panel.append(renderLaddersPanel(sorted, refresh));
    } else if (activeTab === "watch") {
      const s = tabSort.watch;
      const sorted = sortRows(watchRows, s.column, s.dir);
      panel.append(renderWatchPanel(sorted, refresh));
    } else {
      const s = tabSort.nohist;
      const sorted = sortRows(noHist, s.column, s.dir);
      panel.append(renderNoHistoryPanel(sorted, refresh));
    }
    els.panels.append(panel);
  }

  root.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    const target = ev.target;
    if (
      target?.closest?.("#tab-bar") == null &&
      target?.closest?.("#tab-panels") == null
    ) {
      return;
    }
    const idx = TABS.findIndex((t) => t.id === activeTab);
    if (idx < 0) return;
    const next =
      ev.key === "ArrowRight"
        ? (idx + 1) % TABS.length
        : (idx - 1 + TABS.length) % TABS.length;
    activeTab = TABS[next].id;
    ev.preventDefault();
    if (lastState) render(lastState);
  });

  return {
    render,
    setFreshness,
    showStorageNotice(msg) {
      if (!els.storageNotice) return;
      els.storageNotice.textContent = msg;
      els.storageNotice.classList.remove("hidden");
    },
    showError(msg) {
      const el = root.querySelector("#import-error");
      if (el) {
        el.textContent = msg;
        el.classList.remove("hidden");
        el.classList.remove("notice-with-actions");
      }
    },
    showScreenerFailure(message, { onRetry } = {}) {
      const el = root.querySelector("#import-error");
      if (!el) return;
      el.replaceChildren();
      el.classList.remove("hidden");
      el.classList.add("notice-with-actions");
      const text = document.createElement("span");
      text.textContent = message;
      el.append(text);
      const actions = document.createElement("span");
      actions.className = "notice-actions";
      if (onRetry) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Retry";
        retry.addEventListener("click", onRetry);
        actions.append(retry);
      }
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.textContent = "Dismiss";
      dismiss.addEventListener("click", () => {
        el.classList.add("hidden");
        el.replaceChildren();
        el.classList.remove("notice-with-actions");
      });
      actions.append(dismiss);
      el.append(actions);
    },
    clearScreenerFailure() {
      const el = root.querySelector("#import-error");
      if (!el?.classList.contains("notice-with-actions")) return;
      el.classList.add("hidden");
      el.replaceChildren();
      el.classList.remove("notice-with-actions");
    },
    clearError() {
      const el = root.querySelector("#import-error");
      if (!el) return;
      el.classList.add("hidden");
      el.replaceChildren();
      el.classList.remove("notice-with-actions");
    },
  };
}
