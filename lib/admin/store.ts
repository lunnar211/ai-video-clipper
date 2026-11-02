/**
 * Admin storage helpers (ClipForge Phase 4, PostgREST pattern).
 *
 * Mirrors lib/publish/store.ts: server-side reads/writes through
 * PostgREST with the service-role key, injectable fetch for tests,
 * honest null when the database is not configured (resolved by the
 * routes). Nothing here returns tokens, transcripts, or video bytes:
 * account rows are stripped to status-only fields before they leave
 * the server, and break-glass fetches select only safe columns.
 */

import type { FetchImpl } from "@/lib/ai/providers";
import {
  resolveRightsDb,
  restHeaders,
  type RightsDb,
} from "@/lib/rights/declarations";
import type { PublishAccountPublic } from "@/lib/publish/store";

export type AdminDb = RightsDb;

export function resolveAdminDb(): AdminDb | null {
  return resolveRightsDb();
}

async function postRow<T>(
  db: AdminDb,
  table: string,
  row: Record<string, unknown>,
  fetchImpl: FetchImpl,
): Promise<T> {
  const res = await fetchImpl(`${db.url}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...restHeaders(db), Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`${table} insert failed (HTTP ${res.status})`);
  const data = (await res.json()) as T[];
  const created = data[0];
  if (!created) throw new Error(`${table} insert returned no row`);
  return created;
}

async function getRows<T>(
  db: AdminDb,
  table: string,
  query: string,
  fetchImpl: FetchImpl,
): Promise<T[]> {
  const res = await fetchImpl(`${db.url}/rest/v1/${table}?${query}`, {
    headers: restHeaders(db),
  });
  if (!res.ok) throw new Error(`${table} read failed (HTTP ${res.status})`);
  return (await res.json()) as T[];
}

async function patchRow(
  db: AdminDb,
  table: string,
  id: string,
  patch: Record<string, unknown>,
  fetchImpl: FetchImpl,
): Promise<void> {
  const res = await fetchImpl(
    `${db.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: restHeaders(db),
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new Error(`${table} update failed (HTTP ${res.status})`);
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export type AdminUserRow = {
  id: string;
  email: string;
  plan: string;
  role: string;
  status: string;
  publishing_paused: boolean;
  created_at: string;
};

export async function listUserRows(
  db: AdminDb,
  fetchImpl: FetchImpl = fetch,
): Promise<AdminUserRow[]> {
  return getRows(db, "clipper_users", "order=created_at.desc&limit=200", fetchImpl);
}

export async function getUserRow(
  db: AdminDb,
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<AdminUserRow | null> {
  const rows = await getRows<AdminUserRow>(
    db,
    "clipper_users",
    `id=eq.${encodeURIComponent(id)}`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

export async function setUserStatus(
  db: AdminDb,
  id: string,
  status: "active" | "suspended",
  reason: string | null,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  await patchRow(db, "clipper_users", id, {
    status,
    suspended_reason: reason,
  }, fetchImpl);
}

/* ------------------------------------------------------------------ */
/* Support notes (admin-authored, attributed, timestamped; insert +    */
/* list only — notes are never edited or deleted).                     */
/* ------------------------------------------------------------------ */

export type SupportNoteRow = {
  id: string;
  user_id: string;
  admin_id: string;
  note: string;
  created_at: string;
};

export async function createSupportNote(
  db: AdminDb,
  row: Omit<SupportNoteRow, "id" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<SupportNoteRow> {
  return postRow(db, "clipper_support_notes", row, fetchImpl);
}

export async function listSupportNotes(
  db: AdminDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<SupportNoteRow[]> {
  return getRows(
    db,
    "clipper_support_notes",
    `user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
    fetchImpl,
  );
}

/* ------------------------------------------------------------------ */
/* Credit adjustments (insert + list only; each row carries a reason   */
/* and is audit-logged by the route that creates it).                  */
/* ------------------------------------------------------------------ */

export type CreditAdjustmentRow = {
  id: string;
  user_id: string;
  admin_id: string;
  delta_clips: number;
  reason: string;
  created_at: string;
};

export async function createCreditAdjustment(
  db: AdminDb,
  row: Omit<CreditAdjustmentRow, "id" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<CreditAdjustmentRow> {
  return postRow(db, "clipper_credit_adjustments", row, fetchImpl);
}

export async function listCreditAdjustments(
  db: AdminDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<CreditAdjustmentRow[]> {
  return getRows(
    db,
    "clipper_credit_adjustments",
    `user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
    fetchImpl,
  );
}

/** Sum of granted clip credits for a user. */
export function creditBalance(adjustments: CreditAdjustmentRow[]): number {
  return adjustments.reduce((sum, row) => sum + row.delta_clips, 0);
}

/* ------------------------------------------------------------------ */
/* Impersonation sessions (start + end only; the marker cookie is     */
/* verified cryptographically, the row is the audit trail).            */
/* ------------------------------------------------------------------ */

export type ImpersonationRow = {
  id: string;
  admin_id: string;
  target_user_id: string;
  reason: string;
  started_at: string;
  ended_at: string | null;
};

export async function createImpersonationRow(
  db: AdminDb,
  row: Omit<ImpersonationRow, "id" | "started_at" | "ended_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<ImpersonationRow> {
  return postRow(db, "clipper_impersonation_sessions", row, fetchImpl);
}

export async function endImpersonationRow(
  db: AdminDb,
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  await patchRow(db, "clipper_impersonation_sessions", id, {
    ended_at: new Date().toISOString(),
  }, fetchImpl);
}

/* ------------------------------------------------------------------ */
/* Break-glass grants (single-use, short expiry; the grant authorizes  */
/* one fetch of one safe-column row — never a transcript or video).    */
/* ------------------------------------------------------------------ */

export type BreakglassGrantRow = {
  id: string;
  admin_id: string;
  item_type: "project" | "clip";
  item_id: string;
  reason: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

export async function createBreakglassGrant(
  db: AdminDb,
  row: Omit<BreakglassGrantRow, "id" | "used_at" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<BreakglassGrantRow> {
  return postRow(db, "clipper_breakglass_grants", row, fetchImpl);
}

export async function getBreakglassGrant(
  db: AdminDb,
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<BreakglassGrantRow | null> {
  const rows = await getRows<BreakglassGrantRow>(
    db,
    "clipper_breakglass_grants",
    `id=eq.${encodeURIComponent(id)}`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

export async function consumeBreakglassGrant(
  db: AdminDb,
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  await patchRow(db, "clipper_breakglass_grants", id, {
    used_at: new Date().toISOString(),
  }, fetchImpl);
}

/**
 * Fetch a break-glass item by safe columns ONLY. Project rows return
 * id/title/created_at; clip rows return id/title/start/end/created_at.
 * Metadata jsonb (which could carry generated copy) and any media
 * keys are deliberately excluded, and transcripts/video bytes are
 * never stored server-side in the first place.
 */
export async function fetchBreakglassItem(
  db: AdminDb,
  itemType: "project" | "clip",
  itemId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<Record<string, unknown> | null> {
  const table =
    itemType === "project" ? "clipper_projects" : "clipper_clips";
  const select =
    itemType === "project"
      ? "id,title,created_at"
      : "id,title,start_seconds,end_seconds,created_at";
  const rows = await getRows<Record<string, unknown>>(
    db,
    table,
    `id=eq.${encodeURIComponent(itemId)}&select=${select}`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Admin alerts (evaluation results; insert + list only).              */
/* ------------------------------------------------------------------ */

export type AdminAlertRow = {
  id: string;
  rule: string;
  severity: string;
  detail: string;
  created_at: string;
};

export async function createAdminAlert(
  db: AdminDb,
  row: Omit<AdminAlertRow, "id" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<AdminAlertRow> {
  return postRow(db, "clipper_admin_alerts", row, fetchImpl);
}

export async function listAdminAlerts(
  db: AdminDb,
  fetchImpl: FetchImpl = fetch,
): Promise<AdminAlertRow[]> {
  return getRows(
    db,
    "clipper_admin_alerts",
    "order=created_at.desc&limit=100",
    fetchImpl,
  );
}

/* ------------------------------------------------------------------ */
/* Drill-down source rows (status-only accounts; never token rows).    */
/* ------------------------------------------------------------------ */

export type DrillProjectRow = {
  id: string;
  title: string;
  created_at: string;
};

export type DrillClipRow = {
  id: string;
  title: string;
  start_seconds: number;
  end_seconds: number;
  created_at: string;
};

export type DrillPostRow = {
  id: string;
  clip_ref: string;
  status: string;
  schedule_at: string | null;
  created_at: string;
};

export async function listUserProjects(
  db: AdminDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<DrillProjectRow[]> {
  return getRows(
    db,
    "clipper_projects",
    `user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
    fetchImpl,
  );
}

export async function listUserClips(
  db: AdminDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<DrillClipRow[]> {
  return getRows(
    db,
    "clipper_clips",
    `user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
    fetchImpl,
  );
}

export async function listUserPosts(
  db: AdminDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<DrillPostRow[]> {
  return getRows(
    db,
    "publish_posts",
    `user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
    fetchImpl,
  );
}

export async function listUserAccounts(
  db: AdminDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<PublishAccountPublic[]> {
  const rows = await getRows<{
    id: string;
    platform: string;
    account_label: string;
    scopes: string[];
    token_expires_at: string | null;
    status: string;
  }>(
    db,
    "publish_accounts",
    `user_id=eq.${encodeURIComponent(userId)}&select=id,platform,account_label,scopes,token_expires_at,status&order=created_at.desc`,
    fetchImpl,
  );
  // The select already excludes token columns; this mapping is the
  // second line of defence — only status fields ever leave the server.
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform as PublishAccountPublic["platform"],
    account_label: r.account_label,
    scopes: r.scopes,
    token_expires_at: r.token_expires_at,
    status: r.status,
  }));
}
