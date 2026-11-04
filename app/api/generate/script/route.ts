import { NextResponse } from "next/server";
import { z } from "zod";
import { generateScript, splitCustomScript, resolveScriptLanguage } from "@/lib/ai/script";
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
});

/**
 * POST /api/generate/script — topic in, short script out
 * (ClipForge Phase 17).
 *
 * Either the user supplies their own script (split into segments
 * locally, no AI call) or the AI chain writes one from the topic.
 * Guest-accessible and rate-limited, mirroring the highlights and
 * cc-verify routes. A script is never invented when the AI fails:
 * no provider → 503, unusable output → 502. The script text is
 * returned as data, never stored server-side.
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
    return NextResponse.json(
      { error: "A topic of 1–200 characters is required." },
      { status: 400 },
    );
  }
  const { topic, customScript, segmentCount, language } = parsed.data;
  try {
    if (customScript && customScript.trim()) {
      const script = splitCustomScript(customScript);
      if (!script) {
        return NextResponse.json(
          { error: "That custom script has no usable lines." },
          { status: 400 },
        );
      }
      return NextResponse.json({ ...script, provider: "custom" });
    }
    const resolved = resolveScriptLanguage(language);
    const { script, provider } = await generateScript(
      topic,
      segmentCount ?? 4,
      fetch,
      resolved,
    );
    scheduleAudit({
      actor: "guest",
      action: "ai.job_run",
      target: null,
      metadata: { feature: "generate-script", provider, cost_usd: null },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ...script, provider, language: resolved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Script failed";
    if (message === AI_NOT_CONNECTED) {
      return NextResponse.json({ error: AI_NOT_CONNECTED }, { status: 503 });
    }
    return NextResponse.json(
      { error: `Script generation failed: ${message}` },
      { status: 502 },
    );
  }
}
