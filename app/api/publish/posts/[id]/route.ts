import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  resolvePublishDb,
  getPostRow,
  listTargetRows,
} from "@/lib/publish/store";

export const runtime = "nodejs";

/** Post status with per-target statuses (no tokens anywhere). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const { id } = await params;
  const db = resolvePublishDb();
  if (!db) {
    return NextResponse.json(
      { error: "Publishing needs database setup." },
      { status: 503 },
    );
  }
  const post = await getPostRow(db, id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }
  const targets = await listTargetRows(db, id);
  return NextResponse.json({ post, targets });
}
