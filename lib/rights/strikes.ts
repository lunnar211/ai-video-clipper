/**
 * Strike system: DMCA/takedown intake, review queue, appeals, and the
 * publishing-pause enforcement hook (ClipForge Phase 2).
 *
 * Status flows (any other transition is rejected):
 * - Strike: submitted → under_review → upheld | overturned
 * - Appeal: submitted → under_review → upheld | overturned
 *   (an appeal "upheld" means the strike stands; "overturned" means
 *   the strike is reversed and the pause is lifted if no other
 *   upheld strike keeps it paused.)
 *
 * Auto-pause: when a user's upheld-strike count reaches
 * REPEAT_INFRINGER_POLICY.strikesToPause, publishing is paused
 * (clipper_users.publishing_paused). Phase 3 checks
 * isPublishingPaused() before any publish. The flag is a server-side
 * enforcement value — the client never decides it.
 */

import { z } from "zod";
import { type FetchImpl } from "@/lib/ai/providers";
import { REPEAT_INFRINGER_POLICY } from "@/lib/rights/policy";
import type { RightsDb } from "@/lib/rights/declarations";
import { resolveRightsDb } from "@/lib/rights/declarations";

export const strikeSchema = z.object({
  reporterName: z.string().min(1).max(200),
  reporterEmail: z.string().email().max(200),
  workDescription: z.string().min(10).max(4000),
  infringingRef: z.string().min(1).max(1000),
  goodFaithStatement: z.literal(true),
  accuracyStatement: z.literal(true),
  signature: z.string().min(1).max(200),
  /** Optional: the accused account's user id, when known. */
  accusedUserId: z.string().uuid().nullable().optional(),
});

export type StrikeStatus = "submitted" | "under_review" | "upheld" | "overturned";

export type StrikeRow = {
  id: string;
  reporter_name: string;
  reporter_email: string;
  work_description: string;
  infringing_ref: string;
  accused_user_id: string | null;
  status: StrikeStatus;
  admin_note: string | null;
  created_at: string;
};

const STRIKE_TRANSITIONS: Record<StrikeStatus, StrikeStatus[]> = {
  submitted: ["under_review"],
  under_review: ["upheld", "overturned"],
  upheld: [],
  overturned: [],
};

export function canTransitionStrike(
  from: StrikeStatus,
  to: StrikeStatus,
): boolean {
  return STRIKE_TRANSITIONS[from].includes(to);
}

export const appealSchema = z.object({
  strikeId: z.string().uuid(),
  appellantName: z.string().min(1).max(200),
  appellantEmail: z.string().email().max(200),
  reason: z.string().min(10).max(4000),
});

export type AppealStatus = "submitted" | "under_review" | "upheld" | "overturned";

export type AppealRow = {
  id: string;
  strike_id: string;
  appellant_name: string;
  appellant_email: string;
  reason: string;
  status: AppealStatus;
  admin_note: string | null;
  created_at: string;
};

const APPEAL_TRANSITIONS: Record<AppealStatus, AppealStatus[]> = {
  submitted: ["under_review"],
  under_review: ["upheld", "overturned"],
  upheld: [],
  overturned: [],
};

export function canTransitionAppeal(
  from: AppealStatus,
  to: AppealStatus,
): boolean {
  return APPEAL_TRANSITIONS[from].includes(to);
}

/** Upheld-strike count at which publishing auto-pauses. */
export function shouldAutoPause(upheldCount: number): boolean {
  return upheldCount >= REPEAT_INFRINGER_POLICY.strikesToPause;
}

function restHeaders(db: RightsDb): Record<string, string> {
  return {
    apikey: db.serviceKey,
    Authorization: `Bearer ${db.serviceKey}`,
    "Content-Type": "application/json",
  };
}

export async function createStrikeRow(
  db: RightsDb,
  row: {
    reporter_name: string;
    reporter_email: string;
    work_description: string;
    infringing_ref: string;
    accused_user_id: string | null;
  },
  fetchImpl: FetchImpl = fetch,
): Promise<StrikeRow> {
  const res = await fetchImpl(`${db.url}/rest/v1/clipper_strikes`, {
    method: "POST",
    headers: { ...restHeaders(db), Prefer: "return=representation" },
    body: JSON.stringify({ ...row, status: "submitted" }),
  });
  if (!res.ok) throw new Error(`Strike intake failed (HTTP ${res.status})`);
  const data = (await res.json()) as StrikeRow[];
  const created = data[0];
  if (!created) throw new Error("Strike intake returned no row");
  return created;
}

