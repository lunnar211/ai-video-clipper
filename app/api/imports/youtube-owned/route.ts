import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth/session-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  listAccountRows,
  resolvePublishDb,
} from "@/lib/publish/store";
import { createEnvTokenCrypto } from "@/lib/publish/tokens";
import {
  accessTokenForAccount,
  parseYoutubeVideoId,
  verifyVideoOwnership,
  YOUTUBE_NOT_CONNECTED,
  YOUTUBE_RECONNECT_NEEDED,
} from "@/lib/imports/youtube";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().url().max(2048),
});

/**
 * POST /api/imports/youtube-owned — verify a pasted YouTube link
 * belongs to the caller's own connected channel (ClipForge Phase 8).
 *
 * This is the ONLY paste-link import in the app, and it is not a
 * downloader: the server only calls YouTube Data API metadata
 * endpoints (video channel + token channel) and compares channel
 * ids. The file itself still arrives via direct upload. A link to
 * anyone else's video, an unparseable URL, or a missing/stale
 * connection is refused honestly — never silently passed.
 *
 * Session-bound: the connected account must belong to the caller
 * (accounts connected before user binding existed carry user_id
 * null and must be reconnected while signed in). Exactly one
 * connected YouTube account is required; several is ambiguous
 * and refused.
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to import from your own YouTube channel." },
      { status: 401 },
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
    return NextResponse.json({ error: "Invalid import request." }, { status: 400 });
  }
  const videoId = parseYoutubeVideoId(parsed.data.url);
  if (!videoId) {
    return NextResponse.json(
      {
        error:
          "That link is not a YouTube video link (watch, shorts, embed, live, or youtu.be).",
      },
      { status: 400 },
    );
  }
  const db = resolvePublishDb();
  if (!db) {
    return NextResponse.json(
      { error: "Publishing needs database setup." },
      { status: 503 },
    );
  }
  if (!createEnvTokenCrypto()) {
    return NextResponse.json(
      { error: "Publishing token key is not configured." },
      { status: 503 },
    );
  }
  let accounts;
  try {
    const rows = await listAccountRows(db);
    accounts = rows.filter(
      (row) =>
        row.platform === "youtube" &&
        row.status === "connected" &&
        row.user_id === userId,
    );
  } catch {
    return NextResponse.json(
      { error: "Account lookup failed." },
      { status: 500 },
    );
  }
  if (accounts.length === 0) {
    return NextResponse.json(
      { error: YOUTUBE_NOT_CONNECTED },
      { status: 400 },
    );
  }
  if (accounts.length > 1) {
    return NextResponse.json(
      {
        error:
          "Several YouTube accounts are connected for this user — disconnect the extras, then retry.",
      },
      { status: 400 },
    );
  }
  const account = accounts[0];
  const accessToken = await accessTokenForAccount(db, account);
  if (!accessToken) {
    return NextResponse.json(
      {
        error:
          "Your YouTube connection expired and could not be refreshed — reconnect your YouTube account, then retry.",
      },
      { status: 401 },
    );
  }
  try {
    const verdict = await verifyVideoOwnership({
      videoId,
      accessToken,
    });
    if (!verdict.owned) {
      if (verdict.reason === "not_found") {
        return NextResponse.json(
          { error: "That video was not found or is not visible." },
          { status: 404 },
        );
      }
      if (verdict.reason === "channel_unreadable") {
        return NextResponse.json(
          { error: YOUTUBE_RECONNECT_NEEDED },
          { status: 403 },
        );
      }
      return NextResponse.json(
        {
          error:
            "That video is not on your connected YouTube channel — only your own videos can be imported.",
        },
        { status: 403 },
      );
    }
    return NextResponse.json({
      status: "verified",
      videoId: verdict.videoId,
      channelId: verdict.channelId,
      channelTitle: verdict.channelTitle,
      videoTitle: verdict.videoTitle,
      accountId: account.id,
      note: "Ownership verified. Upload the file itself via direct upload; the server never downloads video bytes.",
    });
  } catch {
    return NextResponse.json(
      { error: "YouTube verification failed — try again in a minute." },
      { status: 502 },
    );
  }
}
