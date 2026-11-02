import { NextResponse } from "next/server";
import {
  prePublishDraftSchema,
  evaluatePrePublishCheck,
} from "@/lib/rights/policy";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Pre-publish compliance check (ClipForge Phase 2).
 *
 * Evaluates a draft (no posts exist yet — Phase 3 calls this against
 * real posts). Stateless: it writes nothing and returns the per-item
 * verdict plus the music policy outcome. Recording ticks is the
 * checklist route's job.
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
  const parsed = prePublishDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid pre-publish draft.", details: parsed.error.issues },
      { status: 400 },
    );
  }
  return NextResponse.json(evaluatePrePublishCheck(parsed.data));
}
