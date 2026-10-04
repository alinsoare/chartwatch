/**
 * Minimal ZIP reader for .xlsx (central directory + raw deflate).
 */

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

function readUint16(view, offset) {
  return view.getUint16(offset, true);
}

function readUint32(view, offset) {
  return view.getUint32(offset, true);
}

function findEocdOffset(view, length) {
  const minStart = Math.max(0, length - 65557);
  for (let i = length - 22; i >= minStart; i -= 1) {
    if (readUint32(view, i) === SIG_EOCD) return i;
  }
  throw new Error("ZIP end-of-central-directory not found");
}

export async function inflateRaw(compressed) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream is not available");
  }
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([compressed]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<Map<string, Uint8Array>>}
 */
export async function unzipXlsx(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const length = buffer.byteLength;
  const eocd = findEocdOffset(view, length);
  const cdSize = readUint32(view, eocd + 12);
  const cdOffset = readUint32(view, eocd + 16);
  const entries = new Map();

  let pos = cdOffset;
  const cdEnd = cdOffset + cdSize;
  while (pos + 46 <= cdEnd) {
    if (readUint32(view, pos) !== SIG_CEN) break;
    const compMethod = readUint16(view, pos + 10);
    const compSize = readUint32(view, pos + 20);
    const uncompSize = readUint32(view, pos + 24);
    const nameLen = readUint16(view, pos + 28);
    const extraLen = readUint16(view, pos + 30);
    const commentLen = readUint16(view, pos + 32);
    const localOffset = readUint32(view, pos + 42);
    const nameStart = pos + 46;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen));
    pos = nameStart + nameLen + extraLen + commentLen;

    const lh = localOffset;
    if (readUint32(view, lh) !== SIG_LOC) {
      throw new Error(`Bad local header for ${name}`);
    }
    const lhNameLen = readUint16(view, lh + 26);
    const lhExtraLen = readUint16(view, lh + 28);
    const dataStart = lh + 30 + lhNameLen + lhExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + compSize);
    let payload;
    if (compMethod === 0) {
      payload = compressed.slice();
    } else if (compMethod === 8) {
      payload = await inflateRaw(compressed);
    } else {
      throw new Error(`Unsupported compression method ${compMethod} in ${name}`);
    }
    if (uncompSize && payload.length !== uncompSize) {
      throw new Error(`Size mismatch inflating ${name}`);
    }
    entries.set(name.replace(/\\/g, "/"), payload);
  }
  return entries;
}
