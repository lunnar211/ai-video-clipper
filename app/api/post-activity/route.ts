import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  postActivityEventSchema,
  recordPostActivity,
  resolvePostActivityDb,
} from "@/lib/post/activity";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/post-activity — record one post-without-connecting
 * activity event (ClipForge Phase 13).
 *
 * Body: { clip_id, platform, outcome }. Platform is one of the six
 * direct-post platforms or "share_sheet"; outcome is "shared" /
 * "cancelled" / "opened" / "unsupported" — never "published", because
 * a share or a deep-link click is not a confirmed live post.
 *
 * Guests may record (no session, no clip ownership check — clip ids
 * are browser-local and carry no user data). The route records
 * nothing but the event: no login, no grant, no media, no post URL.
 * Without a configured database it 503s with setup instructions;
 * the post action itself still works client-side, only the activity
 * note is lost — the client says so instead of claiming a record.
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
  const parsed = postActivityEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That activity event is not valid." },
      { status: 400 },
    );
  }
  const db = resolvePostActivityDb();
  if (!db) {
    return NextResponse.json(
      {
        error:
          "Activity logging needs the database — apply supabase/migrations/007_clipforge_phase13.sql in your Supabase project and set SUPABASE_SERVICE_ROLE_KEY, then retry. Your post action itself still worked; only this activity note was not recorded.",
      },
      { status: 503 },
    );
  }
  try {
    await recordPostActivity(db, parsed.data);
  } catch {
    return NextResponse.json(
      { error: "Activity recording failed. Your post action itself still worked; only this activity note was not recorded." },
      { status: 500 },
    );
  }
  return NextResponse.json({ recorded: true });
}
