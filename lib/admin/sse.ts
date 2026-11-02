/**
 * Admin real-time feed (ClipForge Phase 4, SSE).
 *
 * GET /api/admin/events returns a text/event-stream of recent audit
 * events, then heartbeats until a configured maximum stream lifetime.
 * Serverless functions cannot hold connections forever, so the stream
 * ends after ADMIN_SSE_MAX_SECONDS (default 60) and the console client
 * reconnects — the feed is real-time within that window, and the
 * limit is documented, not hidden. When the database is not
 * configured the stream sends a single setup event and closes.
 */

export function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
}

/** One SSE data frame for an audit-style event. */
export function formatSseEvent(event: {
  id: string;
  action: string;
  actor: string;
  created_at: string;
}): string {
  return `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Maximum stream lifetime in seconds (default 60; 0 = close at once). */
export function sseMaxSeconds(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number.parseInt(env.ADMIN_SSE_MAX_SECONDS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 60;
}
