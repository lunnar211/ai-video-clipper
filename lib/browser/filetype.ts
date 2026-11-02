/**
 * File-type sniffing for uploads (magic bytes, not extensions).
 *
 * Returns "video" when the header matches a known video container,
 * "not-video" when bytes are readable and match nothing video-like,
 * and "unknown" when the file cannot be read (caller allows it — the
 * browser's own decoder is the final gate). Extensions and MIME types
 * are user-controlled and are never trusted alone.
 */

export type SniffResult = "video" | "not-video" | "unknown";

function isMp4(bytes: Uint8Array): boolean {
  // "ftyp" at offset 4 (MP4, MOV, M4V).
  return (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

function isWebm(bytes: Uint8Array): boolean {
  // EBML header 1A 45 DF A3.
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  );
}

function isAvi(bytes: Uint8Array): boolean {
  // "RIFF" .... "AVI ".
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x41 &&
    bytes[9] === 0x56 &&
    bytes[10] === 0x49 &&
    bytes[11] === 0x20
  );
}

/** Pure check over a header slice (testable without a File). */
export function sniffHeader(bytes: Uint8Array): SniffResult {
  if (bytes.length < 4) return "unknown";
  if (isMp4(bytes) || isWebm(bytes) || isAvi(bytes)) return "video";
  return "not-video";
}

export async function sniffVideoFile(file: File): Promise<SniffResult> {
  try {
    const slice = file.slice(0, 12);
    const buf = await slice.arrayBuffer();
    return sniffHeader(new Uint8Array(buf));
  } catch {
    return "unknown";
  }
}
