import { z } from "zod";
import { getKey, AI_NOT_CONNECTED, type FetchImpl } from "@/lib/ai/providers";
import { groqChat } from "@/lib/ai/groq";
import { geminiText } from "@/lib/ai/gemini";
import { openRouterChat } from "@/lib/ai/openrouter";
import { checkTextSafety } from "@/lib/ai/nvidia";

/**
 * AI short-script generation (ClipForge Phase 17).
 *
 * A topic (or the user's own custom script) becomes a short-form
 * script: a title, hashtags, and 1–6 segments, each with caption
 * text and a concrete visual keyword for stock-footage search
 * ("ocean waves", not "freedom"). The AI path mirrors the
 * highlight chain (Groq → Gemini → OpenRouter, skip absent keys,
 * AI_NOT_CONNECTED when none). Model output is never trusted:
 * fenced blocks are stripped, unknown fields dropped, segments
 * validated by zod and clamped. Flagged segments (NVIDIA safety,
 * when configured) are dropped, never silently kept.
 */

export type ScriptSegment = {
  text: string;
  visualKeyword: string;
};

export type GeneratedScript = {
  title: string;
  hashtags: string[];
  segments: ScriptSegment[];
};

const segmentSchema = z.object({
  text: z.string().min(1).max(280),
  visualKeyword: z.string().min(1).max(80),
});

const scriptSchema = z.object({
  title: z.string().min(1).max(120),
  hashtags: z.array(z.string().min(1).max(40)).max(10).default([]),
  segments: z.array(segmentSchema).min(1).max(6),
});

/**
 * Parse + validate raw model output. Returns null when the output
 * is not usable JSON or fails validation — the caller turns that
 * into a 502, never a fake script.
 */
export function parseScript(raw: string): GeneratedScript | null {
  const fenced = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenced.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
  const result = scriptSchema.safeParse(parsed);
  if (!result.success) return null;
  return {
    title: result.data.title.trim(),
    hashtags: result.data.hashtags.map((h) =>
      h.startsWith("#") ? h : `#${h}`,
    ),
    segments: result.data.segments.map((s) => ({
      text: s.text.trim(),
      visualKeyword: s.visualKeyword.trim(),
    })),
  };
}

/**
 * Split a user-supplied custom script into segments without any AI
 * call. Sentences (or lines, when the user wrote lines) become
 * segments, capped at 6; each segment's visual keyword is its own
 * first few content words, so the user can edit it before searching.
 * Returns null when nothing usable remains.
 */
export function splitCustomScript(raw: string): GeneratedScript | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  // Prefer line breaks when the user wrote a line-per-beat script;
  // otherwise split on sentence ends.
  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const parts =
    lines.length > 1
      ? lines
      : cleaned
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
  const segments: ScriptSegment[] = [];
  for (const part of parts) {
    const text = part.slice(0, 280).trim();
    if (!text) continue;
    const words = text
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4);
    segments.push({
      text,
      visualKeyword: words.join(" ") || "video",
    });
    if (segments.length >= 6) break;
  }
  if (segments.length === 0) return null;
  return {
    title: segments[0].text.slice(0, 120),
    hashtags: [],
    segments,
  };
}

function buildPrompt(topic: string, segmentCount: number): string {
  return [
    "You write short-form vertical video scripts.",
    `Topic: ${topic}`,
    `Write a script of exactly ${segmentCount} segments. Each segment`,
    "is one or two spoken sentences (under 280 characters) that work",
    "as a burned-in caption, plus a concrete visual keyword for",
    "stock-footage search: a visible scene or object (for example",
    '"ocean waves", "city traffic at night"), never an abstract',
    "idea. The first segment must hook in the first seconds; the",
    "last must land a satisfying ending. Keep it factual and",
    "general — never invent a person, quote, statistic, or event.",
    "Reply with JSON ONLY, no other text:",
    '{"title":"Short title","hashtags":["#topic"],"segments":[{"text":"Spoken line.","visualKeyword":"ocean waves"}]}',
  ].join("\n");
}

/**
 * Generate a script for a topic via Groq → Gemini → OpenRouter.
 * Throws AI_NOT_CONNECTED when no provider is configured, and an
 * Error when every configured provider fails or returns unusable
 * output. Flagged segments are dropped; when none survive, an
 * Error is thrown (the caller turns it into a 502).
 */
export async function generateScript(
  topic: string,
  segmentCount: number,
  fetchImpl: FetchImpl = fetch,
): Promise<{ script: GeneratedScript; provider: string }> {
  const prompt = buildPrompt(topic, segmentCount);
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
      const parsed = parseScript(raw);
      if (!parsed) continue;
      const kept: ScriptSegment[] = [];
      for (const segment of parsed.segments) {
        const check = await checkTextSafety(segment.text, fetchImpl);
        if (!check.flagged) kept.push(segment);
      }
      if (kept.length > 0) {
        return {
          script: { ...parsed, segments: kept },
          provider: attempt.name,
        };
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("provider failed");
    }
  }
  throw lastError ?? new Error("No script could be produced");
}
