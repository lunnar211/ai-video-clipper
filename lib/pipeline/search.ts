import type { TranscriptSegment } from "@/lib/captions";

/**
 * Prompt-based clip search + clip length targets (pure core).
 *
 * Search is two-stage: cheap keyword matching over transcript segments
 * first (always available, no AI), then an LLM rerank in the route when
 * a provider is configured. Length targets clamp moment selection:
 * a target T keeps moments in [max(10, T-15), T] seconds; the default
 * (no target) preserves the existing 15–60 s rule exactly.
 */

export type LengthTarget = {
  /** Label shown in the UI, e.g. "30s". */
  label: string;
  /** Target length in seconds. */
  seconds: number;
};

export const LENGTH_TARGETS: LengthTarget[] = [
  { label: "15s", seconds: 15 },
  { label: "30s", seconds: 30 },
  { label: "60s", seconds: 60 },
];

export type MomentLike = { start: number; end: number; title: string };

/** Length window enforced for a target (null = existing default rule). */
export function lengthWindow(
  targetSeconds: number | null,
): { minLen: number; maxLen: number } {
  if (targetSeconds === null) return { minLen: 15, maxLen: 60 };
  return {
    minLen: Math.max(10, targetSeconds - 15),
    maxLen: targetSeconds,
  };
}

/** Score one segment against query terms (title-case-insensitive). */
function segmentScore(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (t && lower.includes(t)) score += 1;
  }
  return score;
}

/**
 * Keyword search over transcript segments. Returns matching segments
 * with a match count, best first. An empty query returns [].
 */
export function keywordSearch(
  transcript: TranscriptSegment[],
  query: string,
): Array<{ segment: TranscriptSegment; matches: number }> {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  if (terms.length === 0) return [];
  return transcript
    .map((segment) => ({
      segment,
      matches: segmentScore(segment.text, terms),
    }))
    .filter((r) => r.matches > 0)
    .sort((a, b) => b.matches - a.matches || a.segment.start - b.segment.start);
}

/**
 * Group keyword hits into clip windows: hits within `gapSec` of each
 * other merge into one window, extended to at least `minLen` seconds
 * and capped at `maxLen`, then clamped to the video duration.
 */
export function hitsToWindows(
  hits: Array<{ segment: TranscriptSegment; matches: number }>,
  duration: number,
  gapSec = 8,
  minLen = 15,
  maxLen = 60,
): MomentLike[] {
  const windows: MomentLike[] = [];
  let cur: { start: number; end: number; hits: number } | null = null;
  const flush = () => {
    if (!cur) return;
    let { start, end } = cur;
    if (end - start < minLen) {
      const mid = (start + end) / 2;
      start = Math.max(0, mid - minLen / 2);
      end = Math.min(duration, start + minLen);
      start = Math.max(0, end - minLen);
    }
    if (end - start > maxLen) end = start + maxLen;
    if (end - start >= 10) {
      windows.push({
        start,
        end,
        title: `Clip about the searched topic (${cur.hits} matches)`,
      });
    }
    cur = null;
  };
  for (const h of hits) {
    const s = h.segment;
    if (!cur) {
      cur = { start: s.start, end: s.end, hits: h.matches };
    } else if (s.start - cur.end <= gapSec) {
      cur.end = Math.max(cur.end, s.end);
      cur.hits += h.matches;
    } else {
      flush();
      cur = { start: s.start, end: s.end, hits: h.matches };
    }
  }
  flush();
  return windows.slice(0, 5);
}
