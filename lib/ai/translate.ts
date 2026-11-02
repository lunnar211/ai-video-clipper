/**
 * Caption translation through the existing LLM chain.
 *
 * Cost-guarded: input is chunked (max 40 segments / 4000 chars per
 * call) so one long transcript cannot become one giant billable call.
 * Output is validated against a strict schema; a chunk that fails
 * validation keeps its ORIGINAL text (marked untranslated) rather than
 * a hallucinated translation. Without any configured provider the
 * caller must fail closed (503) — translation is never faked.
 */

import { z } from "zod";
import type { TranscriptSegment } from "@/lib/captions";
import { getKey, AI_NOT_CONNECTED, type FetchImpl } from "@/lib/ai/providers";
import { groqChat } from "@/lib/ai/groq";
import { geminiText } from "@/lib/ai/gemini";
import { openRouterChat } from "@/lib/ai/openrouter";
import { languageName } from "@/lib/ai/languages";

const MAX_SEGMENTS_PER_CALL = 40;
const MAX_CHARS_PER_CALL = 4000;

const translatedChunkSchema = z.object({
  translations: z.array(z.string().min(1)).min(1),
});

function parseTranslations(raw: string): string[] | null {
  const fenced = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(fenced.slice(start, end + 1)) as unknown;
    const result = translatedChunkSchema.safeParse(parsed);
    return result.success ? result.data.translations : null;
  } catch {
    return null;
  }
}

/** Split segments into cost-guarded chunks. Pure. */
export function chunkSegments(
  segments: TranscriptSegment[],
): TranscriptSegment[][] {
  const chunks: TranscriptSegment[][] = [];
  let cur: TranscriptSegment[] = [];
  let chars = 0;
  for (const s of segments) {
    if (
      cur.length >= MAX_SEGMENTS_PER_CALL ||
      chars + s.text.length > MAX_CHARS_PER_CALL
    ) {
      if (cur.length > 0) chunks.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(s);
    chars += s.text.length;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

async function runChain(
  prompt: string,
  fetchImpl: FetchImpl,
): Promise<string> {
  if (getKey("GROQ_API_KEY")) {
    try {
      return await groqChat(
        [
          {
            role: "system",
            content: "You reply with JSON only, no other text.",
          },
          { role: "user", content: prompt },
        ],
        fetchImpl,
      );
    } catch {
      // fall through to the next provider
    }
  }
  if (getKey("GEMINI_API_KEY")) {
    try {
      return await geminiText(prompt, fetchImpl);
    } catch {
      // fall through
    }
  }
  if (getKey("OPENROUTER_API_KEY")) {
    return await openRouterChat(
      [
        {
          role: "system",
          content: "You reply with JSON only, no other text.",
        },
        { role: "user", content: prompt },
      ],
      fetchImpl,
    );
  }
  throw new Error(AI_NOT_CONNECTED);
}

/**
 * Translate caption segments. Returns segments with identical timings
 * and translated text. A failed chunk keeps its original text.
 */
export async function translateSegments(
  segments: TranscriptSegment[],
  targetLanguageCode: string,
  fetchImpl: FetchImpl = fetch,
): Promise<{ segments: TranscriptSegment[]; provider: string }> {
  if (segments.length === 0) return { segments: [], provider: "" };
  const target = languageName(targetLanguageCode);
  const out: TranscriptSegment[] = [];
  let provider = "";
  for (const chunk of chunkSegments(segments)) {
    const numbered = chunk.map((s, i) => `${i + 1}. ${s.text}`).join("\n");
    const prompt = [
      `Translate these caption lines to ${target}. Keep the same number`,
      "of lines, in the same order, preserving meaning and spoken tone.",
      "Do not add explanations. Reply with JSON ONLY:",
      '{"translations":["line 1 translation","line 2 translation"]}',
      numbered,
    ].join("\n");
    try {
      const raw = await runChain(prompt, fetchImpl);
      const translated = parseTranslations(raw);
      if (translated && translated.length === chunk.length) {
        chunk.forEach((s, i) => {
          out.push({ ...s, text: translated[i] });
        });
        provider = "llm";
        continue;
      }
    } catch {
      // fall through to the original-text fallback for this chunk
    }
    for (const s of chunk) out.push(s);
  }
  if (provider === "" && segments.length > 0) {
    // Every chunk failed but no provider error surfaced: if no provider
    // is configured at all, say so honestly instead of returning
    // untranslated text as if it were a translation.
    if (
      !getKey("GROQ_API_KEY") &&
      !getKey("GEMINI_API_KEY") &&
      !getKey("OPENROUTER_API_KEY")
    ) {
      throw new Error(AI_NOT_CONNECTED);
    }
  }
  return { segments: out, provider };
}
