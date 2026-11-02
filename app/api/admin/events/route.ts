import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import { listAudit } from "@/lib/admin/audit";
import { sseHeaders, formatSseEvent, sseMaxSeconds } from "@/lib/admin/sse";

/**
 * GET /api/admin/events — server-sent-events feed of recent audit
 * entries for the admin console (console roles only). Emits the most
 * recent entries as frames, then a heartbeat comment every 25 seconds,
 * then closes after ADMIN_SSE_MAX_SECONDS (default 60). The feed is
 * a snapshot of already-recorded audit rows, not a live push — new
 * entries appear on the next connection. 503 without a database.
 */
export async function GET(req: Request) {
  const { errorResponse } = await adminGate(req, CONSOLE_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveAdminDb();
  if (!db) {
    return new Response(
      JSON.stringify({ error: "The admin database is not configured yet." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  let entries: Awaited<ReturnType<typeof listAudit>> = [];
  try {
    entries = await listAudit(db, { limit: 50 });
  } catch {
    return new Response(
      JSON.stringify({ error: "Event feed failed. Check the admin database configuration." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const maxSeconds = sseMaxSeconds();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const e of entries) {
        controller.enqueue(encoder.encode(formatSseEvent(e) + "\n"));
      }
      if (maxSeconds <= 0) {
        controller.close();
        return;
      }
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 25_000);
      timer = setTimeout(() => {
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }, maxSeconds * 1000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (timer) clearTimeout(timer);
    },
  });
  return new Response(stream, { headers: sseHeaders() });
}
