/** Strategy and ranking constants (shipped values; no settings UI in v1). */

export const RUNG_AMOUNTS_EUR = [300, 500, 800, 1300, 2100];

/** Cumulative invested through each rung (derived from RUNG_AMOUNTS_EUR). */
export const RUNG_CUMULATIVE_EUR = RUNG_AMOUNTS_EUR.reduce((acc, amt, i) => {
  acc.push((acc[i - 1] ?? 0) + amt);
  return acc;
}, []);

export const RUNG_TRIGGERS_PCT = [null, -8, -13, -21, -34];

export const RUNG_NET_TP_PCT = [5, 4, 3, 2, 1];

export const TAX_RATE = 0.1;

export const MIN_NET_PROFIT_EUR = 15;

export const MAX_LADDER_BUDGET_EUR = 5000;

export const ESCALATION_STEP_PCT = 1;

export const ESCALATION_PERIOD_DAYS = 30;

export const EQUITY_CAP_PCT = 20;

/** Per-day profit velocity reference by category (CFD omitted = uncalibrated). */
export const VELOCITY_REFERENCE_BY_CATEGORY = {
  ETF: 0.002,
  ETN: 0.002,
  ETC: 0.002,
  STOCK: 0.002,
};

export const VELOCITY_WEIGHT = 0.55;

export const WIN_RATE_WEIGHT = 0.45;

export const FULL_CONFIDENCE_TRADES = 5;

export const SEMAPHORE_AMBER_DRAWDOWN_PCT = -8;

export const SEMAPHORE_RED_DRAWDOWN_PCT = -15;

export const SEMAPHORE_GREEN_MIN_WIN_RATE = 0.6;

export const WATCH_LIST_CAP = 10;

export const SCREENER_STALE_HOURS = 18;

/** Same-listing suffix aliases (broker suffix → Yahoo/catalog suffix). */
export const SUFFIX_ALIAS_TABLE = [
  [".FR", ".PA"],
  [".NL", ".AS"],
  [".BE", ".BR"],
  [".PT", ".LS"],
  [".UK", ".L"],
  [".US", ""],
  [".IT", ".MI"],
  [".ES", ".MC"],
  [".FI", ".HE"],
  [".SE", ".ST"],
  [".NO", ".OL"],
  [".DK", ".CO"],
  [".CH", ".SW"],
  [".PL", ".WA"],
];

export function grossMoveFromNetRate(netRatePct, taxRate = TAX_RATE) {
  const net = netRatePct / 100;
  return net / (1 - taxRate);
}

export function netProfitFromGross(grossEur, taxRate = TAX_RATE) {
  if (grossEur <= 0) return grossEur;
  return grossEur * (1 - taxRate);
}

export function defaultSettings() {
  return {
    rungAmountsEur: [...RUNG_AMOUNTS_EUR],
    rungTriggersPct: [...RUNG_TRIGGERS_PCT],
    rungNetTpPct: [...RUNG_NET_TP_PCT],
    taxRate: TAX_RATE,
    minNetProfitEur: MIN_NET_PROFIT_EUR,
    maxLadderBudgetEur: MAX_LADDER_BUDGET_EUR,
    escalationStepPct: ESCALATION_STEP_PCT,
    escalationPeriodDays: ESCALATION_PERIOD_DAYS,
    equityCapPct: EQUITY_CAP_PCT,
    velocityReferenceByCategory: { ...VELOCITY_REFERENCE_BY_CATEGORY },
    velocityWeight: VELOCITY_WEIGHT,
    winRateWeight: WIN_RATE_WEIGHT,
    fullConfidenceTrades: FULL_CONFIDENCE_TRADES,
    semaphoreAmberDrawdownPct: SEMAPHORE_AMBER_DRAWDOWN_PCT,
    semaphoreRedDrawdownPct: SEMAPHORE_RED_DRAWDOWN_PCT,
    semaphoreGreenMinWinRate: SEMAPHORE_GREEN_MIN_WIN_RATE,
    watchListCap: WATCH_LIST_CAP,
    screenerStaleHours: SCREENER_STALE_HOURS,
    suffixAliasTable: SUFFIX_ALIAS_TABLE.map(([a, b]) => [a, b]),
  };
}
