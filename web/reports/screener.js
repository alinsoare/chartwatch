import { defaultSettings, SUFFIX_ALIAS_TABLE } from "./settings.js";

const STRIP_SUFFIXES =
  /\b(inc|plc|sa|ag|nv|etf|ucits|acc|dist|limited|ltd|corp|corporation|co)\b/gi;

export function normalizeInstrumentName(name) {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(STRIP_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesMatch(reportName, catalogName) {
  const a = normalizeInstrumentName(reportName);
  const b = normalizeInstrumentName(catalogName);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function catalogByTicker(catalog) {
  const map = new Map();
  for (const inst of catalog.symbols ?? catalog.instruments ?? []) {
    map.set(inst.ticker, inst);
    for (const alias of inst.aliases ?? []) {
      if (alias) map.set(alias.trim(), inst);
    }
  }
  return map;
}

function suffixCandidate(brokerTicker, table) {
  for (const [from, to] of table) {
    if (!brokerTicker.endsWith(from)) continue;
    const root = brokerTicker.slice(0, -from.length);
    if (to === "") return root;
    return `${root}${to}`;
  }
  return null;
}

/**
 * Resolve broker ticker → screener key with audit trail.
 */
export function resolveTicker(brokerTicker, reportName, catalog, screenerPayload, settings = defaultSettings()) {
  const symbols = screenerPayload?.symbols ?? {};
  const catMap = catalogByTicker(catalog);

  if (brokerTicker in symbols) {
    return {
      status: "resolved",
      screenerKey: brokerTicker,
      matchedName: catMap.get(brokerTicker)?.name ?? brokerTicker,
      via: "verbatim",
    };
  }

  const catEntry = catMap.get(brokerTicker);
  if (catEntry && catEntry.ticker in symbols) {
    return {
      status: "resolved",
      screenerKey: catEntry.ticker,
      matchedName: catEntry.name ?? catEntry.display_name,
      via: "catalog-alias",
    };
  }

  const table = settings.suffixAliasTable ?? SUFFIX_ALIAS_TABLE;
  const candidate = suffixCandidate(brokerTicker, table);
  if (candidate && candidate in symbols) {
    const inst = catMap.get(candidate);
    if (inst && namesMatch(reportName, inst.name ?? inst.display_name ?? "")) {
      return {
        status: "resolved",
        screenerKey: candidate,
        matchedName: inst.name ?? inst.display_name,
        via: "suffix-confirmed",
      };
    }
    return {
      status: "rejected",
      reason: "suffix-name-mismatch",
      rejectedCandidate: candidate,
    };
  }

  return { status: "unknown", reason: "absent" };
}

export function screenerStatusForTicker(resolution, screenerPayload, settings = defaultSettings()) {
  const generated = screenerPayload?.generated_utc;
  if (generated) {
    const ageMs = Date.now() - Date.parse(generated);
    const staleMs = settings.screenerStaleHours * 3600 * 1000;
    if (ageMs > staleMs) {
      return {
        status: "stale",
        score: null,
        marks: null,
        generatedUtc: generated,
      };
    }
  }

  if (resolution.status !== "resolved") {
    return {
      status: "unknown",
      reason: resolution.reason ?? resolution.status,
      rejectedCandidate: resolution.rejectedCandidate,
      score: null,
      marks: null,
      generatedUtc: generated,
    };
  }

  const entry = screenerPayload?.symbols?.[resolution.screenerKey];
  if (!entry) {
    return {
      status: "unknown",
      reason: "no-data",
      score: null,
      marks: null,
      generatedUtc: generated,
    };
  }

  const score = entry.score ?? 0;
  const marks = entry.marks ?? null;
  if (entry.reason === "insufficient-history" || entry.reason === "not-screened") {
    return {
      status: "unknown",
      reason: entry.reason,
      score,
      marks,
      generatedUtc: generated,
      screenerKey: resolution.screenerKey,
      matchedName: resolution.matchedName,
    };
  }

  if (score >= 1) {
    return {
      status: "confirmed",
      score,
      marks,
      generatedUtc: generated,
      screenerKey: resolution.screenerKey,
      matchedName: resolution.matchedName,
    };
  }
  return {
    status: "not-confirmed",
    score,
    marks,
    generatedUtc: generated,
    screenerKey: resolution.screenerKey,
    matchedName: resolution.matchedName,
  };
}

export function attachScreenerToLadders(ladders, catalog, screenerPayload, settings) {
  return ladders.map((lad) => {
    if (!lad.recommendation) return { ...lad, screener: null };
    const resolution = resolveTicker(
      lad.ticker,
      lad.name,
      catalog,
      screenerPayload,
      settings,
    );
    const screener = screenerStatusForTicker(resolution, screenerPayload, settings);
    let recommendedBadge = null;
    if (screener.status === "confirmed" && screener.score >= 1) {
      recommendedBadge = screener.marks ?? 1;
    }
    return { ...lad, screener, recommendedBadge };
  });
}

export async function fetchScreenerData() {
  const [screenerRes, catalogRes] = await Promise.all([
    fetch("../data/screener-scores.json"),
    fetch("../data/catalog.json"),
  ]);
  if (!screenerRes.ok || !catalogRes.ok) {
    throw new Error(
      `Screener fetch failed (${screenerRes.status}/${catalogRes.status})`,
    );
  }
  const screener = await screenerRes.json();
  const catalog = await catalogRes.json();
  return {
    screener,
    catalog,
    fetchedAt: new Date().toISOString(),
  };
}
