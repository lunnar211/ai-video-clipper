import { NextResponse } from "next/server";
import { z } from "zod";
import { pickHighlights } from "@/lib/ai/highlights";
import { AI_NOT_CONNECTED } from "@/lib/ai/providers";
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
  duration: z.number().finite().positive().max(3600),
  maxClips: z.number().int().min(1).max(10).optional(),
  /** ClipForge length target in seconds (15–180); default keeps 15–60 s. */
  targetSeconds: z.number().int().min(15).max(180).optional(),
});

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
    return NextResponse.json(
      { error: "Invalid transcript or duration." },
      { status: 400 },
    );
  }
  try {
    const { moments, provider } = await pickHighlights(
      parsed.data.transcript,
      parsed.data.duration,
      parsed.data.maxClips ?? 5,
      fetch,
      { targetSeconds: parsed.data.targetSeconds },
    );
    return NextResponse.json({ moments, provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Highlight failed";
    if (message === AI_NOT_CONNECTED) {
      return NextResponse.json({ error: AI_NOT_CONNECTED }, { status: 503 });
    }
    return NextResponse.json(
      { error: `Highlight selection failed: ${message}` },
      { status: 502 },
    );
  }
}
