/**
 * Per-project ownership declarations (ClipForge Phase 2).
 *
 * A declaration is the user's own statement that they own or hold a
 * licence for a video and its music. It is IMMUTABLE: the table only
 * ever gains rows (see supabase/migrations/002_clipforge_phase2.sql —
 * RLS allows INSERT and SELECT, and deliberately has NO UPDATE or
 * DELETE policy, so no API path can rewrite or erase a record).
 *
 * Two modes, stated honestly everywhere:
 * - Database configured: POST /api/rights/declarations stores the
 *   record server-side (user id, IP, timestamp, project id, text
 *   version) and GET answers the gate from that record.
 * - No database: the existing session checkbox keeps working exactly
 *   as before, and the UI labels it a session-only record. Nothing
 *   here ever claims immutable storage when no database exists.
 */

import { z } from "zod";
import { getKey, type FetchImpl } from "@/lib/ai/providers";

/** Current declaration text version. Bump when the wording changes. */
export const DECLARATION_TEXT_VERSION = "2026-11-02-v1";

/** The exact sentence the user accepts. Must match the checkbox copy. */
export const DECLARATION_TEXT =
  "I own or have licensed this video and its music.";

export const declarationSchema = z.object({
  projectId: z.string().min(1).max(200),
  declarationTextVersion: z.string().min(1).max(100),
});

export type DeclarationRow = {
  id: string;
  user_id: string | null;
  project_id: string;
  ip: string | null;
  user_agent: string | null;
  declaration_text: string;
  declaration_text_version: string;
  accepted_at: string;
};

export type RightsDb = { url: string; serviceKey: string };

/** Resolve the rights database, or null when it is not configured. */
export function resolveRightsDb(): RightsDb | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = getKey("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function restHeaders(db: RightsDb): Record<string, string> {
  return {
    apikey: db.serviceKey,
    Authorization: `Bearer ${db.serviceKey}`,
    "Content-Type": "application/json",
  };
}

export async function createDeclarationRow(
  db: RightsDb,
  row: {
    user_id: string | null;
    project_id: string;
    ip: string | null;
    user_agent: string | null;
    declaration_text: string;
    declaration_text_version: string;
  },
  fetchImpl: FetchImpl = fetch,
): Promise<DeclarationRow> {
  const res = await fetchImpl(`${db.url}/rest/v1/clipper_declarations`, {
    method: "POST",
    headers: { ...restHeaders(db), Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`Declaration storage failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as DeclarationRow[];
  const created = data[0];
  if (!created) throw new Error("Declaration storage returned no row");
  return created;
}

export async function getDeclarationRow(
  db: RightsDb,
  projectId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<DeclarationRow | null> {
  const res = await fetchImpl(
    `${db.url}/rest/v1/clipper_declarations?project_id=eq.${encodeURIComponent(projectId)}&order=accepted_at.desc&limit=1&select=*`,
    { headers: restHeaders(db) },
  );
  if (!res.ok) {
    throw new Error(`Declaration lookup failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as DeclarationRow[];
  return data[0] ?? null;
}

/** Gate answer: a project is declared when a record exists for it. */
export function declarationSatisfied(
  row: DeclarationRow | null,
): boolean {
  return row !== null;
}
