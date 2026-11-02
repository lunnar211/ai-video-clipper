/**
 * Immutable audit log (ClipForge Phase 4).
 *
 * Every entry records who did what and when: actor, action, target,
 * metadata, IP, user-agent, timestamp. The table is APPEND-ONLY
 * through the app: this module only ever INSERTs and SELECTs audit
 * rows. The single deletion path is the retention purge
 * (purgeExpiredAudit), which only removes rows older than the
 * configured retention window, requires an admin caller, and writes
 * its own audit entry describing what it removed. There is no update
 * path and no other delete path.
 *
 * Safety: metadata is sanitized before storage — any key that looks
 * like a token, secret, password, transcript, or video payload is
 * dropped recursively, so the log can never become a leak channel.
 * Audit emission must never break a user flow: emitAuditSafe swallows
 * every error and scheduleAudit runs after the response when the
 * runtime supports it.
 */

import { z } from "zod";
import type { FetchImpl } from "@/lib/ai/providers";
import {
  resolveRightsDb,
  restHeaders,
  type RightsDb,
} from "@/lib/rights/declarations";

export const AUDIT_ACTIONS = [
  "auth.signup",
  "auth.login",
  "upload.created",
  "project.created",
  "ai.job_run",
  "clip.rendered",
  "account.linked",
  "account.unlinked",
  "post.scheduled",
  "post.published",
  "post.failed",
  "billing.checkout",
  "billing.event",
  "rights.declaration",
  "rights.fingerprint",
  "rights.checklist",
  "strike.created",
  "strike.reviewed",
  "strike.appeal",
  "admin.suspend",
  "admin.restore",
  "admin.credit_adjust",
  "admin.note",
  "admin.impersonate_start",
  "admin.impersonate_end",
  "admin.breakglass",
  "admin.audit_purge",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditEntrySchema = z.object({
  actor: z.string().min(1).max(200),
  action: z.string().min(1).max(100),
  target: z.string().max(500).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  ip: z.string().max(100).nullable(),
  user_agent: z.string().max(500).nullable(),
});

export type AuditEntryInput = z.infer<typeof auditEntrySchema>;

export type AuditEntry = AuditEntryInput & {
  id: string;
  created_at: string;
};

/** Keys that must never reach the audit log, at any depth. */
const FORBIDDEN_METADATA_KEYS = [
  "token",
  "secret",
  "password",
  "transcript",
  "video",
  "ciphertext",
  "access_token",
  "refresh_token",
  "api_key",
  "apikey",
];

function isForbiddenKey(key: string): boolean {
  const lower = key.toLowerCase();
  return FORBIDDEN_METADATA_KEYS.some(
    (bad) => lower === bad || lower.includes(bad),
  );
}

/** Recursively drop dangerous keys from audit metadata. */
export function sanitizeAuditMetadata(
  value: unknown,
): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (isForbiddenKey(key)) continue;
    if (
      entry !== null &&
      typeof entry === "object" &&
      !Array.isArray(entry)
    ) {
      out[key] = sanitizeAuditMetadata(entry);
    } else if (typeof entry === "string" && entry.length > 2000) {
      out[key] = entry.slice(0, 2000);
    } else {
      out[key] = entry;
    }
  }
  return out;
}

export function resolveAdminDb(): RightsDb | null {
  return resolveRightsDb();
}

