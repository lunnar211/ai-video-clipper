import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import {
  postActivityCounts,
  resolvePostActivityDb,
} from "@/lib/post/activity";

/**
 * GET /api/admin/post-activity — aggregate counts for the
 * post-without-connecting activity log (ClipForge Phase 13, console
 * roles only).
 *
 * Returns counts by platform and by outcome over recent rows. The
 * log holds no logins, grants, media, or post URLs, so there is
 * nothing sensitive to leak here — but the endpoint stays admin-only
 * because activity totals are operational data. Outcomes are
 * "shared" / "cancelled" / "opened" / "unsupported", never
 * "published".
 */
export async function GET(req: Request): Promise<Response> {
  const { errorResponse } = await adminGate(req, CONSOLE_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolvePostActivityDb();
  if (!db) {
    return NextResponse.json(
      { error: "The admin database is not configured yet." },
      { status: 503 },
    );
  }
  try {
    const counts = await postActivityCounts(db);
    return NextResponse.json(counts);
  } catch {
    return NextResponse.json(
      { error: "Activity aggregate failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
