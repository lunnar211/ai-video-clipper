/**
 * Public share links (DB-backed, honest degradation).
 *
 * A share row lives in `clipper_shares` (see
 * supabase/migrations/001_clipforge_phase1.sql). Without a configured
 * database (Supabase URL + service-role key), creation honestly 503s
 * with setup instructions — view counts are never invented. Tokens are
 * random; share URLs are unguessable but public to anyone with the
 * link, and the embed page says so.
 */

import { getKey, type FetchImpl } from "@/lib/ai/providers";

export type ShareRow = {
  token: string;
  title: string;
  video_url: string | null;
  clip_start: number;
  clip_end: number;
  views: number;
};

export type ShareDb = { url: string; serviceKey: string };

/** Resolve the share database, or null when it is not configured. */
export function resolveShareDb(): ShareDb | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = getKey("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

/** Random unguessable token (24 hex chars). */
export function newShareToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function shareUrl(base: string, token: string): string {
  return `${base.replace(/\/$/, "")}/share/${token}`;
}

function restHeaders(db: ShareDb): Record<string, string> {
  return {
    apikey: db.serviceKey,
    Authorization: `Bearer ${db.serviceKey}`,
    "Content-Type": "application/json",
  };
}

export async function createShareRow(
  db: ShareDb,
  row: Omit<ShareRow, "views"> & { views?: number },
  fetchImpl: FetchImpl = fetch,
): Promise<ShareRow> {
  const res = await fetchImpl(`${db.url}/rest/v1/clipper_shares`, {
    method: "POST",
    headers: { ...restHeaders(db), Prefer: "return=representation" },
    body: JSON.stringify({ ...row, views: row.views ?? 0 }),
  });
  if (!res.ok) throw new Error(`Share creation failed (HTTP ${res.status})`);
  const data = (await res.json()) as ShareRow[];
  const created = data[0];
  if (!created) throw new Error("Share creation returned no row");
  return created;
}

export async function getShareRow(
  db: ShareDb,
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ShareRow | null> {
  const res = await fetchImpl(
    `${db.url}/rest/v1/clipper_shares?token=eq.${encodeURIComponent(token)}&select=*`,
    { headers: restHeaders(db) },
  );
  if (!res.ok) throw new Error(`Share lookup failed (HTTP ${res.status})`);
  const data = (await res.json()) as ShareRow[];
  return data[0] ?? null;
}

export async function bumpShareViews(
  db: ShareDb,
  row: ShareRow,
  fetchImpl: FetchImpl = fetch,
): Promise<number> {
  const next = row.views + 1;
  const res = await fetchImpl(
    `${db.url}/rest/v1/clipper_shares?token=eq.${encodeURIComponent(row.token)}`,
    {
      method: "PATCH",
      headers: restHeaders(db),
      body: JSON.stringify({ views: next }),
    },
  );
  if (!res.ok) return row.views;
  return next;
}

export const SHARE_NOT_CONFIGURED =
  "Share links need the database — apply supabase/migrations/001_clipforge_phase1.sql in your Supabase project and set SUPABASE_SERVICE_ROLE_KEY, then retry.";
