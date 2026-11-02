import { NextResponse } from "next/server";
import {
  resolveShareDb,
  getShareRow,
  bumpShareViews,
  SHARE_NOT_CONFIGURED,
} from "@/lib/share";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Fetch a share + bump its view count (DB-backed, else 503). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  if (!checkRateLimit(getClientIp(_req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const { token } = await ctx.params;
  const db = resolveShareDb();
  if (!db) {
    return NextResponse.json({ error: SHARE_NOT_CONFIGURED }, { status: 503 });
  }
  try {
    const row = await getShareRow(db, token);
    if (!row) {
      return NextResponse.json({ error: "Share link not found." }, { status: 404 });
    }
    const views = await bumpShareViews(db, row);
    return NextResponse.json({
      title: row.title,
      videoUrl: row.video_url,
      clipStart: row.clip_start,
      clipEnd: row.clip_end,
      views,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Share lookup failed";
    return NextResponse.json(
      { error: `Share lookup failed: ${message}` },
      { status: 502 },
    );
  }
}
