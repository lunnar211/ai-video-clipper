import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { getPlan } from "@/lib/billing/plans";
import {
  getUserPlan,
  listLedgerByUser,
  resolveBillingDb,
} from "@/lib/billing/store";
import {
  ledgerEntryInputSchema,
  monthlyConsumption,
  recordLedger,
  userMinuteBalance,
} from "@/lib/billing/metering";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/admin/billing/metering/record — explicit ledger entry
 * (owner/admin, audited). Consumption entries are refused past the
 * caller's monthly plan cap with 402 + remaining minutes; grants,
 * purchases, and adjustments are never capped.
 *
 * NOTE: this route enforces; user flows (publish/render) record
 * via the safe helper and are never blocked by metering — hard
 * gating at render/publish time is a later slice once usage
 * accounting is live.
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
  const parsed = ledgerEntryInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid ledger entry.", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { userId, minutes, kind, reason, reference } = parsed.data;
  if (kind === "consumption") {
    const planId = (await getUserPlan(db, userId).catch(() => null)) ?? "free";
    const plan = getPlan(planId) ?? getPlan("free");
    const entries = await listLedgerByUser(db, userId).catch(() => []);
    const now = new Date();
    const used = monthlyConsumption(
      entries,
      now.getUTCFullYear(),
      now.getUTCMonth(),
    );
    const cap = plan?.minutesPerMonth ?? 30;
    if (cap >= 0 && used + minutes > cap) {
      return NextResponse.json(
        {
          error: "Monthly minute cap reached.",
          minutesUsedThisMonth: used,
          minutesRemaining: Math.max(0, cap - used),
        },
        { status: 402 },
      );
    }
  }
  const entry = await recordLedger(
    db,
    { userId, minutes, kind, reason, reference: reference ?? null },
  ).catch(() => null);
  if (!entry) {
    return NextResponse.json(
      { error: "Ledger entry could not be recorded." },
      { status: 500 },
    );
  }
  const balance = await userMinuteBalance(db, userId).catch(() => null);
  scheduleAudit({
    actor: gate.session?.userId ?? "admin",
    action:
      kind === "consumption"
        ? "billing.credit_consumed"
        : "billing.credit_grant",
    target: userId,
    metadata: { kind, minutes, reason },
    ip: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ entry, balance }, { status: 201 });
}
