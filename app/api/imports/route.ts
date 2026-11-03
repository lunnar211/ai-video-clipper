import { NextResponse } from "next/server";
import {
  importRequestSchema,
  IMPORT_NOT_CONNECTED,
} from "@/lib/imports/index";
import { verifyCcUrl } from "@/lib/imports/cc-verify";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Allowed imports ONLY (see lib/imports/index.ts for the rules).
 * Drive / Dropbox / Loom connected-account sources honestly 503
 * (no per-provider import route yet). Own-YouTube import lives at
 * POST /api/imports/youtube-owned since Phase 8. CC-verified import
 * lives at POST /api/imports/cc-verify since Phase 11.
 *
 * The legacy "cc-licensed" branch (Phase 12 fix): it used to accept
 * a caller-declared licence and answer "validated" after only a host
 * check — a caller could claim any licence. It now runs the SAME
 * verification as /api/imports/cc-verify and builds the attribution
 * from the verified facts only. Caller-declared licence, author,
 * and title in the request are accepted for compatibility but
 * IGNORED: the response carries only what the source's public API
 * confirmed. A link the verification refuses (wrong host, non-free
 * or unknown licence) is refused here too — never "validated".
 * There is deliberately NO arbitrary-URL branch.
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
  const result = await verifyCcUrl(data.url);
  if (!result.ok) {
    const status = result.reason === "VERIFY_UNAVAILABLE" ? 502 : 400;
    return NextResponse.json(
      { error: result.message, reason: result.reason },
      { status },
    );
  }
  return NextResponse.json({
    status: "validated",
    source: "cc-licensed",
    attribution: result.verified.attribution,
    verified: {
      license: result.verified.license,
      author: result.verified.author,
      title: result.verified.title,
      sourceUrl: result.verified.sourceUrl,
      files: result.verified.files,
    },
    note: "Licence verified via the source's public API; attribution built from verified facts only. Caller-declared licence/author/title are ignored. Load the file from the verified file URL in the browser, or upload the file itself via direct upload.",
  });
}