export async function listStrikeRows(
  db: RightsDb,
  fetchImpl: FetchImpl = fetch,
): Promise<StrikeRow[]> {
  const res = await fetchImpl(
    `${db.url}/rest/v1/clipper_strikes?order=created_at.desc&select=*`,
    { headers: restHeaders(db) },
  );
  if (!res.ok) throw new Error(`Strike list failed (HTTP ${res.status})`);
  return (await res.json()) as StrikeRow[];
}

export async function updateStrikeRow(
  db: RightsDb,
  id: string,
  patch: { status: StrikeStatus; admin_note: string | null },
  fetchImpl: FetchImpl = fetch,
): Promise<StrikeRow> {
  const res = await fetchImpl(
    `${db.url}/rest/v1/clipper_strikes?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { ...restHeaders(db), Prefer: "return=representation" },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new Error(`Strike update failed (HTTP ${res.status})`);
  const data = (await res.json()) as StrikeRow[];
  const updated = data[0];
  if (!updated) throw new Error("Strike update returned no row");
  return updated;
}

export async function createAppealRow(
  db: RightsDb,
  row: {
    strike_id: string;
    appellant_name: string;
    appellant_email: string;
    reason: string;
  },
  fetchImpl: FetchImpl = fetch,
): Promise<AppealRow> {
  const res = await fetchImpl(`${db.url}/rest/v1/clipper_appeals`, {
    method: "POST",
    headers: { ...restHeaders(db), Prefer: "return=representation" },
    body: JSON.stringify({ ...row, status: "submitted" }),
  });
  if (!res.ok) throw new Error(`Appeal intake failed (HTTP ${res.status})`);
  const data = (await res.json()) as AppealRow[];
  const created = data[0];
  if (!created) throw new Error("Appeal intake returned no row");
  return created;
}

export async function listAppealRows(
  db: RightsDb,
  strikeId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<AppealRow[]> {
  const res = await fetchImpl(
    `${db.url}/rest/v1/clipper_appeals?strike_id=eq.${encodeURIComponent(strikeId)}&order=created_at.desc&select=*`,
    { headers: restHeaders(db) },
  );
  if (!res.ok) throw new Error(`Appeal list failed (HTTP ${res.status})`);
  return (await res.json()) as AppealRow[];
}

export async function updateAppealRow(
  db: RightsDb,
  id: string,
  patch: { status: AppealStatus; admin_note: string | null },
  fetchImpl: FetchImpl = fetch,
): Promise<AppealRow> {
  const res = await fetchImpl(
    `${db.url}/rest/v1/clipper_appeals?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { ...restHeaders(db), Prefer: "return=representation" },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new Error(`Appeal update failed (HTTP ${res.status})`);
  const data = (await res.json()) as AppealRow[];
  const updated = data[0];
  if (!updated) throw new Error("Appeal update returned no row");
  return updated;
}

/** Set the publishing-paused flag on a user row (admin action). */
export async function setPublishingPaused(
  db: RightsDb,
  userId: string,
  paused: boolean,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  const res = await fetchImpl(
    `${db.url}/rest/v1/clipper_users?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: restHeaders(db),
      body: JSON.stringify({ publishing_paused: paused }),
    },
  );
  if (!res.ok) {
    throw new Error(`Pause flag update failed (HTTP ${res.status})`);
  }
}

/**
 * Enforcement hook for Phase 3: returns true when the account may NOT
 * publish (flag set, or upheld strikes at/above the pause threshold).
 * Without a database it returns false — the pause cannot be enforced
 * server-side until database setup lands, and the checklist UI says so.
 */
export async function isPublishingPaused(
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<boolean> {
  const db = resolveRightsDb();
  if (!db) return false;
  const headers = {
    apikey: db.serviceKey,
    Authorization: `Bearer ${db.serviceKey}`,
  };
  const userRes = await fetchImpl(
    `${db.url}/rest/v1/clipper_users?id=eq.${encodeURIComponent(userId)}&select=publishing_paused`,
    { headers },
  );
  if (!userRes.ok) throw new Error("Pause lookup failed");
  const users = (await userRes.json()) as { publishing_paused: boolean }[];
  if (users[0]?.publishing_paused) return true;
  const strikesRes = await fetchImpl(
    `${db.url}/rest/v1/clipper_strikes?accused_user_id=eq.${encodeURIComponent(userId)}&status=eq.upheld&select=id`,
    { headers },
  );
  if (!strikesRes.ok) throw new Error("Strike count lookup failed");
  const upheld = (await strikesRes.json()) as unknown[];
  return shouldAutoPause(upheld.length);
}

/** Re-export for callers that only need the resolver. */
export { resolveRightsDb };
