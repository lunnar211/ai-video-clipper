export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** Seconds -> SRT timestamp `HH:MM:SS,mmm`. */
export function formatSrtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/**
 * Segments clipped to [clipStart, clipEnd] and shifted so the clip starts
 * at 0. Segments fully outside the clip are dropped.
 */
export function segmentsToSrt(
  segments: TranscriptSegment[],
  clipStart: number,
  clipEnd: number,
): string {
  const lines: string[] = [];
  let index = 1;
  for (const seg of segments) {
    const start = Math.max(seg.start, clipStart);
    const end = Math.min(seg.end, clipEnd);
    if (end <= start) continue;
    const text = seg.text.trim();
    if (!text) continue;
    lines.push(
      `${index}\n${formatSrtTime(start - clipStart)} --> ${formatSrtTime(end - clipStart)}\n${text}\n`,
    );
    index += 1;
  }
  return lines.join("\n");
}

/** Caption text active at time `t` (seconds), or null. */
export function segmentAtTime(
  segments: TranscriptSegment[],
  t: number,
): string | null {
  for (const seg of segments) {
    if (t >= seg.start && t < seg.end) return seg.text.trim();
  }
  return null;
}
