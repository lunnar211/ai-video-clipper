/**
 * Break-glass content access (ClipForge Phase 4).
 *
 * Admins NEVER see video content, transcripts, or tokens by default.
 * When an admin genuinely needs to inspect one project or clip record,
 * they file a reasoned break-glass request: the grant records the
 * admin, the item type + id, the reason, and an expiry, and the
 * request itself is audit-logged. The grant is single-use and
 * short-lived. Fetching through a grant returns SAFE COLUMNS ONLY
 * (id, title, timestamps, clip start/end) — transcripts and video
 * bytes are never stored server-side, and the item's content is
 * never copied into the audit log (only its id is recorded).
 */

import { z } from "zod";

export const BREAKGLASS_TTL_MS = 15 * 60 * 1000;

export const breakglassRequestSchema = z.object({
  itemType: z.enum(["project", "clip"]),
  itemId: z.string().min(1).max(200),
  reason: z.string().min(10).max(500),
});

/** True when a grant is still usable (unused + unexpired). */
export function breakglassGrantUsable(grant: {
  used_at: string | null;
  expires_at: string;
}): boolean {
  if (grant.used_at) return false;
  return Date.parse(grant.expires_at) > Date.now();
}
