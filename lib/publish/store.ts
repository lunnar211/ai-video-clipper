/**
 * Publish storage helpers (ClipForge Phase 3, PostgREST pattern).
 *
 * Mirrors lib/rights/*: server-side reads/writes through PostgREST
 * with the service-role key, injectable fetch for tests, honest null
 * when the database is not configured (resolved by the routes).
 * Token columns hold ENCRYPTED records (see lib/publish/tokens.ts) —
 * plaintext tokens are never written here, and rows returned to the
 * UI must be stripped to status-only fields by the routes.
 */

import type { FetchImpl } from "@/lib/ai/providers";
import {
  resolveRightsDb,
  restHeaders,
  type RightsDb,
} from "@/lib/rights/declarations";
import type { EncryptedToken } from "./tokens";
import type { PlatformId } from "./platforms";

export type PublishDb = RightsDb;

export function resolvePublishDb(): PublishDb | null {
  return resolveRightsDb();
}

async function postRow<T>(
  db: PublishDb,
  table: string,
  row: Record<string, unknown>,
  fetchImpl: FetchImpl,
): Promise<T> {
  const res = await fetchImpl(`${db.url}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...restHeaders(db), Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`${table} insert failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as T[];
  const created = data[0];
  if (!created) throw new Error(`${table} insert returned no row`);
  return created;
}

async function getRows<T>(
  db: PublishDb,
  table: string,
  query: string,
  fetchImpl: FetchImpl,
): Promise<T[]> {
  const res = await fetchImpl(`${db.url}/rest/v1/${table}?${query}`, {
    headers: restHeaders(db),
  });
  if (!res.ok) {
    throw new Error(`${table} read failed (HTTP ${res.status})`);
  }
  return (await res.json()) as T[];
}

async function patchRow(
  db: PublishDb,
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
  if (!res.ok) {
    throw new Error(`${table} update failed (HTTP ${res.status})`);
  }
}

async function deleteRow(
  db: PublishDb,
  table: string,
  id: string,
  fetchImpl: FetchImpl,
): Promise<void> {
  const res = await fetchImpl(
    `${db.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: restHeaders(db),
    },
  );
  if (!res.ok) {
    throw new Error(`${table} delete failed (HTTP ${res.status})`);
  }
}

export type PublishAccountRow = {
  id: string;
  user_id: string | null;
  platform: PlatformId;
  account_label: string;
  scopes: string[];
  access_token_enc: EncryptedToken;
  refresh_token_enc: EncryptedToken | null;
  token_expires_at: string | null;
  token_key_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

/** Status-only view of an account — safe to return to the UI. */
export type PublishAccountPublic = {
  id: string;
  platform: PlatformId;
  account_label: string;
  scopes: string[];
  token_expires_at: string | null;
  status: string;
};

export function toPublicAccount(row: PublishAccountRow): PublishAccountPublic {
  return {
    id: row.id,
    platform: row.platform,
    account_label: row.account_label,
    scopes: row.scopes,
    token_expires_at: row.token_expires_at,
    status: row.status,
  };
}

export async function createAccountRow(
  db: PublishDb,
  row: Omit<PublishAccountRow, "id" | "created_at" | "updated_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<PublishAccountRow> {
  return postRow(db, "publish_accounts", row, fetchImpl);
}

export async function listAccountRows(
  db: PublishDb,
  fetchImpl: FetchImpl = fetch,
): Promise<PublishAccountRow[]> {
  return getRows(db, "publish_accounts", "order=created_at.desc", fetchImpl);
}

export async function getAccountRow(
  db: PublishDb,
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<PublishAccountRow | null> {
  const rows = await getRows<PublishAccountRow>(
    db,
    "publish_accounts",
    `id=eq.${encodeURIComponent(id)}`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

export async function updateAccountTokens(
  db: PublishDb,
  id: string,
  patch: {
    access_token_enc: EncryptedToken;
    refresh_token_enc: EncryptedToken | null;
    token_expires_at: string | null;
    token_key_id: string;
  },
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  await patchRow(db, "publish_accounts", id, patch, fetchImpl);
}

export async function deleteAccountRow(
  db: PublishDb,
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  await deleteRow(db, "publish_accounts", id, fetchImpl);
}

export type PublishPostRow = {
  id: string;
  user_id: string | null;
  clip_ref: string;
  project_id: string;
  media_key: string | null;
  title: string | null;
  schedule_at: string | null;
  timezone: string | null;
  /** Stored pre-publish draft, re-evaluated at publish time. */
  pre_publish: Record<string, unknown> | null;
  /** Post ref of the Phase 2 checklist record for this post. */
  checklist_post_ref: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function createPostRow(
  db: PublishDb,
  row: Omit<PublishPostRow, "id" | "created_at" | "updated_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<PublishPostRow> {
  return postRow(db, "publish_posts", row, fetchImpl);
}

export async function listPostRows(
  db: PublishDb,
  fetchImpl: FetchImpl = fetch,
): Promise<PublishPostRow[]> {
  return getRows(db, "publish_posts", "order=schedule_at.asc.nullsfirst", fetchImpl);
}

export async function getPostRow(
  db: PublishDb,
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<PublishPostRow | null> {
  const rows = await getRows<PublishPostRow>(
    db,
    "publish_posts",
    `id=eq.${encodeURIComponent(id)}`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

export async function updatePostStatus(
  db: PublishDb,
  id: string,
  status: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  await patchRow(db, "publish_posts", id, { status }, fetchImpl);
}

export type PublishTargetRow = {
  id: string;
  post_id: string;
  platform: PlatformId;
  account_id: string;
  title: string | null;
  description: string;
  tags: string[];
  visibility: string;
  idempotency_key: string;
  status: string;
  provider_post_id: string | null;
  provider_url: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
};

export async function createTargetRows(
  db: PublishDb,
  rows: Omit<PublishTargetRow, "id" | "created_at" | "updated_at">[],
  fetchImpl: FetchImpl = fetch,
): Promise<PublishTargetRow[]> {
  const created: PublishTargetRow[] = [];
  for (const row of rows) {
    created.push(await postRow(db, "publish_targets", row, fetchImpl));
  }
  return created;
}

export async function listTargetRows(
  db: PublishDb,
  postId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<PublishTargetRow[]> {
  return getRows(
    db,
    "publish_targets",
    `post_id=eq.${encodeURIComponent(postId)}&order=created_at.asc`,
    fetchImpl,
  );
}

export async function updateTargetRow(
  db: PublishDb,
  id: string,
  patch: Partial<PublishTargetRow>,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  await patchRow(db, "publish_targets", id, patch, fetchImpl);
}

export type PublishAnalyticsRow = {
  id: string;
  post_id: string;
  target_id: string | null;
  platform: PlatformId;
  views: number;
  likes: number;
  comments: number;
  synced_at: string;
};

export async function upsertAnalyticsRow(
  db: PublishDb,
  row: Omit<PublishAnalyticsRow, "id" | "synced_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<PublishAnalyticsRow> {
  // PostgREST upsert on the unique (target_id, platform) pair.
  const res = await fetchImpl(`${db.url}/rest/v1/publish_analytics`, {
    method: "POST",
    headers: {
      ...restHeaders(db),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`publish_analytics upsert failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as PublishAnalyticsRow[];
  const created = data[0];
  if (!created) throw new Error("publish_analytics upsert returned no row");
  return created;
}

export async function listAnalyticsRows(
  db: PublishDb,
  fetchImpl: FetchImpl = fetch,
): Promise<PublishAnalyticsRow[]> {
  return getRows(db, "publish_analytics", "order=synced_at.desc", fetchImpl);
}

export type PublishNotificationRow = {
  id: string;
  user_id: string | null;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

export async function createNotificationRow(
  db: PublishDb,
  row: Omit<PublishNotificationRow, "id" | "read" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<PublishNotificationRow | null> {
  try {
    return await postRow(db, "publish_notifications", row, fetchImpl);
  } catch {
    // Notifications must never break publishing — the caller still
    // surfaces the failure in its own response.
    return null;
  }
}

export async function listNotificationRows(
  db: PublishDb,
  fetchImpl: FetchImpl = fetch,
): Promise<PublishNotificationRow[]> {
  return getRows(
    db,
    "publish_notifications",
    "order=created_at.desc&limit=50",
    fetchImpl,
  );
}
