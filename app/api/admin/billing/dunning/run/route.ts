import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import {
  createNotification,
  listSubscriptions,
  resolveBillingDb,
  updateSubscription,
} from "@/lib/billing/store";
import { nextDunningStep } from "@/lib/billing/dunning";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/admin/billing/dunning/run — advance every past_due
 * subscription one dunning step (owner/admin, audited per
 * subscription). Retries bump the attempt count and schedule the
 * next retry; grace expiry cancels. Notifications go in-app;
 * email stays inert until a working mail provider lands.
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
  const pastDue = await listSubscriptions(db, "past_due").catch(() => []);
  const nowMs = Date.now();
  let retried = 0;
  let canceled = 0;
  let waiting = 0;
  for (const sub of pastDue) {
    const step = nextDunningStep({
      attempts: sub.dunning_attempts,
      startedAt: sub.dunning_started_at,
      nextRetryAt: sub.dunning_next_retry_at,
      nowMs,
    });
    if (step.action === "wait") {
      waiting++;
      continue;
    }
    if (step.action === "retry") {
      await updateSubscription(db, sub.id, {
        dunning_attempts: sub.dunning_attempts + 1,
        dunning_next_retry_at: step.nextRetryAt,
      }).catch(() => null);
      await createNotification(db, {
        user_id: sub.user_id,
        kind: "billing_payment_retry",
        title: "Payment retry scheduled",
        body: "Your payment will be retried. Please update your payment method if it keeps failing.",
      }).catch(() => null);
      retried++;
    } else {
      await updateSubscription(db, sub.id, {
        status: "canceled",
        canceled_at: new Date(nowMs).toISOString(),
        cancel_at_period_end: false,
      }).catch(() => null);
      await createNotification(db, {
        user_id: sub.user_id,
        kind: "billing_subscription_canceled",
        title: "Subscription canceled",
        body: "Your subscription was canceled after repeated payment failures. You can resubscribe anytime.",
      }).catch(() => null);
      canceled++;
    }
    scheduleAudit({
      actor: gate.session?.userId ?? "admin",
      action: "billing.dunning_step",
      target: sub.id,
      metadata: { step: step.action },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
  }
  return NextResponse.json({ retried, canceled, waiting });
}
