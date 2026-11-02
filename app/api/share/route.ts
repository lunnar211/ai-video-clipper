import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveShareDb,
  newShareToken,
  shareUrl,
  createShareRow,
  SHARE_NOT_CONFIGURED,
} from "@/lib/share";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  title: z.string().min(1).max(300),
  videoUrl: z.string().url().max(2048).optional(),
  clipStart: z.number().finite().min(0),
  clipEnd: z.number().finite().positive(),
});

/**
 * Create a public share link. DB-backed: without the database the
 * route honestly 503s with setup instructions — counts are never
 * invented. Share URLs are public to anyone with the link.
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
    return NextResponse.json({ error: "Invalid share request." }, { status: 400 });
  }
  const db = resolveShareDb();
  if (!db) {
    return NextResponse.json({ error: SHARE_NOT_CONFIGURED }, { status: 503 });
  }
  const token = newShareToken();
  try {
    const row = await createShareRow(db, {
      token,
      title: parsed.data.title,
      video_url: parsed.data.videoUrl ?? null,
      clip_start: parsed.data.clipStart,
      clip_end: parsed.data.clipEnd,
    });
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ??
      "https://ai-video-clipper-dipeshkarki8292-3476s-projects.vercel.app";
    return NextResponse.json({
      token: row.token,
      url: shareUrl(base, row.token),
      views: row.views,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Share failed";
    return NextResponse.json(
      { error: `Share creation failed: ${message}` },
      { status: 502 },
    );
  }
}
