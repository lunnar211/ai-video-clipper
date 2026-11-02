/**
 * Post-publish analytics sync (ClipForge Phase 3).
 *
 * YouTube stats come from the Data API (videos.list, statistics part).
 * Every other platform reports honestly as unsupported until its
 * adapter is implemented and approved — the analytics page shows
 * "sync not available for this platform", never invented numbers.
 */

import type { FetchImpl } from "@/lib/ai/providers";
import type { PlatformId } from "./platforms";

export type PlatformStats = {
  views: number;
  likes: number;
  comments: number;
};

export type AnalyticsSyncResult =
  | { supported: true; stats: PlatformStats }
  | { supported: false; reason: string };

function toNum(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

/** Fetch YouTube statistics for one video id. */
export async function fetchYoutubeStats(
  videoId: string,
  accessToken: string,
  fetchImpl: FetchImpl = fetch,
): Promise<PlatformStats> {
  const url =
    "https://www.googleapis.com/youtube/v3/videos?part=statistics&id=" +
    encodeURIComponent(videoId);
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`YouTube stats fetch failed (HTTP ${res.status})`);
  }
  const json = (await res.json()) as {
    items?: Array<{ statistics?: Record<string, unknown> }>;
  };
  const stats = json.items?.[0]?.statistics ?? {};
  return {
    views: toNum(stats.viewCount),
    likes: toNum(stats.likeCount),
    comments: toNum(stats.commentCount),
  };
}

/** Sync analytics for one published target. */
export async function syncTargetAnalytics(
  platform: PlatformId,
  providerPostId: string,
  accessToken: string,
  fetchImpl: FetchImpl = fetch,
): Promise<AnalyticsSyncResult> {
  if (platform !== "youtube") {
    return {
      supported: false,
      reason:
        `Analytics sync for ${platform} is not implemented yet — ` +
        "it arrives with that platform's upload adapter.",
    };
  }
  const stats = await fetchYoutubeStats(providerPostId, accessToken, fetchImpl);
  return { supported: true, stats };
}
