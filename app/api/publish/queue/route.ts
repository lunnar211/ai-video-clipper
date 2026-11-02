import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  resolvePublishDb,
  listPostRows,
  listTargetRows,
} from "@/lib/publish/store";
import { isDue } from "@/lib/publish/schedule";

export const runtime = "nodejs";

/**
 * Publish queue / calendar view (ClipForge Phase 3).
 *
 * Groups posts into scheduled (with due ones flagged), drafts,
 * published, partial, and failed. Read-only; no tokens anywhere.
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
  const posts = await listPostRows(db);
  const now = Date.now();
  const withTargets = [];
  for (const post of posts) {
    withTargets.push({
      post,
      targets: await listTargetRows(db, post.id),
      due: isDue(post.schedule_at, post.status, now),
    });
  }
  return NextResponse.json({
    scheduled: withTargets.filter((p) => p.post.status === "scheduled"),
    due: withTargets.filter((p) => p.due),
    drafts: withTargets.filter((p) => p.post.status === "draft"),
    published: withTargets.filter((p) => p.post.status === "published"),
    partial: withTargets.filter((p) => p.post.status === "partial"),
    failed: withTargets.filter((p) => p.post.status === "failed"),
  });
}
