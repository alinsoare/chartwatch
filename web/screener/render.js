function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPct(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function renderMarks(marks, reasons) {
  if (!marks) return "";
  const title = reasons?.length
    ? reasons.map((r) => `${r.rule}: ${r.points}`).join("\n")
    : "";
  const dots = Array.from({ length: marks }, () => '<span class="screener-mark"></span>').join("");
  return `<span class="screener-marks" title="${escapeHtml(title)}">${dots}</span>`;
}

export function renderSourceNames(reasons) {
  if (!reasons?.length) return "";
  const labels = reasons
    .map((r) => `<span class="screener-source">${escapeHtml(r.source ?? "")}</span>`)
    .join("");
  return `<div class="screener-sources">${labels}</div>`;
}

export function renderScreenerRow(symbol, result) {
  if (!result) return "";

  let marks = "";
  let sources = "";
  let detail = "";
  if (result.status === "not-screened") {
    detail = `<div class="screener-state">not screened</div>`;
  } else if (result.status === "insufficient-history" && result.rangePct == null) {
    detail = `<div class="screener-state">insufficient history</div>`;
  } else {
    if (result.status === "screened") {
      marks = renderMarks(result.marks, result.reasons);
      sources = renderSourceNames(result.reasons);
    }
    const range = formatPct(result.rangePct);
    const position = formatPct(result.positionPct);
    const headroom = formatPct(result.headroomPct);
    detail = `<div class="screener-figures">30d range ${range} · position ${position} · headroom ${headroom}</div>`;
  }

  return `
    <div class="symbol-top">
      <span class="symbol-code">${escapeHtml(symbol.ticker)}${marks}</span>
      <span class="symbol-class">${escapeHtml(symbol.asset_class)}</span>
    </div>
    ${sources}
    <div class="symbol-name" title="${escapeHtml(symbol.name)}">${escapeHtml(symbol.name)}</div>
    ${detail}`;
}
