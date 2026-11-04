import { NextResponse } from "next/server";
import { z } from "zod";
import {
  runAiComboPipeline,
  AiComboError,
} from "@/lib/ai-combo/pipeline";
import { TRANSLATION_LANGUAGES } from "@/lib/ai/languages";
import { AI_NOT_CONNECTED } from "@/lib/ai/providers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  topic: z.string().trim().min(1).max(200),
  customScript: z.string().max(2000).optional(),
  segmentCount: z.number().int().min(1).max(6).optional(),
  language: z
    .string()
    .refine(
      (code) => TRANSLATION_LANGUAGES.some((l) => l.code === code),
      "Unknown script language.",
    )
    .optional(),
  format: z.enum(["9:16", "16:9", "1:1"]).optional(),
  voiceover: z.boolean().optional(),
});

/**
 * POST /api/ai-combo/run — the AI-combo backend pipeline as one
 * webhook call (ClipForge Phase 21).
 *
 * Webhook-gated, mirroring the sweepers route: without
 * AI_COMBO_WEBHOOK_SECRET the route honestly 503s (not
 * configured); with it, only a matching
 * `Authorization: Bearer <secret>` call runs. The bearer value
 * lives in the caller's automation (n8n holds it as a header
 * credential) — never in the workflow file, never in this repo.
 * Rate-limited per IP like the other generate routes.
 *
 * Runs the chain in order (script → verified visuals →
 * subtitles → voiceover slot → render-job record → post wiring)
 * and returns the job record. The record is NOT a video:
 * server-side rendering is not available on Vercel, so the job
 * says "needs_render" and hands off to the browser renderer or
 * the ffmpeg worker. A run never invents a script, a visual, a
 * voice, or a post: no provider → 503, unusable output → 502,
 * zero verified visuals for a segment → a recorded gap, and
 * nothing is ever marked posted here.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.AI_COMBO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "AI-combo webhook is not configured yet — set AI_COMBO_WEBHOOK_SECRET in the site's environment, then retry.",
      },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
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
      { error: "A topic of 1–200 characters is required." },
      { status: 400 },
    );
  }
  try {
    const job = await runAiComboPipeline(
      {
        topic: parsed.data.topic,
        customScript: parsed.data.customScript,
        segmentCount: parsed.data.segmentCount,
        language: parsed.data.language,
        format: parsed.data.format,
        voiceover: parsed.data.voiceover,
      },
      { fetchFn: fetch },
    );
    scheduleAudit({
      actor: "ai-combo-webhook",
      action: "ai-combo.run",
      target: job.jobId,
      metadata: {
        feature: "ai-combo",
        provider: job.scriptProvider,
        segments: job.segments.length,
        format: job.format,
      },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json(job);
  } catch (err) {
    if (err instanceof AiComboError) {
      if (err.kind === "invalid_input") {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      if (err.kind === "ai_not_connected") {
        return NextResponse.json({ error: AI_NOT_CONNECTED }, { status: 503 });
      }
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Pipeline failed";
    return NextResponse.json(
      { error: `Pipeline failed: ${message}` },
      { status: 502 },
    );
  }
}
