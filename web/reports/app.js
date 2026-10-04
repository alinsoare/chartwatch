import { parseReportFile } from "./parse.js";
import { computeRankings } from "./rank.js";
import { computeLadders } from "./ladder.js";
import { defaultSettings } from "./settings.js";
import {
  loadCache,
  saveReport,
  saveScreenerBundle,
  deserializeReport,
  isStorageDenied,
} from "./cache.js";
import {
  fetchScreenerData,
  attachScreenerToLadders,
} from "./screener.js";
import { createEnsureScreenerChecked } from "./screenerCheck.js";
import { createRenderer, deriveCategories } from "./render.js";

const root = document.body;
const ui = createRenderer(root);
const settings = defaultSettings();

const fileInput = document.getElementById("file-input");
const importBtn = document.getElementById("import-btn");
let parsed = null;
let rankings = null;
let ladders = null;
let filterSet = new Set();
let screenerBundle = null;

function rebuild() {
  if (!parsed) {
    ui.render({ parsed: null });
    return;
  }
  rankings = computeRankings(parsed, settings);
  ladders = computeLadders(parsed, rankings, settings);
  if (screenerBundle?.screener && screenerBundle?.catalog) {
    ladders = attachScreenerToLadders(
      ladders,
      screenerBundle.catalog,
      screenerBundle.screener,
      settings,
    );
  }
  const categories = deriveCategories(parsed);
  ui.render({
    parsed,
    rankings,
    ladders,
    filterSet,
    categories,
    onFilterChange: async () => {
      await persist();
      rebuild();
    },
  });
}

function screenerFreshnessLabel(bundle) {
  if (!bundle) return "Screener: not checked";
  return `Screener: checked ${bundle.fetchedAt?.slice(0, 16) ?? "cached"}`;
}

function reportFreshnessLabel() {
  if (!parsed) return "Report: none";
  const asOf = parsed.metadata?.asOf;
  const base = asOf
    ? `Report: as of ${asOf.toISOString().slice(0, 10)}`
    : "Report: loaded";
  const current = document.getElementById("fresh-report")?.textContent ?? "";
  if (current.includes("(cached)")) return `${base} (cached)`;
  return base;
}

async function persist() {
  if (!parsed) return;
  const res = await saveReport(parsed, [...filterSet], screenerBundle);
  if (!res.persisted || isStorageDenied()) {
    ui.showStorageNotice(
      "Could not persist to IndexedDB — this session works, but a reload will lose the report unless storage is allowed.",
    );
  }
}

const ensureScreenerChecked = createEnsureScreenerChecked({
  fetchScreenerData,
  saveScreenerBundle,
  onSuccess(bundle) {
    screenerBundle = bundle;
    ui.clearScreenerFailure();
    ui.setFreshness(
      reportFreshnessLabel(),
      screenerFreshnessLabel(screenerBundle),
      document.getElementById("fresh-import")?.textContent ?? "Import: —",
    );
    rebuild();
  },
  onFailure(err) {
    ui.showScreenerFailure(`Screener check failed: ${err.message}`, {
      onRetry: () => {
        void ensureScreenerChecked({ force: true }).catch(() => {});
      },
    });
  },
});

async function handleImport(arrayBuffer, fileName) {
  ui.clearError();
  ui.clearScreenerFailure();
  const result = await parseReportFile(arrayBuffer);
  if (!result.ok) {
    ui.showError(result.error);
    return;
  }

  const cached = await loadCache();
  if (cached?.report) {
    const ok = window.confirm(
      "Replace the cached report with this import? Screener data will be kept.",
    );
    if (!ok) return;
  }

  parsed = result;
  filterSet = new Set(deriveCategories(parsed));
  const saveRes = await saveReport(parsed, [...filterSet], screenerBundle);
  if (!saveRes.persisted) {
    ui.showStorageNotice(
      "Could not cache the report in IndexedDB. Data remains for this page session only.",
    );
  }

  ui.setFreshness(
    parsed.metadata.asOf
      ? `Report: as of ${parsed.metadata.asOf.toISOString().slice(0, 10)}`
      : "Report: loaded",
    screenerFreshnessLabel(screenerBundle),
    `Import: ${fileName} just now`,
  );
  rebuild();
  void ensureScreenerChecked().catch(() => {});
}

async function onFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    ui.showError("Please choose an .xlsx file.");
    return;
  }
  const buf = await file.arrayBuffer();
  await handleImport(buf, file.name);
}

importBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  onFile(file);
});

async function boot() {
  ui.render({ parsed: null });
  const cached = await loadCache();

  if (cached?.report) {
    parsed = deserializeReport(cached.report);
    if (parsed) {
      filterSet = new Set(cached.report.categoryFilter ?? deriveCategories(parsed));
      screenerBundle = cached.screener ?? null;

      ui.setFreshness(
        parsed.metadata.asOf
          ? `Report: as of ${parsed.metadata.asOf.toISOString().slice(0, 10)} (cached)`
          : "Report: cached",
        screenerFreshnessLabel(screenerBundle),
        "Import: from cache",
      );
      rebuild();
    }
  }

  void ensureScreenerChecked().catch(() => {});
}

boot();