/** INSERT an audit row. The only write path for audit entries. */
export async function recordAudit(
  db: RightsDb,
  entry: AuditEntryInput,
  fetchImpl: FetchImpl = fetch,
): Promise<AuditEntry> {
  const parsed = auditEntrySchema.safeParse(entry);
  if (!parsed.success) throw new Error("Invalid audit entry.");
  const row = {
    actor: parsed.data.actor,
    action: parsed.data.action,
    target: parsed.data.target,
    metadata: sanitizeAuditMetadata(parsed.data.metadata),
    ip: parsed.data.ip,
    user_agent: parsed.data.user_agent,
  };
  const res = await fetchImpl(`${db.url}/rest/v1/clipper_audit_log`, {
    method: "POST",
    headers: { ...restHeaders(db), Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Audit insert failed (HTTP ${res.status})`);
  const data = (await res.json()) as AuditEntry[];
  const created = data[0];
  if (!created) throw new Error("Audit insert returned no row");
  return created;
}

/**
 * Fire-and-forget audit emission for user flows. Never throws and
 * never changes the caller's response. When the database is not
 * configured it silently does nothing (the flow still works).
 */
export async function emitAuditSafe(
  entry: AuditEntryInput,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  try {
    const db = resolveAdminDb();
    if (!db) return;
    await recordAudit(db, entry, fetchImpl);
  } catch {
    // Audit must never break a user flow.
  }
}

/**
 * Schedule audit emission after the response when the runtime
 * supports next/server `after()`; otherwise emit in the background.
 * Never throws.
 */
export function scheduleAudit(entry: AuditEntryInput): void {
  try {
    // Dynamic import keeps vitest (no request scope) safe: if the
    // runtime has no `after`, fall back to a background emit.
    const afterFn = (
      globalThis as unknown as {
        __clipforgeAfter?: (fn: () => void | Promise<void>) => void;
      }
    ).__clipforgeAfter;
    if (afterFn) {
      afterFn(() => emitAuditSafe(entry));
      return;
    }
    void emitAuditSafe(entry);
  } catch {
    // Never break the caller.
  }
}

export type AuditFilter = {
  actor?: string;
  action?: string;
  target?: string;
  limit?: number;
  offset?: number;
};

export async function listAudit(
  db: RightsDb,
  filter: AuditFilter = {},
  fetchImpl: FetchImpl = fetch,
): Promise<AuditEntry[]> {
  const params = new URLSearchParams();
  params.set("order", "created_at.desc");
  params.set("limit", String(filter.limit ?? 100));
  if (filter.offset) params.set("offset", String(filter.offset));
  if (filter.actor) params.set("actor", `eq.${filter.actor}`);
  if (filter.action) params.set("action", `eq.${filter.action}`);
  if (filter.target) params.set("target", `eq.${filter.target}`);
  const res = await fetchImpl(
    `${db.url}/rest/v1/clipper_audit_log?${params.toString()}`,
    { headers: restHeaders(db) },
  );
  if (!res.ok) throw new Error(`Audit read failed (HTTP ${res.status})`);
  return (await res.json()) as AuditEntry[];
}

/** Retention window in days (config value; default 365). */
export function auditRetentionDays(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number.parseInt(env.ADMIN_AUDIT_RETENTION_DAYS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 365;
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV export of audit entries (header + one row per entry). */
export function auditToCsv(entries: AuditEntry[]): string {
  const header = "id,actor,action,target,ip,user_agent,created_at,metadata";
  const lines = entries.map((e) =>
    [
      e.id,
      e.actor,
      e.action,
      e.target ?? "",
      e.ip ?? "",
      e.user_agent ?? "",
      e.created_at,
      JSON.stringify(e.metadata ?? {}),
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...lines].join("\n");
}

/** JSON export of audit entries (pretty, for download). */
export function auditToJson(entries: AuditEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

/**
 * Retention purge: delete rows older than the retention window, then
 * write a purge audit entry describing the cutoff and the count.
 * This is the ONLY deletion path for audit rows, and it is itself
 * audited. Requires the caller to be an admin (enforced by routes).
 */
export async function purgeExpiredAudit(
  db: RightsDb,
  adminActor: string,
  nowMs = Date.now(),
  fetchImpl: FetchImpl = fetch,
): Promise<{ cutoff: string; deleted: number }> {
  const days = auditRetentionDays();
  const cutoff = new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString();
  const res = await fetchImpl(
    `${db.url}/rest/v1/clipper_audit_log?created_at=lt.${encodeURIComponent(cutoff)}`,
    {
      method: "DELETE",
      headers: { ...restHeaders(db), Prefer: "return=representation" },
    },
  );
  if (!res.ok) throw new Error(`Audit purge failed (HTTP ${res.status})`);
  const deletedRows = (await res.json().catch(() => [])) as unknown[];
  const deleted = Array.isArray(deletedRows) ? deletedRows.length : 0;
  await recordAudit(
    db,
    {
      actor: adminActor,
      action: "admin.audit_purge",
      target: null,
      metadata: { cutoff, retentionDays: days, deleted },
      ip: null,
      user_agent: null,
    },
    fetchImpl,
  );
  return { cutoff, deleted };
}
