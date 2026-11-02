/**
 * Own-YouTube import verification (ClipForge Phase 8).
 *
 * LEGAL VERSION ONLY. A pasted link is accepted only when the video
 * provably belongs to the channel behind the user's own connected
 * YouTube account:
 *
 *  1. The video id is parsed from the URL (watch, shorts, embed,
 *     live, youtu.be — nothing else is accepted).
 *  2. The video's channel is read from the YouTube Data API.
 *  3. The channel behind the stored OAuth token is read with
 *     channels.list(mine=true) — this needs the youtube.readonly
 *     scope, added to the YouTube connect scopes in this phase.
 *     Accounts connected before that scope existed get an honest
 *     "reconnect to grant channel-read permission" refusal, never
 *     a silent pass.
 *  4. The two channel ids must match exactly, or the import is
 *     refused with 403. Anything else — a link to someone else's
 *     video, a private/deleted video, an unparseable URL — is
 *     refused honestly. There is deliberately no fallback that
 *     accepts a link on a label match or a guess.
 *
 * The server NEVER downloads video bytes: only Data API metadata
 * calls happen here. The file itself still arrives via direct
 * upload, exactly like the CC-licensed flow. This is not a link
 * downloader and must never become one.
 */

import type { FetchImpl } from "@/lib/ai/providers";
import {
  createEnvTokenCrypto,
  type TokenCrypto,
} from "@/lib/publish/tokens";
import {
  refreshAccessToken,
  resolveOAuthConfig,
} from "@/lib/publish/oauth";
import {
  updateAccountTokens,
  type PublishAccountRow,
  type PublishDb,
} from "@/lib/publish/store";

export const YOUTUBE_NOT_CONNECTED =
  "No YouTube account is connected for this user — connect it from the account page while signed in, then retry.";

export const YOUTUBE_RECONNECT_NEEDED =
  "Your YouTube connection predates channel-read permission — reconnect your YouTube account to grant it, then retry.";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Parse a YouTube video id from a pasted link. Accepts watch, shorts,
 * embed, live, /v/, and youtu.be forms on youtube.com hosts (www, m,
 * music) and youtu.be. Returns null for anything else — including
 * playlist, channel, and non-YouTube URLs.
 */
export function parseYoutubeVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = url.pathname.replace(/^\//, "").split("/")[0] ?? null;
  } else if (
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com"
  ) {
    const path = url.pathname;
    if (path === "/watch") {
      candidate = url.searchParams.get("v");
    } else {
      const match = path.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      candidate = match ? match[2] : null;
    }
  } else {
    return null;
  }
  if (!candidate || !VIDEO_ID_PATTERN.test(candidate)) return null;
  return candidate;
}

type YoutubeApiError = { status: number };

