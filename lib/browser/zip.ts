/**
 * Stored (no-compression) ZIP writer — pure, dependency-free.
 *
 * Bulk download needs a zip, but adding a zip library for one button
 * is overkill and every byte here is testable. Stored entries are
 * valid ZIP; players and unzip tools read them fine. CRC-32 uses the
 * standard polynomial table.
 */

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntryInput = { name: string; data: Uint8Array };

/** Build a stored ZIP archive from entries. Names are sanitised. */
export function buildZip(entries: ZipEntryInput[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const push = (arr: Uint8Array[], b: Uint8Array) => {
    arr.push(b);
  };
  const u16 = (v: number) => {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v, true);
    return b;
  };
  const u32 = (v: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, true);
    return b;
  };
  const text = (s: string) => new TextEncoder().encode(s);

  for (const entry of entries) {
    const name = entry.name.replace(/[^a-zA-Z0-9._/-]/g, "_");
    const nameBytes = text(name);
    const crc = crc32(entry.data);
    const local: Uint8Array[] = [];
    push(local, u32(0x04034b50));
    push(local, u16(20));
    push(local, u16(0x0800)); // UTF-8 flag
    push(local, u16(0)); // stored
    push(local, u16(0));
    push(local, u16(0));
    push(local, u32(crc));
    push(local, u32(entry.data.length));
    push(local, u32(entry.data.length));
    push(local, u16(nameBytes.length));
    push(local, u16(0));
    push(local, nameBytes);
    push(local, entry.data);
    const localOffset = offset;
    for (const part of local) {
      chunks.push(part);
      offset += part.length;
    }
    const c: Uint8Array[] = [];
    push(c, u32(0x02014b50));
    push(c, u16(20));
    push(c, u16(20));
    push(c, u16(0x0800));
    push(c, u16(0));
    push(c, u16(0));
    push(c, u16(0));
    push(c, u32(crc));
    push(c, u32(entry.data.length));
    push(c, u32(entry.data.length));
    push(c, u16(nameBytes.length));
    push(c, u16(0));
    push(c, u16(0));
    push(c, u16(0));
    push(c, u16(0));
    push(c, u32(0));
    push(c, u32(localOffset));
    push(c, nameBytes);
    for (const part of c) central.push(part);
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const part of central) {
    chunks.push(part);
    centralSize += part.length;
  }
  const end: Uint8Array[] = [];
  push(end, u32(0x06054b50));
  push(end, u16(0));
  push(end, u16(0));
  push(end, u16(entries.length));
  push(end, u16(entries.length));
  push(end, u32(centralSize));
  push(end, u32(centralStart));
  push(end, u16(0));
  for (const part of end) chunks.push(part);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of chunks) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
