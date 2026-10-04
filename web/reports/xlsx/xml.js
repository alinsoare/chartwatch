/** Minimal XML helpers (browser + Node, no DOMParser dependency). */

export function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function tagContents(xml, tagName) {
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9]+:)?${tagName}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

export function attrValue(openTag, name) {
  const re = new RegExp(`(?:^|[\\s/])${name}="([^"]*)"`);
  const m = openTag.match(re);
  return m ? decodeXmlEntities(m[1]) : null;
}

export function selfClosingTags(xml, tagName) {
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tagName}([^/>]*)/>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[0]);
  }
  return out;
}

export function elementBlocks(xml, tagName) {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${tagName}([^>]*)>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9]+:)?${tagName}>`,
    "g",
  );
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push({ attrs: m[1], inner: m[2], open: m[0].slice(0, m[0].indexOf(">") + 1) });
  }
  return out;
}
