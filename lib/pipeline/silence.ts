/**
 * Silence detection from audio energy (pure functions, testable).
 *
 * The browser decodes audio to samples; this module turns those samples
 * into silent ranges, then into the non-silent segments a clip can be
 * cut into. It never rewrites audio: "cut silences" in the editor splits
 * a clip into its non-silent parts, which the user renders one by one.
 * Render-time silence compression (seamless re-timing) is a v2 item for
 * the server ffmpeg worker — the browser renderer plays one continuous
 * range and cannot re-time mid-render.
 */

export type TimeRange = { start: number; end: number };

/** RMS energy per window of `windowSec` seconds. Pure. */
export function rmsWindows(
  samples: Float32Array,
  sampleRate: number,
  windowSec = 0.5,
): number[] {
  const perWindow = Math.max(1, Math.floor(sampleRate * windowSec));
  const out: number[] = [];
  for (let i = 0; i < samples.length; i += perWindow) {
    const end = Math.min(samples.length, i + perWindow);
    let sum = 0;
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    out.push(Math.sqrt(sum / Math.max(1, end - i)));
  }
  return out;
}

/**
 * Merge consecutive windows below `threshold` into silent ranges.
 * Ranges shorter than `minSilenceSec` are dropped (breaths, gaps
 * between words). Adjacent ranges closer than `mergeGapSec` are joined.
 */
export function findSilentRanges(
  rms: number[],
  windowSec = 0.5,
  threshold = 0.01,
  minSilenceSec = 1,
  mergeGapSec = 0.5,
): TimeRange[] {
  const raw: TimeRange[] = [];
  let open: number | null = null;
  for (let i = 0; i < rms.length; i++) {
    const silent = (rms[i] ?? 1) < threshold;
    if (silent && open === null) open = i;
    if (!silent && open !== null) {
      raw.push({ start: open * windowSec, end: i * windowSec });
      open = null;
    }
  }
  if (open !== null) {
    raw.push({ start: open * windowSec, end: rms.length * windowSec });
  }
  const kept = raw.filter((r) => r.end - r.start >= minSilenceSec);
  const merged: TimeRange[] = [];
  for (const r of kept) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end <= mergeGapSec) last.end = r.end;
    else merged.push({ ...r });
  }
  return merged;
}

/** Complement of `silent` inside [clipStart, clipEnd]: the speakable parts. */
export function nonSilentSegments(
  clipStart: number,
  clipEnd: number,
  silent: TimeRange[],
  minPartSec = 2,
): TimeRange[] {
  const parts: TimeRange[] = [];
  let cursor = clipStart;
  const sorted = [...silent].sort((a, b) => a.start - b.start);
  for (const s of sorted) {
    const from = Math.max(s.start, clipStart);
    const to = Math.min(s.end, clipEnd);
    if (to <= from) continue;
    if (from > cursor) parts.push({ start: cursor, end: from });
    cursor = Math.max(cursor, to);
  }
  if (clipEnd > cursor) parts.push({ start: cursor, end: clipEnd });
  return parts.filter((p) => p.end - p.start >= minPartSec);
}
