/**
 * Minimal XLSX sheet reader (shared strings, numbers, inline strings, serial dates).
 */

import { attrValue, decodeXmlEntities, elementBlocks, selfClosingTags, tagContents } from "./xml.js";

const REL_NS_ID = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function colLetter(cellRef) {
  return (cellRef.match(/^[A-Z]+/) ?? [""])[0];
}

function parseSharedStrings(xmlText) {
  const strings = [];
  for (const si of elementBlocks(xmlText, "si")) {
    const ts = tagContents(si.inner, "t");
    if (ts.length) {
      strings.push(decodeXmlEntities(ts.join("")));
    } else {
      strings.push("");
    }
  }
  return strings;
}

function cellText(cellBlock, sharedStrings) {
  const openMatch = cellBlock.open ?? cellBlock;
  const openTag = typeof openMatch === "string" ? openMatch : openMatch.open;
  const inner = cellBlock.inner ?? "";
  const type = attrValue(openTag, "t");
  const vMatch = inner.match(/<(?:[a-zA-Z0-9]+:)?v[^>]*>([^<]*)<\//);
  const vText = vMatch ? decodeXmlEntities(vMatch[1]) : "";
  if (!vText && type !== "inlineStr") {
    if (type === "inlineStr") {
      const t = tagContents(inner, "t")[0];
      return t ? decodeXmlEntities(t) : "";
    }
    return "";
  }
  if (type === "s") {
    return sharedStrings[Number(vText)] ?? "";
  }
  if (type === "inlineStr") {
    const t = tagContents(inner, "t")[0];
    return t ? decodeXmlEntities(t) : vText;
  }
  return vText;
}

function parseSheetRows(xmlText, sharedStrings) {
  const rows = [];
  for (const row of elementBlocks(xmlText, "row")) {
    const cells = {};
    for (const cell of elementBlocks(row.inner, "c")) {
      const ref = attrValue(cell.open, "r") ?? "";
      const letter = colLetter(ref);
      if (letter) cells[letter] = cellText(cell, sharedStrings);
    }
    rows.push(cells);
  }
  return rows;
}

function sheetTags(workbookXml) {
  const paired = elementBlocks(workbookXml, "sheet");
  if (paired.length) return paired.map((s) => s.open);
  const re = /<(?:[a-zA-Z0-9]+:)?sheet([^>]*)\/>/g;
  const out = [];
  let m;
  while ((m = re.exec(workbookXml)) !== null) {
    out.push(`<sheet${m[1]}>`);
  }
  return out;
}

function relationshipOpenTags(relsXml) {
  const paired = elementBlocks(relsXml, "Relationship");
  if (paired.length) return paired.map((r) => r.open);
  const re = /<(?:[a-zA-Z0-9]+:)?Relationship([^>]*)\/>/g;
  const out = [];
  let m;
  while ((m = re.exec(relsXml)) !== null) {
    out.push(`<Relationship${m[1]}>`);
  }
  return out;
}

function sheetTargets(workbookXml, relsXml) {
  const ridToTarget = {};
  for (const openTag of relationshipOpenTags(relsXml)) {
    const id = attrValue(openTag, "Id");
    const target = attrValue(openTag, "Target");
    if (id && target) ridToTarget[id] = target;
  }
  const out = [];
  for (const openTag of sheetTags(workbookXml)) {
    const name = attrValue(openTag, "name") ?? "";
    const ridMatch =
      openTag.match(/r:id="([^"]+)"/) ??
      openTag.match(new RegExp(`${REL_NS_ID}:id="([^"]+)"`));
    const rid = ridMatch?.[1] ?? attrValue(openTag, "id");
    let target = ridToTarget[rid] ?? "";
    if (target && !target.startsWith("xl/")) {
      target = `xl/${target.replace(/^\//, "")}`;
    }
    out.push({ name, target });
  }
  return out;
}

/**
 * @param {Map<string, Uint8Array>} entries from unzipXlsx
 * @returns {Map<string, Array<Record<string, string>>>}
 */
export function readWorkbookSheets(entries) {
  const decode = (path) => {
    const data = entries.get(path);
    return data ? new TextDecoder().decode(data) : null;
  };

  const sharedPath = entries.has("xl/sharedStrings.xml") ? "xl/sharedStrings.xml" : null;
  const sharedStrings = sharedPath ? parseSharedStrings(decode(sharedPath)) : [];

  const workbookXml = decode("xl/workbook.xml");
  const relsXml = decode("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) {
    throw new Error("Not a valid XLSX workbook");
  }

  const sheets = new Map();
  for (const { name, target } of sheetTargets(workbookXml, relsXml)) {
    if (!target) continue;
    const xml = decode(target);
    if (!xml) continue;
    sheets.set(name, parseSheetRows(xml, sharedStrings));
  }
  return sheets;
}

/** Excel serial (1900 date system) → UTC Date. */
export function excelSerialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  const ms = (n - 25569) * 86400 * 1000;
  return new Date(ms);
}

export function parseNumber(text) {
  if (text == null || text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export { colLetter };
