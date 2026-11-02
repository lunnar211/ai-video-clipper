import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth/session-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import {
  createProjectRow,
  listUserProjects,
  resolveAdminDb,
} from "@/lib/admin/store";
import { getUserPlan, resolveBillingDb } from "@/lib/billing/store";
import {
  checkProjectGate,
  gateRefusalMessage,
} from "@/lib/billing/gates";

export const runtime = "nodejs";
export const maxDuration = 30;

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

/**
 * Server project API (ClipForge Phase 8 — the missing piece behind
 * the "project.created never fires" gap). Session-bound: only a
 * signed-in user can list or create their own projects.
 *
 * GET /api/projects — the caller's own projects, newest first.
 * POST /api/projects — create one project (plan project-count gate
 * enforced when the billing database resolves), audit
 * project.created. 401 without a session, 503 without a database.
 */
export async function GET(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to list your projects." },
      { status: 401 },
    );
  }
  const db = resolveAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "Projects need database setup." },
      { status: 503 },
    );
  }
  try {
    const projects = await listUserProjects(db, userId);
    return NextResponse.json({ projects });
  } catch {
    return NextResponse.json(
      { error: "Project list failed." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to create a project." },
      { status: 401 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  }
  const db = resolveAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "Projects need database setup." },
      { status: 503 },
    );
  }
  try {
    // Plan gate (only when the billing database resolves; without
    // it there is nothing to meter against, so creation proceeds).
    const billingDb = resolveBillingDb();
    if (billingDb) {
      const planId = (await getUserPlan(billingDb, userId).catch(() => null)) ?? "free";
      const existing = await listUserProjects(db, userId).catch(() => []);
      const gate = checkProjectGate({ planId, projectCount: existing.length });
      if (!gate.allowed) {
        return NextResponse.json(
          { error: gateRefusalMessage(gate) },
          { status: 403 },
        );
      }
    }
    const project = await createProjectRow(db, {
      user_id: userId,
      title: parsed.data.title,
    });
    scheduleAudit({
      actor: userId,
      action: "project.created",
      target: project.id,
      metadata: { title: parsed.data.title },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Project creation failed." },
      { status: 500 },
    );
  }
}
