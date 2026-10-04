import {
  RUNG_AMOUNTS_EUR,
  RUNG_CUMULATIVE_EUR,
  RUNG_NET_TP_PCT,
  RUNG_TRIGGERS_PCT,
  grossMoveFromNetRate,
  netProfitFromGross,
  defaultSettings,
} from "./settings.js";

function daysBetween(from, to) {
  if (!from || !to) return 0;
  return (to.getTime() - from.getTime()) / 86400000;
}

function effectiveNetRate(configuredPct, periodsHeld, settings) {
  if (!settings.escalationStepPct) return configuredPct;
  const floor = settings.escalationStepPct * periodsHeld;
  return Math.max(configuredPct, floor);
}

function inferActiveRung(invested, settings) {
  const cum = settings.rungAmountsEur.reduce((acc, amt, i) => {
    acc.push((acc[i - 1] ?? 0) + amt);
    return acc;
  }, []);
  let active = 0;
  for (let i = 0; i < cum.length; i++) {
    if (invested + 1e-9 >= cum[i]) active = i;
  }
  return active;
}

function blendedFromLegs(legs) {
  let shares = 0;
  let cost = 0;
  for (const leg of legs) {
    const sh = leg.volume ?? 0;
    const px = leg.openPrice ?? 0;
    shares += sh;
    cost += sh * px;
  }
  if (shares <= 0) return { avg: null, shares: 0, invested: 0 };
  return { avg: cost / shares, shares, invested: cost };
}

function currentPrice(legs) {
  const leg = legs[0];
  return leg?.currentPrice ?? null;
}

function planEntryPrice(basePrice, triggerPct) {
  return basePrice * (1 + triggerPct / 100);
}

function purePlanBlended(basePrice, rungIndex, settings) {
  let totalAmt = 0;
  let totalShares = 0;
  for (let k = 0; k <= rungIndex; k++) {
    const amt = settings.rungAmountsEur[k];
    const trig = k === 0 ? 0 : settings.rungTriggersPct[k];
    const entryPx = k === 0 ? basePrice : planEntryPrice(basePrice, trig);
    const sh = amt / entryPx;
    totalAmt += amt;
    totalShares += sh;
  }
  return totalAmt / totalShares;
}

function toppedUpBlended(basePrice, activeRung, targetRung, held, settings) {
  let totalAmt = held.invested;
  let totalShares = held.shares;
  for (let j = activeRung + 1; j <= targetRung; j++) {
    const cumTarget = settings.rungAmountsEur.slice(0, j + 1).reduce((a, b) => a + b, 0);
    const topUp = cumTarget - totalAmt;
    if (topUp <= 0) continue;
    const trig = settings.rungTriggersPct[j];
    const entryPx = planEntryPrice(basePrice, trig);
    const sh = topUp / entryPx;
    totalAmt += topUp;
    totalShares += sh;
  }
  return totalAmt / totalShares;
}

function rungBlendedAverage(rungIndex, activeRung, basePrice, held, settings) {
  if (rungIndex < activeRung) {
    return purePlanBlended(basePrice, rungIndex, settings);
  }
  if (rungIndex === activeRung) {
    return held.avg;
  }
  return toppedUpBlended(basePrice, activeRung, rungIndex, held, settings);
}

function idealTriggerSpacing(settings) {
  const ideals = [null];
  for (let i = 1; i < settings.rungTriggersPct.length; i++) {
    ideals.push(settings.rungTriggersPct[i]);
  }
  return ideals;
}

function computeTriggers(basePrice, activeRung, legs, settings) {
  const ideals = idealTriggerSpacing(settings);
  const sortedLegs = [...legs].sort(
    (a, b) => (a.openAt?.getTime() ?? 0) - (b.openAt?.getTime() ?? 0),
  );
  const cum = settings.rungAmountsEur.reduce((acc, amt, i) => {
    acc.push((acc[i - 1] ?? 0) + amt);
    return acc;
  }, []);

  let running = 0;
  let anchorDrawdown = null;
  for (const leg of sortedLegs) {
    running += (leg.volume ?? 0) * (leg.openPrice ?? 0);
    while (activeRung + 1 < cum.length && running >= cum[activeRung + 1] - 1e-6) {
      activeRung += 1;
      if (basePrice > 0) {
        anchorDrawdown = ((leg.openPrice - basePrice) / basePrice) * 100;
      }
    }
  }

  const effective = [...ideals];
  if (activeRung + 1 < ideals.length && anchorDrawdown != null) {
    let prevEffective = ideals[activeRung + 1] ?? ideals[activeRung];
    for (let k = activeRung + 1; k < ideals.length; k++) {
      if (k === activeRung + 1) {
        const delta = (ideals[k] ?? 0) - (ideals[k - 1] ?? 0);
        const raw = anchorDrawdown - delta;
        effective[k] = Math.min(ideals[k], raw);
        prevEffective = effective[k];
      } else {
        const delta = (ideals[k] ?? 0) - (ideals[k - 1] ?? 0);
        const raw = prevEffective - delta;
        effective[k] = Math.min(ideals[k], raw);
        prevEffective = effective[k];
      }
    }
  }
  return { effectiveTriggers: effective, anchorDrawdown };
}

