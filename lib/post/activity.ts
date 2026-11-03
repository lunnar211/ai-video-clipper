/**
 * Activity-only log for the post-without-connecting flow (ClipForge
 * Phase 13).
 *
 * What is recorded: clip id, platform (or "share_sheet"), outcome
 * ("shared" / "cancelled" / "opened" / "unsupported"), timestamp.
 * What is NEVER recorded here: any login, grant, session, media
 * content, or post URL — the flow has none of those by construction,
 * and this table could not hold them if it tried (there is no column
 * for them). Outcomes are never "published": only the platform
 * itself can confirm a live post.
 *
 * Storage lives in `clipper_post_activity` (see
 * supabase/migrations/007_clipforge_phase13.sql — FILE ONLY, applied
 * by the owner). Without a configured database, recording honestly
 * 503s; the post action itself still works (share sheet / download /
 * deep links are all client-side), only the activity note is lost.
 */

import { z } from "zod";
import { getKey, type FetchImpl } from "@/lib/ai/providers";
import type {
  PostActivityOutcome,
  PostActivityPlatform,
} from "@/lib/post/direct-share";

export const postActivityEventSchema = z.object({
  clip_id: z.string().min(1).max(128),
  platform: z.enum([
    "youtube",
    "tiktok",
    "instagram",
    "facebook",
    "x",
    "linkedin",
    "share_sheet",
  ]),
  outcome: z.enum(["shared", "cancelled", "opened", "unsupported"]),
});

export type PostActivityEvent = {
  clip_id: string;
  platform: PostActivityPlatform;
  outcome: PostActivityOutcome;
};

export type PostActivityDb = { url: string; serviceKey: string };

/** Resolve the activity database, or null when it is not configured. */
export function resolvePostActivityDb(): PostActivityDb | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = getKey("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function restHeaders(db: PostActivityDb): Record<string, string> {
  return {
    apikey: db.serviceKey,
    Authorization: `Bearer ${db.serviceKey}`,
    "Content-Type": "application/json",
  };
}

/** Insert one activity event. Throws on any failure (never fake success). */
export async function recordPostActivity(
  db: PostActivityDb,
  event: PostActivityEvent,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  const res = await fetchImpl(`${db.url}/rest/v1/clipper_post_activity`, {
    method: "POST",
    headers: restHeaders(db),
    body: JSON.stringify({
      clip_id: event.clip_id,
      platform: event.platform,
      outcome: event.outcome,
    }),
  });
  if (!res.ok) {
    throw new Error(`Activity recording failed (HTTP ${res.status})`);
  }
}

export type PostActivityCounts = {
  total: number;
  byPlatform: Record<string, number>;
  byOutcome: Record<string, number>;
  /** True when the count covers only the newest 5000 rows. */
  truncated: boolean;
};

const AGGREGATE_ROW_LIMIT = 5000;

/** Aggregate counts over recent activity rows (admin view only). */
export async function postActivityCounts(
  db: PostActivityDb,
  fetchImpl: FetchImpl = fetch,
): Promise<PostActivityCounts> {
  const res = await fetchImpl(
    `${db.url}/rest/v1/clipper_post_activity?select=platform,outcome&order=created_at.desc&limit=${AGGREGATE_ROW_LIMIT}`,
    { headers: restHeaders(db) },
  );
  if (!res.ok) {
    throw new Error(`Activity aggregate failed (HTTP ${res.status})`);
  }
  const rows = (await res.json()) as { platform: string; outcome: string }[];
  const byPlatform: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  for (const row of rows) {
    byPlatform[row.platform] = (byPlatform[row.platform] ?? 0) + 1;
    byOutcome[row.outcome] = (byOutcome[row.outcome] ?? 0) + 1;
  }
  return {
    total: rows.length,
    byPlatform,
    byOutcome,
    truncated: rows.length === AGGREGATE_ROW_LIMIT,
  };
}
