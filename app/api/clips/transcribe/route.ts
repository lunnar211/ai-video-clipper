import { NextResponse } from "next/server";
import { groqTranscribe } from "@/lib/ai/groq";
import { getKey, AI_NOT_CONNECTED } from "@/lib/ai/providers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Groq's audio file cap is 25 MB; the browser resamples to 16 kHz mono. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  if (!getKey("GROQ_API_KEY")) {
    return NextResponse.json({ error: AI_NOT_CONNECTED }, { status: 503 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected an audio upload." }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json(
      { error: "No audio file received." },
      { status: 400 },
    );
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      {
        error:
          "Audio is over 25 MB (Groq's file cap). Use a shorter video — the browser resamples to 16 kHz mono, about 2 MB per minute.",
      },
      { status: 413 },
    );
  }
  // Optional word-level timestamps for animated captions ("words" = "1").
  const wantWords = form.get("words") === "1";
  try {
    const { segments, model, words } = await groqTranscribe(
      audio,
      audio.name || "audio.wav",
      { wordTimestamps: wantWords },
    );
    // Audit only: cost is recorded as null — never invented. The
    // transcript itself is never logged.
    scheduleAudit({
      actor: "guest",
      action: "ai.job_run",
      target: null,
      metadata: { feature: "transcribe", model, cost_usd: null },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ segments, model, words });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    return NextResponse.json(
      { error: `Transcription failed: ${message}` },
      { status: 502 },
    );
  }
}
