import { NextResponse } from "next/server";
import { z } from "zod";
import {
  keywordSearch,
  hitsToWindows,
} from "@/lib/pipeline/search";
import { getKey, AI_NOT_CONNECTED } from "@/lib/ai/providers";
import { groqChat } from "@/lib/ai/groq";
import { geminiText } from "@/lib/ai/gemini";
import { openRouterChat } from "@/lib/ai/openrouter";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  transcript: z
    .array(
      z.object({
        start: z.number().finite().min(0),
        end: z.number().finite().positive(),
        text: z.string().min(1).max(1000),
      }),
    )
    .min(1)
    .max(2000),
  query: z.string().min(3).max(300),
  duration: z.number().finite().positive().max(14400),
});

/**
 * Prompt-based clip search: keyword hits over the transcript first
 * (always available), then an LLM rerank of the top windows when a
 * provider is configured. Without AI, keyword windows are returned
 * with source "keyword" — never dressed up as AI results.
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid search request." }, { status: 400 });
  }
  const { transcript, query, duration } = parsed.data;
  const hits = keywordSearch(transcript, query);
  const windows = hitsToWindows(hits, duration);
  if (windows.length === 0) {
    return NextResponse.json({ windows: [], source: "keyword" });
  }
  const hasAi =
    getKey("GROQ_API_KEY") || getKey("GEMINI_API_KEY") || getKey("OPENROUTER_API_KEY");
  if (!hasAi) {
    return NextResponse.json({ windows, source: "keyword" });
  }
  const prompt = [
    `Rank these clip windows for the query "${query}". Reply with JSON ONLY:`,
    '{"order":[0,2,1]} (indexes into the windows list, best first)',
    windows
      .map((w, i) => `${i}. [${w.start.toFixed(1)}-${w.end.toFixed(1)}] ${w.title}`)
      .join("\n"),
  ].join("\n");
  try {
    let raw = "";
    if (getKey("GROQ_API_KEY")) {
      raw = await groqChat(
        [
          {
            role: "system",
            content: "You reply with JSON only, no other text.",
          },
          { role: "user", content: prompt },
        ],
      );
    } else if (getKey("GEMINI_API_KEY")) {
      raw = await geminiText(prompt);
    } else if (getKey("OPENROUTER_API_KEY")) {
      raw = await openRouterChat([
        {
          role: "system",
          content: "You reply with JSON only, no other text.",
        },
        { role: "user", content: prompt },
      ]);
    }
    const fenced = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start !== -1 && end > start) {
      const data = JSON.parse(fenced.slice(start, end + 1)) as {
        order?: number[];
      };
      const order = (data.order ?? []).filter(
        (i) => Number.isInteger(i) && i >= 0 && i < windows.length,
      );
      if (order.length > 0) {
        const ranked = order.map((i) => windows[i]);
        for (const w of windows) {
          if (!ranked.includes(w)) ranked.push(w);
        }
        return NextResponse.json({ windows: ranked, source: "llm" });
      }
    }
  } catch {
    // Rerank failure falls back to keyword order — never an error.
    void AI_NOT_CONNECTED;
  }
  return NextResponse.json({ windows, source: "keyword" });
}
