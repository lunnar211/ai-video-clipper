import { NextResponse } from "next/server";
import { z } from "zod";
import {
  renderJobRequestSchema,
  resolveWorker,
  signWorkerRequest,
  WORKER_NOT_CONFIGURED,
} from "@/lib/server-render/contract";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Server render jobs (ClipForge Phase 1). The worker is OFF by
 * default: without WORKER_URL + WORKER_AUTH_SECRET every call 503s
 * honestly. When configured, jobs are signed (HMAC) and forwarded to
 * the ffmpeg worker — the app never pretends a server render happened.
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = renderJobRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid render job." }, { status: 400 });
  }
  const worker = resolveWorker();
  if (!worker) {
    return NextResponse.json({ error: WORKER_NOT_CONFIGURED }, { status: 503 });
  }
  const payload = JSON.stringify(parsed.data);
  const signature = await signWorkerRequest(payload, worker.authSecret);
  const res = await fetch(`${worker.url}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ClipForge-Signature": signature,
    },
    body: payload,
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Worker request failed (HTTP ${res.status}).` },
      { status: 502 },
    );
  }
  const data = (await res.json().catch(() => ({}))) as unknown;
  // Audit only: a job was accepted by the worker. "clip.rendered"
  // fires later, when the worker reports completion.
  const jobId =
    typeof data === "object" && data !== null && "id" in data
      ? String((data as { id: unknown }).id)
      : null;
  scheduleAudit({
    actor: "guest",
    action: "render.job_created",
    target: jobId,
    metadata: null,
    ip: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
  });
  return NextResponse.json(data);
}

const querySchema = z.object({
  jobId: z.string().uuid(),
});

export async function GET(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const params = new URL(req.url).searchParams;
  const parsed = querySchema.safeParse({ jobId: params.get("jobId") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
  }
  const worker = resolveWorker();
  if (!worker) {
    return NextResponse.json({ error: WORKER_NOT_CONFIGURED }, { status: 503 });
  }
  const res = await fetch(
    `${worker.url}/jobs/${encodeURIComponent(parsed.data.jobId)}`,
    {
      headers: {
        "X-ClipForge-Signature": await signWorkerRequest(
          parsed.data.jobId,
          worker.authSecret,
        ),
      },
    },
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: `Worker request failed (HTTP ${res.status}).` },
      { status: 502 },
    );
  }
  const data = (await res.json().catch(() => ({}))) as unknown;
  return NextResponse.json(data);
}
