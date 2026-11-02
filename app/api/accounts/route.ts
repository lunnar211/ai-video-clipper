import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  PLATFORM_IDS,
  platformStatus,
  PLATFORMS,
} from "@/lib/publish/platforms";
import {
  resolvePublishDb,
  listAccountRows,
  toPublicAccount,
} from "@/lib/publish/store";

export const runtime = "nodejs";

/**
 * Connected social accounts (ClipForge Phase 3).
 *
 * Returns status-only account views (platform, label, scopes, expiry)
 * — tokens are NEVER in responses. Without a database, 503 honestly.
 */
export async function GET(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const db = resolvePublishDb();
  if (!db) {
    return NextResponse.json(
      {
        error:
          "Publishing needs database setup — apply the publish migration " +
          "and set the Supabase service-role key, then retry.",
      },
      { status: 503 },
    );
  }
  const rows = await listAccountRows(db);
  return NextResponse.json({
    accounts: rows.map(toPublicAccount),
    platforms: PLATFORM_IDS.map((id) => ({
      id,
      label: PLATFORMS[id].label,
      status: platformStatus(id),
      scopes: PLATFORMS[id].scopes,
    })),
  });
}
