import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCcUrl } from "@/lib/imports/cc-verify";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().url().max(2048),
});

/**
 * POST /api/imports/cc-verify — verify a pasted CC-licensed video
 * link (ClipForge Phase 11).
 *
 * This is a licence check only, NOT a downloader: the server reads
 * licence metadata from the source's public API (Wikimedia Commons
 * or Internet Archive) and returns the direct file URL for the
 * visitor's browser to load. No video bytes pass through this
 * server, nothing is stored server-side, and no other host is ever
 * accepted. Guests may use it (no session, no database); the
 * browser pipeline's own caps (10 min / 500 MB) still apply once
 * the file loads. A licence that cannot be confirmed free is
 * refused, never assumed.
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
      { error: "Paste a full video link.", reason: "INVALID_URL" },
      { status: 400 },
    );
  }
  const result = await verifyCcUrl(parsed.data.url);
  if (!result.ok) {
    const status = result.reason === "VERIFY_UNAVAILABLE" ? 502 : 400;
    return NextResponse.json(
      { error: result.message, reason: result.reason },
      { status },
    );
  }
  return NextResponse.json({
    status: "verified",
    ...result.verified,
  });
}
