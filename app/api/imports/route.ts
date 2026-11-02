import { NextResponse } from "next/server";
import {
  importRequestSchema,
  buildAttribution,
  CC_ALLOWED_HOSTS,
  IMPORT_NOT_CONNECTED,
} from "@/lib/imports/index";
import { assertAllowedFetchUrl } from "@/lib/imports/ssrf";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Allowed imports ONLY (see lib/imports/index.ts for the rules).
 * Drive / Dropbox / Loom connected-account sources honestly 503
 * (no per-provider import route yet). Own-YouTube import lives at
 * POST /api/imports/youtube-owned since Phase 8. CC-licensed
 * imports validate the URL host + licence through the SSRF guard
 * and return the auto-built attribution; the file itself arrives
 * via direct upload in Phase 1. There is deliberately NO
 * arbitrary-URL branch.
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
  const parsed = importRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid import request." },
      { status: 400 },
    );
  }
  const data = parsed.data;
  if (data.source !== "cc-licensed") {
    // Drive / Dropbox / Loom: no per-provider import route yet.
    // youtube-owned has its own route (see above); sending it here
    // is a caller error, not a silent downgrade.
    return NextResponse.json(
      { error: IMPORT_NOT_CONNECTED, source: data.source },
      { status: 503 },
    );
  }
  try {
    await assertAllowedFetchUrl(data.url, CC_ALLOWED_HOSTS);
  } catch (err) {
    const message = err instanceof Error ? err.message : "URL rejected";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({
    status: "validated",
    source: "cc-licensed",
    attribution: buildAttribution(
      data.title,
      data.author,
      data.license,
      data.url,
    ),
    note: "Licence + host validated and attribution built. Upload the file itself via direct upload; server-side CC fetching arrives with the ffmpeg worker.",
  });
}
