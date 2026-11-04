import { NextResponse } from "next/server";
import { z } from "zod";
import { searchCommonsVideos } from "@/lib/imports/cc-search";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  keyword: z.string().trim().min(1).max(100),
});

/**
 * POST /api/generate/visuals — licence-verified stock footage
 * for one script segment (ClipForge Phase 17).
 *
 * Searches Wikimedia Commons for videos matching the keyword and
 * returns ONLY candidates that pass the exact Phase 11 licence
 * verification (CC-BY, CC-BY-SA, CC0, public domain). Guest-
 * accessible and rate-limited, mirroring the cc-verify route.
 * The server reads search + licence metadata only — no video
 * bytes pass through it; the visitor's browser loads the chosen
 * file straight from the source host. A search failure is a 502;
 * zero verified candidates is a 200 with an empty list and an
 * honest note, never an invented visual.
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
      { error: "A visual keyword of 1–100 characters is required." },
      { status: 400 },
    );
  }
  const result = await searchCommonsVideos(parsed.data.keyword);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 502 });
  }
  return NextResponse.json({
    visuals: result.visuals,
    note: result.note,
  });
}
