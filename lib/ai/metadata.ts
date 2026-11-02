import { z } from "zod";
import type { TranscriptSegment } from "@/lib/captions";
import { getKey, type FetchImpl } from "@/lib/ai/providers";
import { groqChat } from "@/lib/ai/groq";
import { geminiText } from "@/lib/ai/gemini";
import { openRouterChat } from "@/lib/ai/openrouter";

/**
 * Viral metadata for one clip. The model is asked for strict JSON and
 * the output is validated against this schema — never trusted raw.
 * Scores are the model's opinion, not a promise of views; the UI says
 * so. When no AI is connected (or every provider fails validation),
 * the template fallback below is returned instead, labelled
 * source: "template" — its scores are neutral 50s, never presented
 * as AI output.
 */

export const titleOptionSchema = z.object({
  text: z.string().min(1).max(100),
  hookScore: z.number().int().min(0).max(100),
  reason: z.string().min(1).max(200),
});

export const platformDescriptionSchema = z.object({
  text: z.string().min(1).max(5000),
  tone: z.string().min(1).max(80),
  hashtags: z.array(z.string().min(1).max(40)).max(20),
});

export const viralitySchema = z.object({
  score: z.number().int().min(0).max(100),
  subscores: z.object({
    hook: z.number().int().min(0).max(100),
    emotion: z.number().int().min(0).max(100),
    pacing: z.number().int().min(0).max(100),
    ending: z.number().int().min(0).max(100),
  }),
});

export const clipMetadataSchema = z.object({
  titles: z.array(titleOptionSchema).length(5),
  hookLine: z.string().min(1).max(200),
  descriptions: z.object({
    tiktok: platformDescriptionSchema,
    youtubeShorts: platformDescriptionSchema,
    instagramReels: platformDescriptionSchema,
  }),
  tags: z.object({
    broad: z.array(z.string().min(1).max(40)).min(3).max(8),
    niche: z.array(z.string().min(1).max(40)).min(3).max(8),
  }),
  pinnedComment: z.string().min(1).max(500),
  cta: z.string().min(1).max(200),
  virality: viralitySchema,
});

export type ClipMetadata = z.infer<typeof clipMetadataSchema>;
export type MetadataSource = "ai" | "template";

export type ClipRef = {
  start: number;
  end: number;
  title: string;
};

