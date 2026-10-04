function categoryAllowed(rowCategory, filterSet) {
  const cat = rowCategory || "";
  if (!cat) return true;
  return filterSet.has(cat);
}

function legOpenPl(leg) {
  if (leg.netProfit != null) return leg.netProfit;
  return (leg.volume ?? 0) * ((leg.currentPrice ?? 0) - (leg.openPrice ?? 0));
}

function tickerCategoryMap(parsed) {
  const map = new Map();
  for (const t of parsed.closedTrades) {
    if (t.ticker && t.category) map.set(t.ticker, t.category);
  }
  for (const leg of parsed.openLegs) {
    if (leg.ticker && leg.category) map.set(leg.ticker, leg.category);
  }
  return map;
}

/**
 * Portfolio summary for the current category filter (matches xtb-reports scoped header).
 */
export function computeScopedSummary(parsed, rankings, ladders, filterSet, categories) {
  const m = parsed.metadata;
  const allSelected =
    !categories.length || categories.every((c) => filterSet.has(c));

  if (allSelected) {
    const openPnl = ladders.reduce((s, l) => s + (l.unrealized ?? 0), 0);
    return {
      subset: false,
      realized:
        m.statedRealizedTotal ??
        rankings.ranking.reduce((s, r) => s + r.totalProfit, 0),
      openPnl,
      taxes: m.taxesPaid ?? 0,
      closedCount: parsed.closedTrades.length,
      openLegCount: parsed.openLegs.length,
      equity: m.equity,
      equityUndeterminable: m.equityUndeterminable,
    };
  }

  let realized = 0;
  let closedCount = 0;
  for (const t of parsed.closedTrades) {
    if (!categoryAllowed(t.category, filterSet)) continue;
    realized += t.profit ?? 0;
    closedCount += 1;
  }

  let openPnl = 0;
  let openLegCount = 0;
  for (const leg of parsed.openLegs) {
    if (!categoryAllowed(leg.category, filterSet)) continue;
    openPnl += legOpenPl(leg);
    openLegCount += 1;
  }

  const tickerCat = tickerCategoryMap(parsed);
  let taxes = 0;
  for (const entry of parsed.taxEntries ?? []) {
    const cat = tickerCat.get(entry.ticker) ?? "";
    if (!categoryAllowed(cat, filterSet)) continue;
    taxes += Math.abs(Math.min(0, entry.amount ?? 0));
  }

  return {
    subset: true,
    realized,
    openPnl,
    taxes,
    closedCount,
    openLegCount,
    equity: m.equity,
    equityUndeterminable: m.equityUndeterminable,
  };
}
