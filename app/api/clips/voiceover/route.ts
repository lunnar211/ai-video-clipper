import { NextResponse } from "next/server";
import { z } from "zod";
import { elevenLabsSpeak } from "@/lib/ai/voiceover";
import { getKey, AI_NOT_CONNECTED } from "@/lib/ai/providers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  text: z.string().min(1).max(500),
});

export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  if (!getKey("ELEVENLABS_API_KEY")) {
    return NextResponse.json({ error: AI_NOT_CONNECTED }, { status: 503 });
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
      { error: "Voiceover text must be 1–500 characters." },
      { status: 400 },
    );
  }
  try {
    const audio = await elevenLabsSpeak(parsed.data.text);
    return new NextResponse(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'attachment; filename="voiceover.mp3"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Voiceover failed";
    return NextResponse.json(
      { error: `Voiceover failed: ${message}` },
      { status: 502 },
    );
  }
}