function planState(invested, rungIndex, currentPx, settings) {
  const cum = settings.rungAmountsEur.slice(0, rungIndex + 1).reduce((a, b) => a + b, 0);
  if (invested + 1e-6 >= cum) return "filled";
  const trig = rungIndex === 0 ? null : settings.rungTriggersPct[rungIndex];
  if (trig == null) return "awaiting trigger";
  const triggerPx = planEntryPrice(settings._basePrice ?? 0, trig);
  if (currentPx != null && currentPx <= triggerPx) return "due";
  return "awaiting trigger";
}

/**
 * @param parsed report
 * @param rankings from computeRankings (for semaphore)
 * @param settings
 */
export function computeLadders(parsed, rankings, settings = defaultSettings()) {
  settings = {
    ...defaultSettings(),
    ...settings,
    rungAmountsEur: settings.rungAmountsEur ?? RUNG_AMOUNTS_EUR,
    rungTriggersPct: settings.rungTriggersPct ?? RUNG_TRIGGERS_PCT,
    rungNetTpPct: settings.rungNetTpPct ?? RUNG_NET_TP_PCT,
  };

  const signalByTicker = new Map(rankings.ranking.map((r) => [r.ticker, r.signal]));

  const groups = new Map();
  for (const leg of parsed.openLegs) {
    const dir = leg.direction === "unknown" ? "long" : leg.direction;
    const key = `${leg.ticker}|${dir}`;
    if (!groups.has(key)) {
      groups.set(key, { ticker: leg.ticker, direction: dir, legs: [], assumedDirection: leg.direction === "unknown" });
    }
    groups.get(key).legs.push(leg);
  }

  const ladders = [];
  const asOf = parsed.metadata.asOf;

  for (const group of groups.values()) {
    const { legs, direction, assumedDirection } = group;
    const price = currentPrice(legs);
    const held = blendedFromLegs(legs);
    const sorted = [...legs].sort(
      (a, b) => (a.openAt?.getTime() ?? 0) - (b.openAt?.getTime() ?? 0),
    );
    const baseLeg = sorted[0];
    const basePrice = baseLeg?.openPrice ?? null;

    const marketValue = legs.reduce(
      (s, l) => s + (l.volume ?? 0) * (l.currentPrice ?? 0),
      0,
    );

    if (direction === "short") {
      ladders.push({
        ticker: group.ticker,
        direction: "short",
        unsupported: true,
        legs,
        marketValue,
        held,
        currentPrice: price,
        flags: ["short-unsupported"],
      });
      continue;
    }

    if (!basePrice || held.shares <= 0) {
      ladders.push({
        ticker: group.ticker,
        direction: "long",
        unsupported: true,
        legs,
        marketValue,
        flags: ["no-projection"],
      });
      continue;
    }

    settings._basePrice = basePrice;
    const activeRung = inferActiveRung(held.invested, settings);
    const oldest = sorted[0]?.openAt;
    const daysHeld = daysBetween(oldest, asOf);
    const periodsHeld = Math.max(
      1,
      Math.ceil(daysHeld / settings.escalationPeriodDays),
    );

    const { effectiveTriggers, anchorDrawdown } = computeTriggers(
      basePrice,
      activeRung,
      legs,
      settings,
    );

    const cum = settings.rungAmountsEur.reduce((acc, amt, i) => {
      acc.push((acc[i - 1] ?? 0) + amt);
      return acc;
    }, []);

    const levels = [];
    for (let k = 0; k < settings.rungAmountsEur.length; k++) {
      const configuredNet = settings.rungNetTpPct[k];
      const effectiveNet = effectiveNetRate(configuredNet, periodsHeld, settings);
      const escalated = effectiveNet > configuredNet + 1e-9;
      const grossRate = grossMoveFromNetRate(effectiveNet, settings.taxRate);
      const blended = rungBlendedAverage(k, activeRung, basePrice, held, settings);
      const exitPrice = blended * (1 + grossRate);
      const basis =
        k === activeRung ? "current-position" : "staged-plan";
      const cumAmt = cum[k];
      const shares = cumAmt / blended;
      let grossEur;
      if (k === activeRung) {
        grossEur = (exitPrice - held.avg) * held.shares;
      } else {
        grossEur = (exitPrice - blended) * shares;
      }
      const netEur = netProfitFromGross(grossEur, settings.taxRate);
      const offsetPct = price != null ? ((exitPrice - price) / price) * 100 : null;
      const distance =
        k === activeRung && price != null ? exitPrice - price : null;
      const state = planState(held.invested, k, price, settings);
      let reached = null;
      if (k === activeRung && price != null) {
        reached = price >= exitPrice;
      }
      levels.push({
        rung: k + 1,
        basis,
        cumulativeEur: cumAmt,
        blendedAverage: blended,
        configuredNetPct: configuredNet,
        effectiveNetPct: effectiveNet,
        escalated,
        grossRatePct: grossRate * 100,
        exitPrice,
        offsetPct,
        distanceToTarget: distance,
        planState: k === activeRung ? null : state,
        reached,
        netProfitEur: netEur,
      });
    }

    const activeLevel = levels[activeRung];
    const sellNowGross = price != null ? (price - held.avg) * held.shares : null;
    const sellNowNet =
      sellNowGross != null ? netProfitFromGross(sellNowGross, settings.taxRate) : null;

    const floorFail =
      activeLevel &&
      activeLevel.netProfitEur != null &&
      activeLevel.netProfitEur < settings.minNetProfitEur;

    const overBudget = held.invested > settings.maxLadderBudgetEur;

    let deepestCrossed = null;
    for (let k = activeRung + 1; k < effectiveTriggers.length; k++) {
      const trig = effectiveTriggers[k];
      if (trig == null) continue;
      const trigPx = planEntryPrice(basePrice, trig);
      if (price != null && price <= trigPx) deepestCrossed = k;
    }

    let recommendation = null;
    const nextRung = activeRung + 1;
    const sem = signalByTicker.get(group.ticker);
    const terminal = activeRung >= settings.rungAmountsEur.length - 1;
    if (
      !terminal &&
      !assumedDirection &&
      basePrice &&
      sem !== "red" &&
      nextRung < effectiveTriggers.length
    ) {
      const effTrig = effectiveTriggers[nextRung];
      const trigPx = planEntryPrice(basePrice, effTrig);
      if (price != null && price <= trigPx) {
        const targetCum = cum[nextRung];
        const shortfall = targetCum - held.invested;
        const drawdown = ((price - basePrice) / basePrice) * 100;
        recommendation = {
          tier: nextRung + 1,
          drawdownPct: drawdown,
          shortfallEur: shortfall,
        };
      }
    }

    const flags = [];
    if (assumedDirection) flags.push("assumed-direction");
    if (floorFail) flags.push("min-net-profit-floor");
    if (overBudget) flags.push("over-budget");
    if (sem === "red") flags.push("no-averaging-into-red");
    if (deepestCrossed != null) flags.push(`trigger-hit-R${deepestCrossed + 1}`);
    if (recommendation) flags.push(`recommend-R${recommendation.tier}`);

    let equityCapNote = null;
    if (parsed.metadata.equity != null && parsed.metadata.equity > 0) {
      const cap = (settings.equityCapPct / 100) * parsed.metadata.equity;
      if (marketValue >= cap) {
        flags.push("equity-cap-breach");
      }
      if (recommendation) {
        const projected = marketValue + recommendation.shortfallEur;
        if (projected > cap) {
          equityCapNote = {
            overshootEur: projected - cap,
          };
        }
      }
    } else if (parsed.metadata.equityUndeterminable) {
      flags.push("equity-cap-unenforceable");
    }

    ladders.push({
      ticker: group.ticker,
      name: legs[0]?.name ?? "",
      category: legs[0]?.category ?? "",
      direction: "long",
      assumedDirection,
      activeRung: activeRung + 1,
      effectiveNetTpPct: activeLevel?.effectiveNetPct,
      invested: held.invested,
      blendedAverage: held.avg,
      currentPrice: price,
      unrealized: sellNowGross,
      ageDays: daysHeld,
      periodsHeld,
      basePrice,
      anchorDrawdown,
      effectiveTriggers,
      levels,
      sellNow: { gross: sellNowGross, net: sellNowNet },
      recommendation,
      equityCapNote,
      marketValue,
      flags,
      legs,
    });
  }

  ladders.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return ladders;
}

export { RUNG_CUMULATIVE_EUR };
