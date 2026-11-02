import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { resolveBillingDb } from "@/lib/billing/store";
import { runDunningSweep } from "@/lib/billing/sweepers";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/admin/billing/dunning/run — advance every past_due
 * subscription one dunning step (owner/admin, audited per
 * subscription). Shares its implementation with the scheduled
 * cron sweeper (lib/billing/sweepers.ts): retries bump the
 * attempt count and schedule the next retry; grace expiry cancels.
 * Notifications go in-app; email stays inert until a working
 * mail provider lands.
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const gate = await adminGate(req, ACTION_ROLES);
  if (gate.errorResponse) return gate.errorResponse;
  const db = resolveBillingDb();
  if (!db) {
    return NextResponse.json(
      { error: "Billing needs database setup." },
      { status: 503 },
    );
  }
  const result = await runDunningSweep(db, Date.now());
  for (const step of result.steps) {
    scheduleAudit({
      actor: gate.session?.userId ?? "admin",
      action: "billing.dunning_step",
      target: step.subscriptionId,
      metadata: { step: step.action },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
  }
  return NextResponse.json({
    retried: result.retried,
    canceled: result.canceled,
    waiting: result.waiting,
  });
}
