/**
 * Temporary media lifecycle (ClipForge Phase 3).
 *
 * Clips staged for publishing live under the tmp/ prefix and must be
 * gone within 24 hours of publishing. Two mechanisms, both documented
 * in docs/PHASE3.md:
 *  1. Bucket lifecycle rule on the tmp/ prefix (24h expiry) — the
 *     primary guarantee; set it in the R2 dashboard (setup step).
 *  2. Immediate delete after a successful publish via a presigned
 *     DELETE (this module), best-effort — a failed delete never fails
 *     the publish, because the lifecycle rule still removes the key.
 */

import type { FetchImpl } from "@/lib/ai/providers";
import type { StorageProvider } from "@/lib/storage/r2";

export const TEMP_MEDIA_PREFIX = "tmp/publish/";
export const TEMP_MEDIA_TTL_HOURS = 24;

/** Temp key for a post's staged media. */
export function tempMediaKeyFor(postId: string): string {
  return `${TEMP_MEDIA_PREFIX}${postId}`;
}

/**
 * Delete a temp object now. Returns false (never throws) when storage
 * is unconfigured or the delete call fails — the lifecycle rule is
 * the backstop.
 */
export async function deleteTempMediaNow(
  storage: StorageProvider | null,
  key: string,
  fetchImpl: FetchImpl = fetch,
): Promise<boolean> {
  if (!storage || !storage.delete) return false;
  try {
    await storage.delete(key, fetchImpl);
    return true;
  } catch {
    return false;
  }
}
