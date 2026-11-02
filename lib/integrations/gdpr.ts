/**
 * GDPR export + deletion (ClipForge Phase 5).
 *
 * Export builds a downloadable archive of ALL of one user's data
 * across ClipForge tables — profile, projects, clips, posts,
 * declarations, credit adjustments, support notes, API keys, webhook
 * endpoints, and integration instances. The archive carries STATUS
 * AND METADATA ONLY: it never includes tokens, token material,
 * secrets, key hashes, transcripts, or video bytes, because those
 * either never leave the server (tokens) or are never stored
 * server-side (transcripts/video).
 *
 * Deletion is a documented cascade: child rows are deleted first,
 * then the user row. Two things are deliberately RETAINED and the
 * deletion response says so in plain words:
 * - clipper_audit_log rows (immutable history; retained per the
 *   Phase 4 retention policy, then purged by that policy).
 * - clipper_strikes rows naming the user (legal-hold records; a
 *   takedown history must survive the account that caused it).
 * Admins execute export/delete from the console (audited); end users
 * without a console role request it through support, which is why
 * the routes take an explicit target userId. A self-service portal
 * (signed-in user confirming their own deletion) is a documented
 * later-phase item, not faked here.
 */

export type GdprTableName =
  | "clipper_users"
  | "clipper_projects"
  | "clipper_clips"
  | "publish_posts"
  | "clipper_declarations"
  | "clipper_credit_adjustments"
  | "clipper_support_notes"
  | "clipper_api_keys"
  | "clipper_webhook_endpoints"
  | "clipper_integrations";

/** Tables deleted, in dependency order (children before the user row). */
export const GDPR_DELETION_ORDER: GdprTableName[] = [
  "clipper_api_keys",
  "clipper_webhook_endpoints",
  "clipper_integrations",
  "clipper_support_notes",
  "clipper_credit_adjustments",
  "clipper_declarations",
  "publish_posts",
  "clipper_clips",
  "clipper_projects",
  "clipper_users",
];

/** What deletion deliberately does NOT remove, and why. */
export const GDPR_RETAINED = [
  {
    table: "clipper_audit_log",
    reason:
      "Immutable audit history; retained per the Phase 4 retention policy, then purged by that policy.",
  },
  {
    table: "clipper_strikes",
    reason:
      "Legal-hold takedown records; the history of a strike must survive the account that caused it.",
  },
] as const;

/** Columns the export selects per table (safe columns only). */
export const GDPR_EXPORT_COLUMNS: Record<GdprTableName, string> = {
  clipper_users: "id,email,plan,role,status,created_at",
  clipper_projects: "id,title,created_at",
  clipper_clips: "id,title,start_seconds,end_seconds,created_at",
  publish_posts: "id,clip_ref,status,schedule_at,created_at",
  clipper_declarations: "id,project_id,accepted_at",
  clipper_credit_adjustments: "id,delta_clips,reason,created_at",
  clipper_support_notes: "id,note,created_at",
  // Prefix + scopes only — never the key hash, never a secret.
  clipper_api_keys: "id,name,key_prefix,scopes,revoked_at,last_used_at,created_at",
  // URL + events only — never the signing secret.
  clipper_webhook_endpoints: "id,url,events,active,created_at",
  // Registry key + enabled only — never encrypted config.
  clipper_integrations: "id,integration_id,enabled,created_at",
};

export type GdprArchive = {
  exportedAt: string;
  userId: string;
  tables: Partial<Record<GdprTableName, unknown[]>>;
  retained: typeof GDPR_RETAINED;
};

/** Assemble the archive from per-table rows (rows are already safe-selected). */
export function buildGdprArchive(
  userId: string,
  rows: Partial<Record<GdprTableName, unknown[]>>,
  nowIso = new Date().toISOString(),
): GdprArchive {
  const tables: Partial<Record<GdprTableName, unknown[]>> = {};
  for (const table of Object.keys(rows) as GdprTableName[]) {
    tables[table] = rows[table] ?? [];
  }
  return {
    exportedAt: nowIso,
    userId,
    tables,
    retained: [...GDPR_RETAINED],
  };
}
