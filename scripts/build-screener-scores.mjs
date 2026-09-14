#!/usr/bin/env node
/**
 * Build data/screener-scores.json from catalog + scan-bars payloads.
 *
 * Reuses scoreInstrument() from web/screener/score.js so export and dev
 * backend scores cannot drift from the in-browser screener.
 *
 * Usage:
 *   node scripts/build-screener-scores.mjs <catalog.json> <scan-bars.json> [--output <path>]
 *
 * Without --output, writes JSON to stdout. Exits non-zero on parse or scoring errors.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { scoreInstrument } from "../web/screener/score.js";
import { SCAN_CACHE_VERSION } from "../web/screener/scan.js";

function usage() {
  console.error(
    "Usage: node scripts/build-screener-scores.mjs <catalog.json> <scan-bars.json> [--output <path>]",
  );
  process.exit(1);
}

function parseArgs(argv) {
  if (argv.length < 2) usage();
  const catalogPath = argv[0];
  const scanBarsPath = argv[1];
  let outputPath = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--output") {
      outputPath = argv[++i];
      if (!outputPath) usage();
    } else {
      usage();
    }
  }
  return { catalogPath, scanBarsPath, outputPath };
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`Failed to read ${label} at ${path}: ${err.message}`);
    process.exit(1);
  }
}

export function buildScreenerScores(catalog, scanBars) {
  const symbols = catalog.symbols || [];
  const bySymbol = Object.fromEntries(symbols.map((s) => [s.ticker, s]));
  const scores = {};
  let screenedCount = 0;
  let enabledCount = 0;

  for (const entry of symbols) {
    if (entry.enabled) enabledCount += 1;
    let result;
    try {
      if (!entry.enabled) {
        result = scoreInstrument({
          enabled: false,
          seriesByTimeframe: {},
          pointSize: entry.point_size,
        });
      } else {
        const series = scanBars.symbols?.[entry.ticker] ?? {};
        result = scoreInstrument({
          enabled: true,
          seriesByTimeframe: series,
          pointSize: bySymbol[entry.ticker]?.point_size ?? 0.01,
        });
      }
    } catch {
      result = {
        status: "insufficient-history",
        score: 0,
        marks: 0,
        reasons: [],
        rangePct: null,
        positionPct: null,
        headroomPct: null,
      };
    }
    scores[entry.ticker] = result;
    if (result.status === "screened") screenedCount += 1;
  }

  return {
    generated_utc: catalog.generated_utc,
    scoring_model_version: SCAN_CACHE_VERSION,
    symbol_count: symbols.length,
    enabled_count: enabledCount,
    screened_count: screenedCount,
    symbols: scores,
  };
}

function main() {
  const { catalogPath, scanBarsPath, outputPath } = parseArgs(process.argv.slice(2));
  const catalog = readJson(catalogPath, "catalog.json");
  const scanBars = readJson(scanBarsPath, "scan-bars.json");
  const payload = buildScreenerScores(catalog, scanBars);
  const json = JSON.stringify(payload);
  if (outputPath) {
    writeFileSync(outputPath, json, "utf8");
  } else {
    process.stdout.write(json);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
