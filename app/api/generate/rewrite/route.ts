import { NextResponse } from "next/server";
import { z } from "zod";
import {
  rewriteScript,
  scriptSchema,
  resolveScriptLanguage,
} from "@/lib/ai/script";
import { TRANSLATION_LANGUAGES } from "@/lib/ai/languages";
import { AI_NOT_CONNECTED } from "@/lib/ai/providers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  script: scriptSchema,
  language: z
    .string()
    .refine(
      (code) => TRANSLATION_LANGUAGES.some((l) => l.code === code),
      "Unknown script language.",
    )
    .optional(),
});

/**
 * POST /api/generate/rewrite — rewrite an existing script
 * (ClipForge Phase 19).
 *
 * Same chain, rate limit, audit, and failure contract as the
 * script route: the AI chain rewrites the script (same segment
 * count and meaning, fresh wording, optionally in another
 * language from the curated list). No provider → 503, unusable
 * output → 502 — a rewrite is never invented when the AI fails.
 * The script text is returned as data, never stored server-side.
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
      { error: "A valid script (1–6 segments) is required to rewrite." },
      { status: 400 },
    );
  }
  const resolved = resolveScriptLanguage(parsed.data.language);
  try {
    const { script, provider } = await rewriteScript(
      parsed.data.script,
      fetch,
      resolved,
    );
    scheduleAudit({
      actor: "guest",
      action: "ai.job_run",
      target: null,
      metadata: { feature: "generate-rewrite", provider, cost_usd: null },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ...script, provider, language: resolved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Rewrite failed";
    if (message === AI_NOT_CONNECTED) {
      return NextResponse.json({ error: AI_NOT_CONNECTED }, { status: 503 });
    }
    return NextResponse.json(
      { error: `Script rewrite failed: ${message}` },
      { status: 502 },
    );
  }
}
