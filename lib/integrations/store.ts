/**
 * Phase 5 storage helpers (PostgREST pattern, mirroring
 * lib/admin/store.ts: server-side reads/writes through PostgREST with
 * the service-role key, injectable fetch for tests, honest null when
 * the database is not configured).
 *
 * Secrets (webhook signing secrets, SSO client secrets, integration
 * config secrets) are stored ENCRYPTED via the Phase 3 envelope and
 * are never selected into public shapes: list functions select safe
 * columns only, and the *_enc columns are read only by the server
 * code that needs to sign or decrypt (dispatch, SSO verification).
 * API key hashes are never selected into list shapes either.
 */

import type { FetchImpl } from "@/lib/ai/providers";
import type { EncryptedToken } from "@/lib/publish/tokens";
import {
  resolveRightsDb,
  restHeaders,
  type RightsDb,
} from "@/lib/rights/declarations";
import type { DomainEventName } from "./events";

export type IntegrationDb = RightsDb;

export function resolveIntegrationDb(): IntegrationDb | null {
  return resolveRightsDb();
}

async function postRow<T>(
  db: IntegrationDb,
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
  db: IntegrationDb,
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
  db: IntegrationDb,
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

async function deleteRows(
  db: IntegrationDb,
  table: string,
  query: string,
  fetchImpl: FetchImpl,
): Promise<number> {
  const res = await fetchImpl(`${db.url}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { ...restHeaders(db), Prefer: "return=representation" },
  });
  if (!res.ok) throw new Error(`${table} delete failed (HTTP ${res.status})`);
  const rows = (await res.json().catch(() => [])) as unknown[];
  return Array.isArray(rows) ? rows.length : 0;
}

/* ------------------------------------------------------------------ */
/* Integration instances (per user, per registry entry).               */
/* ------------------------------------------------------------------ */

export type IntegrationInstanceRow = {
  id: string;
  user_id: string;
  integration_id: string;
  enabled: boolean;
  config_public: Record<string, unknown>;
  created_at: string;
};

export async function listIntegrationInstances(
  db: IntegrationDb,
  userId: string | null,
  fetchImpl: FetchImpl = fetch,
): Promise<IntegrationInstanceRow[]> {
  const filter = userId
    ? `user_id=eq.${encodeURIComponent(userId)}&`
    : "";
  return getRows(
    db,
    "clipper_integrations",
    `${filter}select=id,user_id,integration_id,enabled,config_public,created_at&order=created_at.desc`,
    fetchImpl,
  );
}

export async function upsertIntegrationInstance(
  db: IntegrationDb,
  row: {
    user_id: string;
    integration_id: string;
    enabled: boolean;
    config_public: Record<string, unknown>;
    config_enc: EncryptedToken | null;
    key_id: string | null;
  },
  fetchImpl: FetchImpl = fetch,
): Promise<IntegrationInstanceRow> {
  const res = await fetchImpl(
    `${db.url}/rest/v1/clipper_integrations?on_conflict=user_id,integration_id`,
    {
      method: "POST",
      headers: {
        ...restHeaders(db),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    },
  );
  if (!res.ok) {
    throw new Error(`Integration upsert failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as IntegrationInstanceRow[];
  const created = data[0];
  if (!created) throw new Error("Integration upsert returned no row");
  return created;
}

/* ------------------------------------------------------------------ */
/* Webhook endpoints (signing secret stored ENCRYPTED; list shapes     */
/* never include it).                                                  */
/* ------------------------------------------------------------------ */

export type WebhookEndpointRow = {
  id: string;
  user_id: string;
  url: string;
  events: DomainEventName[];
  secret_enc: EncryptedToken;
  key_id: string;
  active: boolean;
  created_at: string;
};

export type WebhookEndpointPublic = Omit<
  WebhookEndpointRow,
  "secret_enc" | "key_id"
>;

export function toWebhookEndpointPublic(
  row: WebhookEndpointRow,
): WebhookEndpointPublic {
  // Explicit field pick (not rest-destructure): the secret columns
  // must never appear in a public shape, by construction.
  return {
    id: row.id,
    user_id: row.user_id,
    url: row.url,
    events: row.events,
    active: row.active,
    created_at: row.created_at,
  };
}

export async function listWebhookEndpoints(
  db: IntegrationDb,
  userId: string | null,
  fetchImpl: FetchImpl = fetch,
): Promise<WebhookEndpointPublic[]> {
  const filter = userId
    ? `user_id=eq.${encodeURIComponent(userId)}&`
    : "";
  const rows = await getRows<WebhookEndpointRow>(
    db,
    "clipper_webhook_endpoints",
    `${filter}select=id,user_id,url,events,active,created_at&order=created_at.desc`,
    fetchImpl,
  );
  return rows;
}

export async function createWebhookEndpoint(
  db: IntegrationDb,
  row: Omit<WebhookEndpointRow, "id" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<WebhookEndpointRow> {
  return postRow(db, "clipper_webhook_endpoints", row, fetchImpl);
}

export async function getWebhookEndpoint(
  db: IntegrationDb,
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<WebhookEndpointRow | null> {
  const rows = await getRows<WebhookEndpointRow>(
    db,
    "clipper_webhook_endpoints",
    `id=eq.${encodeURIComponent(id)}`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

export async function getWebhookDeliveryById(
  db: IntegrationDb,
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<WebhookDeliveryRow | null> {
  const rows = await getRows<WebhookDeliveryRow>(
    db,
    "clipper_webhook_deliveries",
    `id=eq.${encodeURIComponent(id)}`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

export async function deleteWebhookEndpoint(
  db: IntegrationDb,
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  await deleteRows(
    db,
    "clipper_webhook_endpoints",
    `id=eq.${encodeURIComponent(id)}`,
    fetchImpl,
  );
}

/* ------------------------------------------------------------------ */
/* Webhook deliveries (log rows; payload is sanitized at write time).  */
/* ------------------------------------------------------------------ */

export type WebhookDeliveryRow = {
  id: string;
  endpoint_id: string;
  event: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
};

export async function listWebhookDeliveries(
  db: IntegrationDb,
  endpointId: string | null,
  fetchImpl: FetchImpl = fetch,
): Promise<WebhookDeliveryRow[]> {
  const filter = endpointId
    ? `endpoint_id=eq.${encodeURIComponent(endpointId)}&`
    : "";
  return getRows(
    db,
    "clipper_webhook_deliveries",
    `${filter}order=created_at.desc&limit=200`,
    fetchImpl,
  );
}

export async function createWebhookDelivery(
  db: IntegrationDb,
  row: Omit<WebhookDeliveryRow, "id" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<WebhookDeliveryRow> {
  return postRow(db, "clipper_webhook_deliveries", row, fetchImpl);
}

export async function updateWebhookDelivery(
  db: IntegrationDb,
  id: string,
  patch: Partial<
    Pick<
      WebhookDeliveryRow,
      "status" | "attempts" | "next_attempt_at" | "last_error"
    >
  >,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  await patchRow(db, "clipper_webhook_deliveries", id, patch, fetchImpl);
}

/* ------------------------------------------------------------------ */
/* API keys (only the hash is stored; list shapes never include it).   */
/* ------------------------------------------------------------------ */

export type ApiKeyRow = {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

export type ApiKeyPublic = Omit<ApiKeyRow, "key_hash">;

export function toApiKeyPublic(row: ApiKeyRow): ApiKeyPublic {
  // Explicit field pick (not rest-destructure): the key hash must
  // never appear in a public shape, by construction.
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    key_prefix: row.key_prefix,
    scopes: row.scopes,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
  };
}

export async function listApiKeys(
  db: IntegrationDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ApiKeyPublic[]> {
  const rows = await getRows<ApiKeyRow>(
    db,
    "clipper_api_keys",
    `user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,name,key_prefix,scopes,revoked_at,last_used_at,created_at&order=created_at.desc`,
    fetchImpl,
  );
  return rows.map(toApiKeyPublic);
}

export async function createApiKeyRow(
  db: IntegrationDb,
  row: Omit<ApiKeyRow, "id" | "revoked_at" | "last_used_at" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<ApiKeyRow> {
  return postRow(db, "clipper_api_keys", row, fetchImpl);
}

export async function findApiKeyByPrefix(
  db: IntegrationDb,
  keyPrefix: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ApiKeyRow | null> {
  const rows = await getRows<ApiKeyRow>(
    db,
    "clipper_api_keys",
    `key_prefix=eq.${encodeURIComponent(keyPrefix)}`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

export async function revokeApiKeyRow(
  db: IntegrationDb,
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  await patchRow(db, "clipper_api_keys", id, {
    revoked_at: new Date().toISOString(),
  }, fetchImpl);
}

export async function touchApiKeyLastUsed(
  db: IntegrationDb,
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  try {
    await patchRow(db, "clipper_api_keys", id, {
      last_used_at: new Date().toISOString(),
    }, fetchImpl);
  } catch {
    // Last-used tracking must never break an API call.
  }
}

/* ------------------------------------------------------------------ */
/* SSO configs (secrets stored ENCRYPTED; public shape excludes them). */
/* ------------------------------------------------------------------ */

export type SsoConfigRow = {
  id: string;
  user_id: string;
  provider: string;
  config_public: Record<string, unknown>;
  secret_enc: EncryptedToken | null;
  key_id: string | null;
  enabled: boolean;
  created_at: string;
};

export async function getSsoConfig(
  db: IntegrationDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<SsoConfigRow | null> {
  const rows = await getRows<SsoConfigRow>(
    db,
    "clipper_sso_configs",
    `user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,provider,config_public,enabled,created_at`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

export async function upsertSsoConfig(
  db: IntegrationDb,
  row: Omit<SsoConfigRow, "id" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<SsoConfigRow> {
  const res = await fetchImpl(
    `${db.url}/rest/v1/clipper_sso_configs?on_conflict=user_id`,
    {
      method: "POST",
      headers: {
        ...restHeaders(db),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    },
  );
  if (!res.ok) throw new Error(`SSO upsert failed (HTTP ${res.status})`);
  const data = (await res.json()) as SsoConfigRow[];
  const created = data[0];
  if (!created) throw new Error("SSO upsert returned no row");
  return created;
}

/* ------------------------------------------------------------------ */
/* GDPR helpers: safe-selected reads + ordered deletes.                */
/* ------------------------------------------------------------------ */

export async function readGdprTable(
  db: IntegrationDb,
  table: string,
  userColumn: string,
  userId: string,
  select: string,
  fetchImpl: FetchImpl = fetch,
): Promise<Record<string, unknown>[]> {
  return getRows(
    db,
    table,
    `${userColumn}=eq.${encodeURIComponent(userId)}&select=${select}`,
    fetchImpl,
  );
}

export async function deleteGdprTable(
  db: IntegrationDb,
  table: string,
  userColumn: string,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<number> {
  return deleteRows(
    db,
    table,
    `${userColumn}=eq.${encodeURIComponent(userId)}`,
    fetchImpl,
  );
}