/** Parse + validate raw model output. Returns null on any failure. */
export function parseMetadata(raw: string): ClipMetadata | null {
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
  const result = clipMetadataSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

function clipTranscript(
  transcript: TranscriptSegment[],
  clip: ClipRef,
): TranscriptSegment[] {
  return transcript.filter((s) => s.end > clip.start && s.start < clip.end);
}

function buildPrompt(
  transcript: TranscriptSegment[],
  clip: ClipRef,
): string {
  const lines = clipTranscript(transcript, clip)
    .slice(0, 200)
    .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join("\n");
  return [
    "You write viral short-form metadata for one video clip.",
    `Clip title (working title): ${clip.title}`,
    `Clip length: ${(clip.end - clip.start).toFixed(0)} seconds.`,
    "Reply with JSON ONLY, no other text, matching this shape exactly:",
    JSON.stringify({
      titles: [
        { text: "Title option", hookScore: 82, reason: "One-line reason" },
      ],
      hookLine: "Line spoken or shown in the first 3 seconds",
      descriptions: {
        tiktok: {
          text: "Short punchy caption, under 150 characters",
          tone: "punchy",
          hashtags: ["#a", "#b", "#c", "#d"],
        },
        youtubeShorts: {
          text: "Searchable description, under 300 characters",
          tone: "searchable",
          hashtags: ["#a", "#b", "#c"],
        },
        instagramReels: {
          text: "Longer storytelling caption, under 400 characters",
          tone: "storytelling",
          hashtags: ["#a", "#b", "#c", "#d", "#e", "#f", "#g", "#h"],
        },
      },
      tags: { broad: ["#shorts"], niche: ["#topic"] },
      pinnedComment: "A question that invites comments",
      cta: "Follow for more",
      virality: {
        score: 70,
        subscores: { hook: 80, emotion: 65, pacing: 70, ending: 60 },
      },
    }),
    "Rules:",
    "- titles: EXACTLY 5 options, each with hookScore 0-100 and a one-line reason.",
    "- descriptions must differ per platform: TikTok short + punchy with 3-5 hashtags,",
    "  YouTube Shorts searchable with up to 3 hashtags, Instagram Reels longer +",
    "  storytelling with 8-12 hashtags.",
    "- tags: 3-8 broad tags and 3-8 niche tags, 10-15 total.",
    "- virality score and sub-scores (hook, emotion, pacing, ending) are 0-100.",
    "- Scores are estimates, never a promise of views.",
    "Clip transcript:",
    lines || "(no transcript — use the working title only)",
  ].join("\n");
}

const STOPWORDS = new Set([
  "the", "and", "that", "this", "with", "from", "have", "been", "were",
  "are", "was", "for", "you", "your", "but", "not", "all", "can", "had",
  "her", "his", "one", "our", "out", "has", "have", "will", "would",
  "there", "their", "what", "when", "which", "who", "how", "about",
  "into", "than", "them", "then", "she", "him", "its", "also", "more",
]);

function topWords(transcript: TranscriptSegment[], count: number): string[] {
  const freq = new Map<string, number>();
  for (const seg of transcript) {
    for (const raw of seg.text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length < 4 || STOPWORDS.has(raw)) continue;
      freq.set(raw, (freq.get(raw) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([w]) => `#${w}`);
}

function cleanTag(tag: string): string {
  return tag.startsWith("#") ? tag : `#${tag}`;
}

/**
 * Honest template fallback, derived from the clip title + transcript
 * words only. Scores are neutral 50s and the caller labels the result
 * as a template — they are NOT AI scores and NOT a virality promise.
 */
export function buildTemplateMetadata(
  transcript: TranscriptSegment[],
  clip: ClipRef,
): ClipMetadata {
  const title = clip.title.trim() || "Untitled clip";
  const inClip = clipTranscript(transcript, clip);
  const firstLine =
    inClip[0]?.text.trim() ||
    transcript[0]?.text.trim() ||
    title;
  const hookLine = firstLine.slice(0, 200);
  const niche = topWords(inClip.length > 0 ? inClip : transcript, 7);
  while (niche.length < 5) niche.push(`#clip${niche.length + 1}`);
  const broad = ["#shorts", "#viral", "#fyp", "#video", "#trending"];
  const templateReason = "Template estimate — not an AI score.";
  return {
    titles: [
      { text: title.slice(0, 100), hookScore: 50, reason: templateReason },
      {
        text: `Watch this: ${title}`.slice(0, 100),
        hookScore: 50,
        reason: templateReason,
      },
      {
        text: `${title} — explained`.slice(0, 100),
        hookScore: 50,
        reason: templateReason,
      },
      {
        text: `Why ${title}`.slice(0, 100),
        hookScore: 50,
        reason: templateReason,
      },
      {
        text: `The truth about ${title}`.slice(0, 100),
        hookScore: 50,
        reason: templateReason,
      },
    ],
    hookLine,
    descriptions: {
      tiktok: {
        text: `${title} 👀`.slice(0, 150),
        tone: "punchy",
        hashtags: ["#fyp", "#viral", "#shorts", "#trending"],
      },
      youtubeShorts: {
        text: `${title}. ${hookLine}`.slice(0, 300),
        tone: "searchable",
        hashtags: ["#shorts", "#viral", "#video"],
      },
      instagramReels: {
        text: `${title}. ${hookLine} Watch until the end and tell us what you think.`.slice(
          0,
          400,
        ),
        tone: "storytelling",
        hashtags: [
          "#reels",
          "#viral",
          "#shorts",
          "#fyp",
          "#trending",
          "#video",
          "#explore",
          "#content",
        ],
      },
    },
    tags: {
      broad,
      niche: niche.slice(0, 8).map(cleanTag),
    },
    pinnedComment: "What do you think? Tell us in the comments.",
    cta: "Follow for more clips like this.",
    virality: {
      score: 50,
      subscores: { hook: 50, emotion: 50, pacing: 50, ending: 50 },
    },
  };
}

/**
 * Metadata chain: Groq -> Gemini -> OpenRouter (same chain as
 * highlights). Per provider, a validation failure is retried once;
 * a provider error moves to the next provider. No configured provider,
 * or every provider failing, returns the honestly-labelled template
 * fallback — never an error, never a fake AI result.
 */
export async function generateMetadata(
  transcript: TranscriptSegment[],
  clip: ClipRef,
  fetchImpl: FetchImpl = fetch,
): Promise<{
  metadata: ClipMetadata;
  source: MetadataSource;
  provider: string | null;
}> {
  const prompt = buildPrompt(transcript, clip);
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
          4000,
        ),
    });
  }
  if (getKey("GEMINI_API_KEY")) {
    attempts.push({ name: "gemini", run: () => geminiText(prompt, fetchImpl, 4000) });
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
          4000,
        ),
    });
  }
  for (const attempt of attempts) {
    for (let tries = 0; tries < 2; tries++) {
      try {
        const raw = await attempt.run();
        const parsed = parseMetadata(raw);
        if (parsed) {
          return { metadata: parsed, source: "ai", provider: attempt.name };
        }
        // Validation failed: retry once with the same provider.
      } catch {
        break; // Provider error: move to the next provider.
      }
    }
  }
  return {
    metadata: buildTemplateMetadata(transcript, clip),
    source: "template",
    provider: null,
  };
}
