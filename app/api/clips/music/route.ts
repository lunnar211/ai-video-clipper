import { NextResponse } from "next/server";
import { getMusicDetector } from "@/lib/music/audd";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Music recognition for one audio sample. The browser sends a ≤15 s
 * sample (see extractAudioSampleWav). Without AUDD_API_TOKEN the
 * route answers 503 honestly — detection is optional, never faked.
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const detector = getMusicDetector();
  if (!detector) {
    return NextResponse.json(
      { error: "Music detection is not connected yet (no recognition key on the server)." },
      { status: 503 },
    );
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart audio upload." }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Expected a non-empty audio sample under 10 MB." },
      { status: 400 },
    );
  }
  try {
    const result = await detector.detect(audio, "sample.wav");
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Detection failed";
    return NextResponse.json(
      { error: `Music detection failed: ${message}` },
      { status: 502 },
    );
  }
}
