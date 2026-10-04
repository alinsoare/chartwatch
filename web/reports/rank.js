import { defaultSettings } from "./settings.js";

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function velocitySamples(trades) {
  const samples = [];
  for (const t of trades) {
    if (t.profitPct == null || t.holdSeconds == null) continue;
    const days = t.holdSeconds / 86400;
    if (days <= 0) continue;
    samples.push(t.profitPct / days);
  }
  return samples;
}

function openDrawdownPct(legs) {
  if (!legs.length) return null;
  let invested = 0;
  let mtm = 0;
  for (const leg of legs) {
    const v = (leg.volume ?? 0) * (leg.openPrice ?? 0);
    invested += v;
    mtm += (leg.netProfit ?? 0);
  }
  if (invested <= 0) return null;
  return (mtm / invested) * 100;
}

function basisLabel(trades) {
  const sources = new Set(trades.map((t) => t.basisSource).filter((s) => s && s !== "none"));
  if (sources.has("margin")) return "posted margin";
  if (sources.has("purchase")) return "cash outlay";
  if (sources.has("notional")) return "notional";
  return "n/a";
}

/**
 * @param {{ closedTrades, openLegs, metadata }} parsed
 * @param settings
 */
export function computeRankings(parsed, settings = defaultSettings()) {
  const byTicker = new Map();

  for (const t of parsed.closedTrades) {
    if (!byTicker.has(t.ticker)) {
      byTicker.set(t.ticker, {
        ticker: t.ticker,
        name: t.name,
        category: t.category,
        closed: [],
        open: [],
      });
    }
    const rec = byTicker.get(t.ticker);
    rec.closed.push(t);
    if (!rec.name && t.name) rec.name = t.name;
    if (!rec.category && t.category) rec.category = t.category;
  }

  for (const leg of parsed.openLegs) {
    if (!byTicker.has(leg.ticker)) {
      byTicker.set(leg.ticker, {
        ticker: leg.ticker,
        name: leg.name,
        category: leg.category,
        closed: [],
        open: [],
      });
    }
    const rec = byTicker.get(leg.ticker);
    rec.open.push(leg);
    if (!rec.name && leg.name) rec.name = leg.name;
    if (!rec.category && leg.category) rec.category = leg.category;
  }

  const rows = [];
  const noHistory = [];

  for (const rec of byTicker.values()) {
    if (!rec.closed.length) {
      if (rec.open.length) {
        noHistory.push({
          ticker: rec.ticker,
          name: rec.name,
          category: rec.category,
          openLegCount: rec.open.length,
          openDrawdownPct: openDrawdownPct(rec.open),
        });
      }
      continue;
    }

    const wins = rec.closed.filter((t) => (t.profit ?? 0) > 0);
    const winRate = wins.length / rec.closed.length;
    const totalProfit = rec.closed.reduce((s, t) => s + (t.profit ?? 0), 0);
    const samples = velocitySamples(rec.closed);
    const velMedian = median(samples);
    const velMean = mean(samples);
    const hasVelocity = samples.length > 0;

    const pcts = rec.closed.map((t) => t.profitPct).filter((p) => p != null);
    const holdSecs = rec.closed.map((t) => t.holdSeconds).filter((h) => h != null);
    const medianHold = median(holdSecs);
    const best = pcts.length ? Math.max(...pcts) : null;
    const worst = pcts.length ? Math.min(...pcts) : null;

    const longs = rec.closed.filter((t) => t.direction === "long");
    const shorts = rec.closed.filter((t) => t.direction === "short");
    const longProfit = longs.reduce((s, t) => s + (t.profit ?? 0), 0);
    const shortProfit = shorts.reduce((s, t) => s + (t.profit ?? 0), 0);

    const drawdown = openDrawdownPct(rec.open);

    const ref = settings.velocityReferenceByCategory[rec.category];
    const uncalibrated = ref == null;

    let rating = null;
    let score = null;
    let ratingReason = null;
    let signal = null;
    let signalReason = null;

    if (uncalibrated) {
      ratingReason = "uncalibrated category";
      signalReason = "uncalibrated category";
    } else if (!hasVelocity) {
      ratingReason = "no measurable velocity";
      signalReason = "no measurable velocity";
    } else {
      const velNorm = Math.min(1, Math.max(0, velMedian / ref));
      score =
        settings.velocityWeight * velNorm + settings.winRateWeight * winRate;
      const shrink =
        0.5 +
        0.5 * Math.min(1, rec.closed.length / settings.fullConfidenceTrades);
      score *= shrink;
      rating = Math.min(5, Math.max(1, Math.round(score * 5)));

      if (velMedian <= 0 || (drawdown != null && drawdown <= settings.semaphoreRedDrawdownPct)) {
        signal = "red";
      } else if (
        velMedian > 0 &&
        winRate >= settings.semaphoreGreenMinWinRate &&
        (drawdown == null || drawdown > settings.semaphoreAmberDrawdownPct)
      ) {
        signal = "green";
      } else {
        signal = "amber";
      }
    }

    rows.push({
      ticker: rec.ticker,
      name: rec.name,
      category: rec.category,
      tradeCount: rec.closed.length,
      winCount: wins.length,
      winRate,
      totalProfit,
      velocityMedian: hasVelocity ? velMedian : null,
      velocityMean: hasVelocity ? velMean : null,
      medianHoldSeconds: medianHold,
      bestPct: best,
      worstPct: worst,
      longCount: longs.length,
      shortCount: shorts.length,
      longProfit,
      shortProfit,
      openDrawdownPct: drawdown,
      basisLabel: basisLabel(rec.closed),
      rating,
      score,
      ratingReason,
      signal,
      signalReason,
      hasOpen: rec.open.length > 0,
      uncalibrated,
    });
  }

  rows.sort((a, b) => {
    const aRated = a.rating != null ? 1 : 0;
    const bRated = b.rating != null ? 1 : 0;
    if (aRated !== bRated) return bRated - aRated;
    const sa = a.score ?? -1;
    const sb = b.score ?? -1;
    if (sa !== sb) return sb - sa;
    const va = a.velocityMedian ?? -1;
    const vb = b.velocityMedian ?? -1;
    return vb - va;
  });

  noHistory.sort((a, b) => a.ticker.localeCompare(b.ticker));

  const watchList = [];
  for (const row of rows) {
    if (watchList.length >= settings.watchListCap) break;
    if (row.signal !== "green") continue;
    if (row.hasOpen) continue;
    watchList.push(row);
  }

  return { ranking: rows, noHistory, watchList };
}

export function signalSeverity(signal) {
  if (signal === "green") return 3;
  if (signal === "amber") return 2;
  if (signal === "red") return 1;
  return 0;
}
