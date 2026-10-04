import { excelSerialToDate, parseNumber } from "./xlsx/sheet.js";

const REQUIRED_SHEETS = ["Closed Positions", "Open Positions", "Cash Operations"];

function rowLabel(cells, col = "A") {
  return (cells[col] ?? "").trim();
}

function findHeaderRow(rows, requiredLabels) {
  for (let i = 0; i < rows.length; i++) {
    const labels = new Set(Object.values(rows[i]).map((v) => v.trim()).filter(Boolean));
    if (requiredLabels.every((l) => labels.has(l))) {
      return { index: i, cells: rows[i] };
    }
  }
  return null;
}

function headerMap(headerCells) {
  const map = {};
  for (const [col, label] of Object.entries(headerCells)) {
    const t = label.trim();
    if (t) map[t] = col;
  }
  return map;
}

function cell(row, map, label) {
  const col = map[label];
  return col ? (row[col] ?? "").trim() : "";
}

function parseDirection(typeText) {
  const t = typeText.trim().toUpperCase();
  if (t === "BUY") return "long";
  if (t === "SELL") return "short";
  return "unknown";
}

function parseDateTime(text) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum) && asNum > 1000) {
    return excelSerialToDate(asNum);
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function holdSeconds(openAt, closeAt) {
  if (!openAt || !closeAt) return null;
  const sec = Math.floor((closeAt.getTime() - openAt.getTime()) / 1000);
  return Math.max(1, sec);
}

function basisForTrade(purchaseValue, margin, volume, openPrice) {
  if (purchaseValue != null && purchaseValue > 0) {
    return { source: "purchase", value: purchaseValue };
  }
  if (margin != null && margin > 0) {
    return { source: "margin", value: margin };
  }
  const notional = (volume ?? 0) * (openPrice ?? 0);
  if (notional > 0) {
    return { source: "notional", value: notional };
  }
  return { source: "none", value: null };
}

function isPositionId(text) {
  return /^\d+(?:\.\d+)?(?:E\d+)?$/i.test(text.trim());
}

function metricIsOpenPositionValue(text) {
  const t = (text ?? "").trim().toLowerCase();
  return t === "value" || t === "open position value";
}

/** Open Positions sheet header total (whole-book market value), not per-leg Value column. */
function parseOpenPositionSummaryValue(openRows, stopBeforeIndex) {
  const limit = Math.min(stopBeforeIndex ?? openRows.length, openRows.length);
  let metricCol = "B";
  let amountCol = "C";

  for (let i = 0; i < limit; i++) {
    const map = headerMap(openRows[i]);
    if (map.Metric && map.Amount) {
      metricCol = map.Metric;
      amountCol = map.Amount;
      break;
    }
  }

  for (let i = 0; i < limit; i++) {
    const row = openRows[i];
    if (metricIsOpenPositionValue(row[metricCol])) {
      const n = parseNumber(row[amountCol]);
      if (n != null) return n;
    }
    if (metricIsOpenPositionValue(row.B)) {
      const n = parseNumber(row.C ?? row[amountCol]);
      if (n != null) return n;
    }
  }

  // xtb-reports loader: 1-based row 5, column C (0-based row index 4).
  if (limit > 4) {
    const n = parseNumber(openRows[4][amountCol] ?? openRows[4].C);
    if (n != null) return n;
  }

  return null;
}

/**
 * @param {Map<string, Array<Record<string, string>>>} sheets
 */
export function parseReport(sheets) {
  const missing = REQUIRED_SHEETS.filter((n) => !sheets.has(n));
  if (missing.length) {
    return {
      ok: false,
      error: `Not a recognized XTB report; missing sheet(s): ${missing.join(", ")}`,
    };
  }

  const closedRows = sheets.get("Closed Positions");
  const openRows = sheets.get("Open Positions");
  const cashRows = sheets.get("Cash Operations");

  let account = "";
  for (const r of closedRows) {
    if (rowLabel(r) === "Account number") {
      account = (r.B ?? "").trim();
      break;
    }
  }

  let periodStart = null;
  let periodEnd = null;
  for (const r of closedRows) {
    const a = rowLabel(r);
    if (a === "Date from (UTC)") periodStart = parseDateTime(r.B);
    if (a === "Date to (UTC)") periodEnd = parseDateTime(r.B);
  }

  let statedRealizedTotal = null;
  for (const r of closedRows) {
    if (rowLabel(r) === "Profit/loss" && r.K) {
      statedRealizedTotal = parseNumber(r.K);
    }
  }

  const closedHeader = findHeaderRow(closedRows, ["Instrument", "Ticker", "Profit/Loss"]);
  if (!closedHeader) {
    return { ok: false, error: "Closed Positions header not found" };
  }
  const closedMap = headerMap(closedHeader.cells);

  const closedTrades = [];
  for (let i = closedHeader.index + 1; i < closedRows.length; i++) {
    const row = closedRows[i];
    const instrument = cell(row, closedMap, "Instrument");
    const ticker = cell(row, closedMap, "Ticker");
    if (!ticker && rowLabel(row) === "Profit/loss") break;
    if (!ticker) continue;

    const openAt = parseDateTime(cell(row, closedMap, "Open Time (UTC)"));
    const closeAt = parseDateTime(cell(row, closedMap, "Close Time (UTC)"));
    const volume = parseNumber(cell(row, closedMap, "Volume"));
    const openPrice = parseNumber(cell(row, closedMap, "Open Price"));
    const profit = parseNumber(cell(row, closedMap, "Profit/Loss"));
    const purchaseValue = parseNumber(cell(row, closedMap, "Purchase Value"));
    const margin = parseNumber(cell(row, closedMap, "Margin"));
    const basis = basisForTrade(purchaseValue, margin, volume, openPrice);
    let profitPct;
    if (basis.value != null && profit != null) {
      profitPct = profit / basis.value;
    } else {
      profitPct = undefined;
    }

    closedTrades.push({
      ticker,
      name: instrument,
      category: cell(row, closedMap, "Category"),
      direction: parseDirection(cell(row, closedMap, "Type")),
      openAt,
      closeAt,
      volume,
      openPrice,
      closePrice: parseNumber(cell(row, closedMap, "Close Price")),
      profit,
      purchaseValue,
      margin,
      basisSource: basis.source,
      basisValue: basis.value,
      profitPct,
      holdSeconds: holdSeconds(openAt, closeAt),
      positionId: cell(row, closedMap, "Position ID"),
    });
  }

  const dedupedClosed = dedupeClosedTrades(closedTrades);

  const openHeader = findHeaderRow(openRows, ["Instrument/Position", "Ticker"]);
  if (!openHeader) {
    return { ok: false, error: "Open Positions header not found" };
  }

  let openPositionValue = parseOpenPositionSummaryValue(openRows, openHeader.index);
  let openPositionValueReason = null;
  if (openPositionValue == null) {
    openPositionValueReason = "Open Positions sheet has no open-position-value header";
  }
  const openMap = headerMap(openHeader.cells);
  const instCol = openMap["Instrument/Position"] ?? openMap.Instrument;

  const openLegs = [];
  let currentName = "";
  let currentCategory = "";
  for (let i = openHeader.index + 1; i < openRows.length; i++) {
    const row = openRows[i];
    const product = rowLabel(row);
    if (product !== "My Trades") continue;
    const colB = (row[instCol] ?? row.B ?? "").trim();
    const ticker = cell(row, openMap, "Ticker");
    if (!ticker) continue;
    const posCell = row[instCol] ?? row.B ?? "";
    if (!isPositionId(posCell)) {
      currentName = colB;
      const headerCat = cell(row, openMap, "Category");
      if (headerCat) currentCategory = headerCat.toUpperCase();
      continue;
    }
    const legCat = cell(row, openMap, "Category") || currentCategory;
    openLegs.push({
      ticker,
      name: currentName || colB,
      category: legCat ? legCat.toUpperCase() : "",
      direction: parseDirection(cell(row, openMap, "Type")),
      positionId: colB,
      volume: parseNumber(cell(row, openMap, "Volume")),
      openPrice: parseNumber(cell(row, openMap, "Open price") || cell(row, openMap, "Open Price")),
      currentPrice: parseNumber(cell(row, openMap, "Current price") || cell(row, openMap, "Current Price")),
      openAt: parseDateTime(cell(row, openMap, "Open time (UTC)") || cell(row, openMap, "Open Time (UTC)")),
      value: parseNumber(cell(row, openMap, "Value")),
      netProfit: parseNumber(cell(row, openMap, "Net Profit")),
    });
  }

  const openLegsDeduped = dedupeOpenLegs(openLegs);

  const cashHeader = findHeaderRow(cashRows, ["Type", "Amount"]);
  const cashMap = cashHeader ? headerMap(cashHeader.cells) : {};
  const cashFlows = [];
  const taxEntries = [];
  let freeCash = 0;

  for (let i = (cashHeader?.index ?? 0) + 1; i < cashRows.length; i++) {
    const row = cashRows[i];
    const type = rowLabel(row) || cell(row, cashMap, "Type");
    if (!type) continue;
    if (type.toLowerCase() === "total") continue;
    const amount = parseNumber(cell(row, cashMap, "Amount") || row.F);
    if (amount != null) freeCash += amount;
    const entry = {
      type,
      ticker: cell(row, cashMap, "Ticker") || row.C || "",
      amount,
      comment: cell(row, cashMap, "Comment") || row.H || "",
      time: parseDateTime(cell(row, cashMap, "Time") || row.E),
    };
    cashFlows.push(entry);
    if (type === "RO tax" || type === "Tax IFTT") {
      let taxTicker = entry.ticker;
      if (!taxTicker && entry.comment) {
        const m = entry.comment.match(/RO tax\s+(\S+)/i);
        if (m) taxTicker = m[1];
      }
      taxEntries.push({ ...entry, ticker: taxTicker });
    }
  }

  const parsedRealizedTotal = dedupedClosed.reduce((s, t) => s + (t.profit ?? 0), 0);
  let reconciliation = null;
  if (statedRealizedTotal != null) {
    const diff = parsedRealizedTotal - statedRealizedTotal;
    if (Math.abs(diff) > 0.01) {
      reconciliation = {
        stated: statedRealizedTotal,
        parsed: parsedRealizedTotal,
        diff,
        tradeCount: dedupedClosed.length,
      };
    }
  }

  let equity = null;
  let equityUndeterminable = null;
  if (openPositionValueReason) {
    equityUndeterminable = openPositionValueReason;
  } else {
    equity = freeCash + openPositionValue;
  }

  const taxesPaid = taxEntries.reduce((s, e) => s + Math.abs(Math.min(0, e.amount ?? 0)), 0);

  return {
    ok: true,
    metadata: {
      account,
      periodStart,
      periodEnd,
      asOf: periodEnd,
      statedRealizedTotal,
      openPositionValue,
      freeCash,
      equity,
      equityUndeterminable,
      reconciliation,
      taxesPaid,
    },
    closedTrades: dedupedClosed,
    openLegs: openLegsDeduped,
    cashFlows,
    taxEntries,
  };
}

function dedupeClosedTrades(trades) {
  const seen = new Set();
  const out = [];
  for (const t of trades) {
    const key = [
      t.positionId,
      t.closeAt?.toISOString() ?? "",
      t.openAt?.toISOString() ?? "",
      t.volume,
      t.profit,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function dedupeOpenLegs(legs) {
  const seen = new Set();
  const out = [];
  for (const leg of legs) {
    if (seen.has(leg.positionId)) continue;
    seen.add(leg.positionId);
    out.push(leg);
  }
  return out;
}

function isXlsxReportEntry(name) {
  const norm = name.replace(/\\/g, "/");
  if (norm.endsWith("/")) return false;
  if (!/\.xlsx$/i.test(norm)) return false;
  const segments = norm.split("/");
  if (segments.some((s) => s === "__MACOSX")) return false;
  const base = segments[segments.length - 1] ?? "";
  if (base.startsWith("._")) return false;
  if (base.startsWith("~$")) return false;
  return true;
}

/**
 * @param {Map<string, Uint8Array>} entries
 * @param {(ab: ArrayBuffer) => Promise<Map<string, Uint8Array>>} unzipXlsx
 */
export async function resolveWorkbookEntries(entries, unzipXlsx) {
  if (entries.has("xl/workbook.xml")) {
    return { ok: true, entries };
  }

  const candidates = [];
  for (const [name, bytes] of entries) {
    if (isXlsxReportEntry(name)) candidates.push({ name, bytes });
  }

  if (candidates.length === 1) {
    const { bytes } = candidates[0];
    const innerAb = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const innerEntries = await unzipXlsx(innerAb);
    return { ok: true, entries: innerEntries };
  }

  if (candidates.length > 1) {
    const names = candidates.map((c) => c.name).join(", ");
    return {
      ok: false,
      error: `Expected exactly one .xlsx report in the archive; found: ${names}`,
    };
  }

  if (!entries.has("[Content_Types].xml")) {
    return { ok: false, error: "The archive contains no .xlsx report." };
  }

  return { ok: true, entries };
}

export async function parseReportFile(arrayBuffer) {
  const { unzipXlsx } = await import("./xlsx/unzip.js");
  const { readWorkbookSheets } = await import("./xlsx/sheet.js");
  const outerEntries = await unzipXlsx(arrayBuffer);
  const resolved = await resolveWorkbookEntries(outerEntries, unzipXlsx);
  if (!resolved.ok) return resolved;
  const sheets = readWorkbookSheets(resolved.entries);
  return parseReport(sheets);
}
