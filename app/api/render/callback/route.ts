import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import {
  renderJobStatusSchema,
  verifyWorkerRequest,
} from "@/lib/server-render/contract";
import { getKey } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/render/callback — worker completion report
 * (ClipForge Phase 8 — the missing piece behind the
 * "clip.rendered never fires" gap).
 *
 * The ffmpeg worker calls this when a server render finishes
 * (the job-creation route already accepts a callbackUrl). The
 * body must carry a valid HMAC-SHA256 signature over the raw
 * body in X-ClipForge-Signature, keyed by WORKER_AUTH_SECRET;
 * anything else is 401 and nothing is recorded. A "done" report
 * fires the clip.rendered audit event (actor "worker" — a system
 * actor, since the worker holds no user session). "failed"
 * reports are acknowledged without an audit event: there is no
 * render-failed audit action, and inventing one would break the
 * append-only action list. Without WORKER_AUTH_SECRET the route
 * honestly 503s — an unsigned callback is never trusted.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = getKey("WORKER_AUTH_SECRET");
  if (!secret) {
    return NextResponse.json(
      { error: "Server render is not configured yet." },
      { status: 503 },
    );
  }
  const signature = req.headers.get("X-ClipForge-Signature") ?? "";
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const valid = await verifyWorkerRequest(raw, signature, secret);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = renderJobStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid render status." }, { status: 400 });
  }
  if (parsed.data.status === "done") {
    scheduleAudit({
      actor: "worker",
      action: "clip.rendered",
      target: parsed.data.jobId,
      metadata: { outputKey: parsed.data.outputKey ?? null },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
  }
  return NextResponse.json({ ok: true, status: parsed.data.status });
}
