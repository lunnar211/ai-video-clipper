import { z } from "zod";
import type { TranscriptSegment } from "@/lib/captions";
import { getKey, AI_NOT_CONNECTED, type FetchImpl } from "@/lib/ai/providers";
import { groqChat } from "@/lib/ai/groq";
import { geminiText } from "@/lib/ai/gemini";
import { openRouterChat } from "@/lib/ai/openrouter";
import { checkTextSafety } from "@/lib/ai/nvidia";

export type Moment = {
  start: number;
  end: number;
  title: string;
  hashtags: string[];
};

const momentSchema = z.object({
  start: z.number().finite().min(0),
  end: z.number().finite().positive(),
  title: z.string().min(1).max(120),
  hashtags: z.array(z.string().min(1).max(40)).max(10).default([]),
});

const momentsSchema = z.object({
  moments: z.array(momentSchema).max(10),
});

/**
 * Parse + validate raw model output. The model is asked for JSON, but
 * output is never trusted: fenced code blocks are stripped, unknown
 * fields dropped, and moments are clamped to the video.
 *
 * Rules (the default 15–60 s window): moments longer than `maxLen`
 * are cut to it; moments shorter than `minLen` are dropped; overlaps
 * are resolved by keeping the earliest; everything is sorted by start.
 * Length targets (ClipForge Phase 1) pass their own window — e.g. a
 * 30 s target keeps [15, 30] — while the default stays 15–60 s exactly
 * as before, so existing callers are unaffected.
 */
export function parseMoments(
  raw: string,
  duration: number,
  opts: { minLen?: number; maxLen?: number; maxClips?: number } = {},
): Moment[] {
  const minLen = opts.minLen ?? 15;
  const maxLen = opts.maxLen ?? 60;
  const maxClips = opts.maxClips ?? 5;
  const fenced = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenced.slice(start, end + 1)) as unknown;
  } catch {
    return [];
  }
  const result = momentsSchema.safeParse(parsed);
  if (!result.success) return [];
  const kept: Moment[] = [];
  const sorted = [...result.data.moments].sort((a, b) => a.start - b.start);
  for (const m of sorted) {
    if (m.start >= duration) continue;
    let endTime = Math.min(m.end, duration);
    if (endTime - m.start > maxLen) endTime = m.start + maxLen;
    if (endTime - m.start < minLen) continue;
    if (kept.length > 0 && m.start < kept[kept.length - 1].end) continue;
    kept.push({
      start: m.start,
      end: endTime,
      title: m.title.trim(),
      hashtags: m.hashtags.map((h) =>
        h.startsWith("#") ? h : `#${h}`,
      ),
    });
    if (kept.length >= maxClips) break;
  }
  return kept;
}

function buildPrompt(
  transcript: TranscriptSegment[],
  duration: number,
  maxClips: number,
): string {
  const lines = transcript
    .slice(0, 600)
    .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join("\n");
  return [
    "You pick the best short-form video moments from this transcript.",
    `The video is ${duration.toFixed(0)} seconds long.`,
    `Pick up to ${maxClips} moments, each 30 to 60 seconds long, that work`,
    "as standalone vertical clips: a strong hook in the first seconds,",
    "one complete idea, and a satisfying ending. Prefer moments with",
    "clear speech over silence or filler.",
    "Reply with JSON ONLY, no other text:",
    '{"moments":[{"start":12.5,"end":58.0,"title":"Short clip title","hashtags":["#topic"]}]}',
    "Transcript:",
    lines,
  ].join("\n");
}

/**
 * Highlight chain: Groq text -> Gemini text -> OpenRouter free text.
 * Each step is skipped when its key is absent; a provider error falls
 * through to the next. Throws AI_NOT_CONNECTED when no provider is
 * configured, and an Error when every configured provider fails.
 * Flagged titles (NVIDIA safety, when configured) are neutralised.
 */
export async function pickHighlights(
  transcript: TranscriptSegment[],
  duration: number,
  maxClips = 5,
  fetchImpl: FetchImpl = fetch,
  opts: { targetSeconds?: number } = {},
): Promise<{ moments: Moment[]; provider: string }> {
  const prompt = buildPrompt(transcript, duration, maxClips);
  const attempts: Array<{ name: string; run: () => Promise<string> }> = [];
  if (getKey("GROQ_API_KEY")) {
    attempts.push({
      name: "groq",
      run: () =>
        groqChat(
          [
            {
              role: "system",
              content: "You reply with JSON only, no other text.",
            },
            { role: "user", content: prompt },
          ],
          fetchImpl,
        ),
    });
  }
  if (getKey("GEMINI_API_KEY")) {
    attempts.push({
      name: "gemini",
      run: () => geminiText(prompt, fetchImpl),
    });
  }
  if (getKey("OPENROUTER_API_KEY")) {
    attempts.push({
      name: "openrouter",
      run: () =>
        openRouterChat(
          [
            {
              role: "system",
              content: "You reply with JSON only, no other text.",
            },
            { role: "user", content: prompt },
          ],
          fetchImpl,
        ),
    });
  }
  if (attempts.length === 0) throw new Error(AI_NOT_CONNECTED);
  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      const raw = await attempt.run();
      const moments = parseMoments(
        raw,
        duration,
        opts.targetSeconds
          ? {
              minLen: Math.max(10, opts.targetSeconds - 15),
              maxLen: opts.targetSeconds,
              maxClips,
            }
          : { maxClips },
      );
      if (moments.length > 0) {
        const safe = await Promise.all(
          moments.map(async (m) => {
            const check = await checkTextSafety(
              `${m.title} ${m.hashtags.join(" ")}`,
              fetchImpl,
            );
            return check.flagged
              ? { ...m, title: "Highlight clip", hashtags: [] }
              : m;
          }),
        );
        return { moments: safe, provider: attempt.name };
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("provider failed");
    }
  }
  throw lastError ?? new Error("No highlights could be produced");
}
