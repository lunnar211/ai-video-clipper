/**
 * Shared "storage not configured" message (ClipForge Phase 10).
 *
 * Lives in its own tiny module so BOTH the server routes (which return
 * it with HTTP 503) and the browser staging wrapper (which matches on
 * it to fall back honestly) use one identical string — without the
 * browser importing the server storage module. The message text is
 * unchanged from Phase 1; only its home moved.
 */
export const STORAGE_NOT_CONFIGURED =
  "Cloud storage is not connected yet — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET, then retry.";