async function youtubeGet(
  path: string,
  accessToken: string,
  fetchImpl: FetchImpl,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetchImpl(
    `https://www.googleapis.com/youtube/v3/${path}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

export type VideoDetails = {
  channelId: string;
  channelTitle: string;
  videoTitle: string;
};

/** Read a video's channel + title. Null when the video is not found. */
export async function fetchVideoDetails(
  videoId: string,
  accessToken: string,
  fetchImpl: FetchImpl = fetch,
): Promise<VideoDetails | null> {
  const { ok, status, json } = await youtubeGet(
    `videos?part=snippet&id=${encodeURIComponent(videoId)}` +
      `&fields=items(id,snippet(channelId,channelTitle,title))`,
    accessToken,
    fetchImpl,
  );
  if (!ok) {
    const err = new Error("YouTube video lookup failed") as Error &
      YoutubeApiError;
    err.status = status;
    throw err;
  }
  const items = (json as { items?: Array<Record<string, unknown>> } | null)
    ?.items;
  const first = items?.[0];
  const snippet = first?.snippet as Record<string, unknown> | undefined;
  if (!first || !snippet || typeof snippet.channelId !== "string") return null;
  return {
    channelId: snippet.channelId,
    channelTitle:
      typeof snippet.channelTitle === "string" ? snippet.channelTitle : "",
    videoTitle: typeof snippet.title === "string" ? snippet.title : "",
  };
}

export type OwnChannel = { channelId: string; channelTitle: string };

/**
 * Read the channel behind an OAuth token. Throws an error with
 * status 403 when the grant lacks channel-read permission (the
 * reconnect case) so callers can say so plainly.
 */
export async function fetchOwnChannel(
  accessToken: string,
  fetchImpl: FetchImpl = fetch,
): Promise<OwnChannel | null> {
  const { ok, status, json } = await youtubeGet(
    "channels?part=id,snippet&mine=true&fields=items(id,snippet(title))",
    accessToken,
    fetchImpl,
  );
  if (!ok) {
    const err = new Error("YouTube channel lookup failed") as Error &
      YoutubeApiError;
    err.status = status;
    throw err;
  }
  const items = (json as { items?: Array<Record<string, unknown>> } | null)
    ?.items;
  const first = items?.[0];
  const snippet = first?.snippet as Record<string, unknown> | undefined;
  if (!first || typeof first.id !== "string") return null;
  return {
    channelId: first.id,
    channelTitle:
      snippet && typeof snippet.title === "string" ? snippet.title : "",
  };
}

export type OwnershipVerdict =
  | {
      owned: true;
      videoId: string;
      channelId: string;
      channelTitle: string;
      videoTitle: string;
    }
  | { owned: false; reason: "not_found" | "not_owned" | "channel_unreadable" };

/** Ownership = the video's channel id equals the token's channel id. */
export async function verifyVideoOwnership(input: {
  videoId: string;
  accessToken: string;
  fetchImpl?: FetchImpl;
}): Promise<OwnershipVerdict> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let own: OwnChannel | null;
  try {
    own = await fetchOwnChannel(input.accessToken, fetchImpl);
  } catch (err) {
    if (
      err instanceof Error &&
      (err as Error & YoutubeApiError).status === 403
    ) {
      return { owned: false, reason: "channel_unreadable" };
    }
    throw err;
  }
  if (!own) return { owned: false, reason: "channel_unreadable" };
  const video = await fetchVideoDetails(input.videoId, input.accessToken, fetchImpl);
  if (!video) return { owned: false, reason: "not_found" };
  if (video.channelId !== own.channelId) {
    return { owned: false, reason: "not_owned" };
  }
  return {
    owned: true,
    videoId: input.videoId,
    channelId: own.channelId,
    channelTitle: own.channelTitle || video.channelTitle,
    videoTitle: video.videoTitle,
  };
}

/**
 * Decrypt a connected account's access token, refreshing it first
 * when expired and a refresh token exists (updated tokens are
 * persisted). Returns null when the token key is missing or the
 * token cannot be produced — callers answer 503/401 honestly.
 */
export async function accessTokenForAccount(
  db: PublishDb,
  account: PublishAccountRow,
  fetchImpl: FetchImpl = fetch,
): Promise<string | null> {
  const crypto: TokenCrypto | null = createEnvTokenCrypto();
  if (!crypto) return null;
  const expired =
    account.token_expires_at !== null &&
    Date.parse(account.token_expires_at) < Date.now() + 60_000;
  if (!expired) {
    try {
      return crypto.decrypt(account.access_token_enc);
    } catch {
      return null;
    }
  }
  if (!account.refresh_token_enc) return null;
  const config = resolveOAuthConfig("youtube");
  if (!config) return null;
  let refreshToken: string;
  try {
    refreshToken = crypto.decrypt(account.refresh_token_enc);
  } catch {
    return null;
  }
  try {
    const tokens = await refreshAccessToken(
      "youtube",
      config,
      refreshToken,
      fetchImpl,
    );
    const expiresAt = tokens.expiresInSec
      ? new Date(Date.now() + tokens.expiresInSec * 1000).toISOString()
      : null;
    await updateAccountTokens(
      db,
      account.id,
      {
        access_token_enc: crypto.encrypt(tokens.accessToken),
        refresh_token_enc: tokens.refreshToken
          ? crypto.encrypt(tokens.refreshToken)
          : account.refresh_token_enc,
        token_expires_at: expiresAt,
        token_key_id: crypto.keyId,
      },
      fetchImpl,
    );
    return tokens.accessToken;
  } catch {
    return null;
  }
}
