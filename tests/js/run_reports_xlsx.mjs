/* XLSX unzip/sheet tests. Dev-time only: node tests/js/run_reports_xlsx.mjs */

import {
  readFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { deflateRawSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipXlsx } from "../../web/reports/xlsx/unzip.js";
import { readWorkbookSheets, excelSerialToDate } from "../../web/reports/xlsx/sheet.js";
import { parseReport } from "../../web/reports/parse.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

let failures = 0;

function fail(msg) {
  failures += 1;
  console.error(`FAIL ${msg}`);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function buildZipFixed(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data);
    const local = Buffer.alloc(30 + nameBytes.length + compressed.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);
    compressed.copy(local, 30 + nameBytes.length);
    locals.push(local);
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(8, 10); // method
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk start
    central.writeUInt16LE(0, 36); // int attr
    central.writeUInt32LE(0, 38); // ext attr
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

const helloXml = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`;
const zipBuf = buildZipFixed([["hello.txt", Buffer.from("hello deflate", "utf8")]]);
const ab = zipBuf.buffer.slice(zipBuf.byteOffset, zipBuf.byteOffset + zipBuf.byteLength);

try {
  const entries = await unzipXlsx(ab);
  const payload = entries.get("hello.txt");
  if (!payload || new TextDecoder().decode(payload) !== "hello deflate") {
    fail("raw deflate fixture round-trip");
  }
} catch (e) {
  fail(`unzip fixture: ${e.message}`);
}

const shared = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1"><si><t>ETF</t></si></sst>`;
const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>TestCo</t></is></c><c r="B1"><v>TEST.DE</v></c><c r="C1" t="s"><v>0</v></c></row>
</sheetData></worksheet>`;
const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Closed Positions" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

const miniXlsx = buildZipFixed([
  ["xl/sharedStrings.xml", Buffer.from(shared)],
  ["xl/workbook.xml", Buffer.from(workbook)],
  ["xl/_rels/workbook.xml.rels", Buffer.from(rels)],
  ["xl/worksheets/sheet1.xml", Buffer.from(sheet1)],
  ["[Content_Types].xml", Buffer.from(helloXml)],
]);

const miniEntries = await unzipXlsx(
  miniXlsx.buffer.slice(miniXlsx.byteOffset, miniXlsx.byteOffset + miniXlsx.byteLength),
);
const sheets = readWorkbookSheets(miniEntries);
const closed = sheets.get("Closed Positions");
if (closed?.[0]?.B !== "TEST.DE") fail("synthetic sheet cell B");

const serialDate = excelSerialToDate(46248);
if (!serialDate || serialDate.getFullYear() < 2025) fail("excel serial date");

const realPath = join(REPO, "data/broker-reports/EUR_51940879_2025-12-31_2026-08-14.xlsx");
if (readFileSync(realPath)) {
  const realBuf = readFileSync(realPath);
  const realAb = realBuf.buffer.slice(realBuf.byteOffset, realBuf.byteOffset + realBuf.byteLength);
  const { parseReportFile } = await import("../../web/reports/parse.js");
  const parsed = await parseReportFile(realAb);
  if (!parsed.ok) fail(`real xlsx parse: ${parsed.error}`);
  else {
    if (parsed.metadata.reconciliation) {
      fail(`real xlsx reconciliation diff ${parsed.metadata.reconciliation.diff}`);
    }
    if (parsed.metadata.equityUndeterminable) {
      fail("real xlsx equity undeterminable");
    }
    process.stdout.write(
      `real xlsx: ${parsed.closedTrades.length} closed, equity ${parsed.metadata.equity?.toFixed(2)}, dates serial\n`,
    );

    const entries = await unzipXlsx(realAb);
    const sheetsBase = readWorkbookSheets(entries);
    const open = sheetsBase.get("Open Positions");

    const emptyProductA = open.map((r, i) => (i === 4 ? { ...r, A: "" } : { ...r }));
    const sheetsEmptyA = new Map(sheetsBase);
    sheetsEmptyA.set("Open Positions", emptyProductA);
    const pEmptyA = parseReport(sheetsEmptyA);
    if (!pEmptyA.ok || pEmptyA.metadata.equityUndeterminable) {
      fail("equity with merged Product column (empty A on value row)");
    }

    const altLabel = open.map((r, i) =>
      i === 4 ? { ...r, B: "Open position value" } : { ...r },
    );
    const sheetsAlt = new Map(sheetsBase);
    sheetsAlt.set("Open Positions", altLabel);
    const pAlt = parseReport(sheetsAlt);
    if (!pAlt.ok || pAlt.metadata.equityUndeterminable) {
      fail("equity with Open position value metric label");
    }

    const nestedZip = buildZipFixed([
      [`folder/sub/report.xlsx`, realBuf],
    ]);
    const nestedAb = nestedZip.buffer.slice(
      nestedZip.byteOffset,
      nestedZip.byteOffset + nestedZip.byteLength,
    );
    const fromZip = await parseReportFile(nestedAb);
    if (!fromZip.ok) fail(`nested zip parse: ${fromZip.error}`);
    else if (
      fromZip.closedTrades.length !== parsed.closedTrades.length ||
      fromZip.openLegs.length !== parsed.openLegs.length ||
      fromZip.metadata.account !== parsed.metadata.account
    ) {
      fail("nested zip parse differs from bare xlsx");
    }

    const macZip = buildZipFixed([
      ["__MACOSX/._report.xlsx", Buffer.from("junk", "utf8")],
      ["reports/EUR_real.xlsx", realBuf],
      ["readme.txt", Buffer.from("notes", "utf8")],
    ]);
    const macAb = macZip.buffer.slice(macZip.byteOffset, macZip.byteOffset + macZip.byteLength);
    const fromMacZip = await parseReportFile(macAb);
    if (!fromMacZip.ok) fail(`mac junk zip parse: ${fromMacZip.error}`);
    else if (fromMacZip.closedTrades.length !== parsed.closedTrades.length) {
      fail("mac junk zip closed trade count");
    }

    const emptyZip = buildZipFixed([]);
    const emptyAb = emptyZip.buffer.slice(emptyZip.byteOffset, emptyZip.byteOffset + emptyZip.byteLength);
    const emptyResult = await parseReportFile(emptyAb);
    if (emptyResult.ok || !emptyResult.error?.includes("no .xlsx report")) {
      fail(`empty zip expected no-xlsx error, got ${emptyResult.ok ? "ok" : emptyResult.error}`);
    }

    const noXlsxZip = buildZipFixed([["notes/readme.txt", Buffer.from("hello", "utf8")]]);
    const noXlsxAb = noXlsxZip.buffer.slice(
      noXlsxZip.byteOffset,
      noXlsxZip.byteOffset + noXlsxZip.byteLength,
    );
    const noXlsxResult = await parseReportFile(noXlsxAb);
    if (noXlsxResult.ok || !noXlsxResult.error?.includes("no .xlsx report")) {
      fail(`text-only zip expected no-xlsx error, got ${noXlsxResult.ok ? "ok" : noXlsxResult.error}`);
    }

    const twoZip = buildZipFixed([
      ["a/report_a.xlsx", realBuf],
      ["b/report_b.xlsx", realBuf],
    ]);
    const twoAb = twoZip.buffer.slice(twoZip.byteOffset, twoZip.byteOffset + twoZip.byteLength);
    const twoResult = await parseReportFile(twoAb);
    if (twoResult.ok || !twoResult.error?.includes("exactly one")) {
      fail(`two-report zip expected rejection, got ${twoResult.ok ? "ok" : twoResult.error}`);
    }
    if (twoResult.error && !twoResult.error.includes("report_a.xlsx")) {
      fail("two-report zip error should list report names");
    }
  }
}

const miniAb = miniXlsx.buffer.slice(miniXlsx.byteOffset, miniXlsx.byteOffset + miniXlsx.byteLength);
const miniZip = buildZipFixed([["nested/synthetic.xlsx", Buffer.from(miniAb)]]);
const miniZipAb = miniZip.buffer.slice(miniZip.byteOffset, miniZip.byteOffset + miniZip.byteLength);
const { parseReportFile: parseReportFile2 } = await import("../../web/reports/parse.js");
const bareMini = await parseReportFile2(miniAb);
const miniFromZip = await parseReportFile2(miniZipAb);
if (miniFromZip.ok !== bareMini.ok || miniFromZip.error !== bareMini.error) {
  fail(
    `synthetic xlsx in zip should match bare mini workbook result (zip: ${miniFromZip.error ?? "ok"}, bare: ${bareMini.error ?? "ok"})`,
  );
}

const sampleXlsx = join(
  homedir(),
  "xtb-reports/reports/51940879/EUR_51940879_2006-01-01_2026-10-02.xlsx",
);
if (existsSync(sampleXlsx)) {
  const tmpDir = mkdtempSync(join(tmpdir(), "cw-zip-import-"));
  const zipPath = join(tmpDir, "sample.zip");
  try {
    execFileSync("python3", ["-m", "zipfile", "-c", zipPath, sampleXlsx], { stdio: "pipe" });
    const zipBuf = readFileSync(zipPath);
    const zipAb = zipBuf.buffer.slice(zipBuf.byteOffset, zipBuf.byteOffset + zipBuf.byteLength);
    const bareBuf = readFileSync(sampleXlsx);
    const bareAb = bareBuf.buffer.slice(bareBuf.byteOffset, bareBuf.byteOffset + bareBuf.byteLength);
    const bareParsed = await parseReportFile2(bareAb);
    const zipParsed = await parseReportFile2(zipAb);
    if (!bareParsed.ok) fail(`sample bare xlsx: ${bareParsed.error}`);
    else if (!zipParsed.ok) fail(`sample zip xlsx: ${zipParsed.error}`);
    else if (
      zipParsed.closedTrades.length !== bareParsed.closedTrades.length ||
      zipParsed.openLegs.length !== bareParsed.openLegs.length ||
      zipParsed.metadata.account !== bareParsed.metadata.account
    ) {
      fail("sample zip vs bare xlsx metadata/count mismatch");
    } else {
      process.stdout.write(
        `sample zip parity: ${zipParsed.closedTrades.length} closed, account ${zipParsed.metadata.account}\n`,
      );
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all reports xlsx checks pass");
