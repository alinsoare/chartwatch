/* Pure catalog list filtering and ordering — no DOM, testable in Node. */

import { VALID_SORT_ORDERS } from "./settings.js";

export function filterSymbols(symbols, filters) {
  const query = (filters.search || "").trim().toLowerCase();
  const assetClass = filters.assetClass || "";
  const quoteCurrency = filters.quoteCurrency || "";
  const exchange = filters.exchange || "";
  const compatibleOnly = filters.compatibleOnly || false;
  const enabledOnly = filters.enabledOnly || false;

  return symbols.filter((s) => {
    if (compatibleOnly && !s.compatible) return false;
    if (enabledOnly && !s.enabled) return false;
    if (assetClass && s.asset_class !== assetClass) return false;
    if (quoteCurrency && s.quote_currency !== quoteCurrency) return false;
    if (exchange && s.exchange !== exchange) return false;
    if (!query) return true;
    return (
      s.ticker.toLowerCase().includes(query) ||
      (s.name || "").toLowerCase().includes(query) ||
      (s.display_name || "").toLowerCase().includes(query)
    );
  });
}

function sortWithIndex(symbols, compareSymbols) {
  return symbols
    .map((symbol, index) => ({ symbol, index }))
    .sort((a, b) => {
      const cmp = compareSymbols(a.symbol, b.symbol);
      if (cmp !== 0) return cmp;
      return a.index - b.index;
    })
    .map((entry) => entry.symbol);
}

function compareScore(a, b, screenerScores) {
  const scoreA = screenerScores[a.ticker]?.score ?? 0;
  const scoreB = screenerScores[b.ticker]?.score ?? 0;
  return scoreB - scoreA;
}

function compareSymbol(a, b) {
  return a.ticker.localeCompare(b.ticker);
}

function compareName(a, b) {
  return (a.name || "").localeCompare(b.name || "");
}

function compareHeadroom(a, b, screenerScores) {
  const aHeadroom = screenerScores[a.ticker]?.headroomPct;
  const bHeadroom = screenerScores[b.ticker]?.headroomPct;
  if (aHeadroom != null && bHeadroom == null) return -1;
  if (aHeadroom == null && bHeadroom != null) return 1;
  if (aHeadroom != null && bHeadroom != null && bHeadroom !== aHeadroom) {
    return bHeadroom - aHeadroom;
  }
  return 0;
}

const COMPARATORS = {
  score: (a, b, scores) => compareScore(a, b, scores),
  symbol: (a, b) => compareSymbol(a, b),
  name: (a, b) => compareName(a, b),
  headroom: (a, b, scores) => compareHeadroom(a, b, scores),
};

export function sortSymbols(symbols, sortOrder, screenerScores = {}) {
  if (sortOrder === "default") return symbols;
  if (!VALID_SORT_ORDERS.has(sortOrder)) return symbols;
  const comparator = COMPARATORS[sortOrder];
  if (!comparator) return symbols;
  return sortWithIndex(symbols, (a, b) => comparator(a, b, screenerScores));
}

export function visibleSymbolList(symbols, filters, sortOrder, screenerScores = {}) {
  return sortSymbols(filterSymbols(symbols, filters), sortOrder, screenerScores);
}
