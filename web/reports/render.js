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

function fmtEur(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)} EUR`;
}

function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

function fmtVelocity(n) {
  if (n == null || Number.isNaN(n)) return "n/a";
  const abs = Math.abs(n);
  if (abs >= 0.01) return n.toFixed(4);
  if (abs >= 0.0001) return n.toFixed(5);
  return n.toFixed(6);
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
  const esc = lvl.escalated ? " · escalated" : "";
  const state =
    lvl.rung === lad.activeRung && lvl.reached != null
      ? lvl.reached
        ? "reached"
        : "pending"
      : (lvl.planState ?? "");
  return `R${lvl.rung}: ${basis} · exit ${lvl.exitPrice?.toFixed(4) ?? "—"} · net ${fmtEur(lvl.netProfitEur)} · ${state}${esc}`;
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
    if (els.reportFresh) els.reportFresh.textContent = reportLabel;
    if (els.screenerFresh) els.screenerFresh.textContent = screenerLabel;
    if (els.importFresh) els.importFresh.textContent = importLabel;
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
      label.className = "check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = filterSet.has(cat);
      cb.addEventListener("change", () => {
        if (cb.checked) filterSet.add(cat);
        else filterSet.delete(cat);
        onChange();
      });
      label.append(cb, ` ${cat}`);
      els.categoryFilters.append(label);
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

  function appendSortableHead(table, headers, tabId, refresh) {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    const s = tabSort[tabId];
    for (const [key, label] of headers) {
      const th = document.createElement("th");
      th.textContent = label;
      if (s.column === key) th.textContent += s.dir === "asc" ? " ↑" : " ↓";
      th.addEventListener("click", () => onHeaderSort(tabId, key, refresh));
      tr.append(th);
    }
    thead.append(tr);
    table.append(thead);
  }

  function renderSummary(parsed, rankings, ladders, filterSet, categories) {
    const m = parsed.metadata;
    const scoped = computeScopedSummary(parsed, rankings, ladders, filterSet, categories);
    const equityLabel = scoped.subset ? "Equity (account)" : "Equity";
    const equityValue =
      scoped.equity != null
        ? fmtEur(scoped.equity)
        : scoped.equityUndeterminable
          ? "undeterminable"
          : "—";
    els.summary.innerHTML = `
      <div class="summary-grid">
        <div><span class="muted">Realized P/L</span><strong>${fmtEur(scoped.realized)}</strong></div>
        <div><span class="muted">Open P/L</span><strong>${fmtEur(scoped.openPnl)}</strong></div>
        <div><span class="muted">Taxes paid</span><strong>${fmtEur(scoped.taxes)}</strong></div>
        <div><span class="muted">Closed trades</span><strong>${scoped.closedCount}</strong></div>
        <div><span class="muted">Open legs</span><strong>${scoped.openLegCount}</strong></div>
        <div><span class="muted">${equityLabel}</span><strong>${equityValue}</strong></div>
      </div>
      ${scoped.subset ? '<p class="muted summary-subset-note">Totals reflect selected categories only. Equity is the whole-account figure from the report.</p>' : ""}`;
    if (!scoped.subset && m.reconciliation && els.recon) {
      els.recon.classList.remove("hidden");
      els.recon.textContent = `Reconciliation: parsed ${fmtEur(m.reconciliation.parsed)} vs stated ${fmtEur(m.reconciliation.stated)} (Δ ${fmtEur(m.reconciliation.diff)}, ${m.reconciliation.tradeCount} trades).`;
    } else if (els.recon) {
      els.recon.classList.add("hidden");
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
      trb.innerHTML = `
        <td>${row.ticker}</td>
        <td>${row.category}</td>
        <td>${row.tradeCount}</td>
        <td>${fmtPct(row.winRate * 100)}</td>
        <td>${fmtVelocity(row.velocityMedian)}</td>
        <td>${row.score != null ? row.score.toFixed(3) : "n/a"}</td>
        <td>${row.rating ?? "n/a"}</td>
        <td>${row.signal ?? row.signalReason ?? "n/a"}</td>
        <td>${fmtEur(row.totalProfit)}</td>
        <td>${row.basisLabel}</td>`;
      tbody.append(trb);
    }
    table.append(tbody);
    return table;
  }

  function renderWatchPanel(rows, refresh) {
    const wrap = document.createElement("div");
    wrap.className = "section-panel";
    const note = document.createElement("p");
    note.className = "muted section-note";
    note.textContent =
      "Green-rated instruments with closed trade history and no current open position — ladder candidates when capital is free.";
    wrap.append(note);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
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
        <td>${row.name || "—"}</td>
        <td>${row.ticker}</td>
        <td>${row.category || "—"}</td>
        <td>${row.rating ?? "n/a"}</td>
        <td>${row.signal ?? row.signalReason ?? "n/a"}</td>
        <td>${fmtVelocity(row.velocityMedian)}</td>
        <td>${fmtPct(row.winRate * 100)}</td>
        <td>${row.tradeCount}</td>
        <td>${row.score != null ? row.score.toFixed(3) : "n/a"}</td>`;
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(table);
    return wrap;
  }

  function renderNoHistoryPanel(rows, refresh) {
    const wrap = document.createElement("div");
    wrap.className = "section-panel";
    const note = document.createElement("p");
    note.className = "muted section-note";
    note.textContent =
      "Instruments with open positions but no closed trades in this report. Ranking statistics need at least one closed trade; take-profit projections for these names are on the Open ladders tab.";
    wrap.append(note);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
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
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.name || "—"}</td>
        <td>${row.ticker}</td>
        <td>${row.category || "—"}</td>
        <td>${row.openLegCount}</td>
        <td>${row.openDrawdownPct != null ? fmtPct(row.openDrawdownPct) : "—"}</td>`;
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(table);
    return wrap;
  }

  function renderLaddersPanel(rows, refresh) {
    const wrap = document.createElement("div");
    wrap.className = "section-panel";
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
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
      ["unrealized", "Unrealized"],
      ["ageDays", "Age (d)"],
      ["flags", "Compliance"],
    ];
    appendSortableHead(table, headers, "ladders", refresh);
    const tbody = document.createElement("tbody");
    const colCount = headers.length;
    for (const lad of rows) {
      const name = lad.name || "—";
      const dir = lad.direction === "short" ? "Short" : "Long";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${name}<br><span class="muted">${dir}</span></td>
        <td>${lad.ticker}</td>
        <td>${lad.category || "—"}</td>
        <td>${ladderStrategyLabel(lad)}</td>
        <td>${lad.legCount}</td>
        <td>${lad.invested != null ? fmtEur(lad.invested) : "—"}</td>
        <td>${lad.blendedAverage != null ? lad.blendedAverage.toFixed(4) : "—"}</td>
        <td>${lad.currentPrice != null ? lad.currentPrice.toFixed(4) : "—"}</td>
        <td>${lad.unrealized != null ? fmtEur(lad.unrealized) : "—"}</td>
        <td>${lad.ageDays != null ? lad.ageDays.toFixed(1) : "—"}</td>
        <td>${lad.flagsText || "—"}</td>`;
      tbody.append(tr);

      if (!lad.unsupported && lad.levels?.length) {
        const active = lad.activeRung;
        const levels = visibleTpLevels(lad.levels, active);
        const lines = levels.map((lvl) => formatTpLine(lvl, lad));
        if (lad.recommendation) {
          const badge =
            lad.recommendedBadge != null
              ? ` · RECOMMENDED tier ${lad.recommendedBadge}`
              : lad.screener?.status === "not-confirmed"
                ? " · awaiting screener"
                : "";
          lines.push(
            `Next R${lad.recommendation.tier}: shortfall ${fmtEur(lad.recommendation.shortfallEur)}${badge}`,
          );
        }
        if (lad.screener?.status === "unknown" && lad.recommendation) {
          lines.push(
            `Screener withheld: ${lad.screener.reason ?? "unknown"}`,
          );
        }
        const detail = document.createElement("tr");
        detail.className = "projections-row";
        const td = document.createElement("td");
        td.colSpan = colCount;
        td.innerHTML = `<ul class="level-list compact">${lines.map((t) => `<li>${t}</li>`).join("")}</ul>`;
        detail.append(td);
        tbody.append(detail);
      }
    }
    table.append(tbody);
    wrap.append(table);
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

    const rankRows = rankings.ranking.filter((r) => categoryAllowed(r.category, filterSet));
    const ladderRows = ladders
      .filter((l) => categoryAllowed(l.category || l.legs?.[0]?.category, filterSet))
      .map(ladderSortMeta);
    const watchRows = rankings.watchList.filter((r) => categoryAllowed(r.category, filterSet));
    const noHist = rankings.noHistory.filter((r) => categoryAllowed(r.category, filterSet));

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
      btn.className = tab.id === activeTab ? "tab active" : "tab";
      btn.textContent = `${tab.label} (${counts[tab.id]})`;
      btn.dataset.tab = tab.id;
      btn.addEventListener("click", () => {
        activeTab = tab.id;
        render(state);
      });
      els.tabs.append(btn);
    }

    els.panels.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "tab-panel";

    if (activeTab === "ranking") {
      const s = tabSort.ranking;
      const sorted = sortRows(rankRows, s.column, s.dir);
      panel.append(renderRankingTable(sorted, refresh));
    } else if (activeTab === "ladders") {
      const s = tabSort.ladders;
      const sorted = sortRows(ladderRows, s.column, s.dir, { ladderSort: true });
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
