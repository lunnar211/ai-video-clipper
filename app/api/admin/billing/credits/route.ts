import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { resolveBillingDb } from "@/lib/billing/store";
import { recordLedger, userMinuteBalance } from "@/lib/billing/metering";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  userId: z.string().min(1).max(200),
  minutes: z.number().int().positive().max(100000),
  reason: z.string().min(1).max(500),
});

/**
 * POST /api/admin/billing/credits — grant MINUTE credits
 * (owner/admin, audited). This is separate from the Phase 4 clip
 * credits route (which grants CLIPS): the two units are never
 * mixed. Grants never expire silently — expiry is its own ledger
 * kind with a recorded reason, applied only by an explicit entry.
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid grant." }, { status: 400 });
  }
  const { userId, minutes, reason } = parsed.data;
  const entry = await recordLedger(db, {
    userId,
    minutes,
    kind: "grant",
    reason,
  }).catch(() => null);
  if (!entry) {
    return NextResponse.json(
      { error: "Grant could not be recorded." },
      { status: 500 },
    );
  }
  const balance = await userMinuteBalance(db, userId).catch(() => null);
  scheduleAudit({
    actor: gate.session?.userId ?? "admin",
    action: "billing.credit_grant",
    target: userId,
    metadata: { minutes, reason },
    ip: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ entry, balance }, { status: 201 });
}
