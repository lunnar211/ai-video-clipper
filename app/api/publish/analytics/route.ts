import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  resolvePublishDb,
  listAnalyticsRows,
  listAccountRows,
} from "@/lib/publish/store";

export const runtime = "nodejs";

/**
 * Unified post-publish analytics (ClipForge Phase 3).
 *
 * Per-post + per-platform rows. Without a database, 503 honestly.
 * With no connected accounts, the message says so — never fake
 * numbers. With accounts but no synced rows, the page reports that
 * no analytics have synced yet.
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
      { error: "Publishing needs database setup." },
      { status: 503 },
    );
  }
  const accounts = await listAccountRows(db);
  const rows = await listAnalyticsRows(db);
  return NextResponse.json({
    rows,
    message:
      accounts.length === 0
        ? "No connected accounts yet — connect an account to see analytics."
        : rows.length === 0
          ? "No analytics synced yet — publish a post, then sync."
          : null,
  });
}
