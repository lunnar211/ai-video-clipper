import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { isViewAsRequest } from "@/lib/admin/impersonation";
import { morProviderFor, type MorName } from "@/lib/billing/mor";
import {
  listSubscriptionsByUser,
  resolveBillingDb,
  updateSubscription,
} from "@/lib/billing/store";
import { cancelPatch, type CancelMode } from "@/lib/billing/cancellation";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  userId: z.string().min(1).max(200),
  subscriptionId: z.string().min(1).max(200),
  mode: z.enum(["immediate", "end_of_period"]),
});

/**
 * POST /api/billing/subscriptions/cancel — cancel a subscription.
 *
 * immediate ends access now; end_of_period keeps access until
 * current_period_end. When the MoR is configured and the
 * subscription has a MoR id, the MoR cancel runs FIRST: if it
 * fails, nothing is recorded locally and the MoR's reason is
 * returned (the MoR would otherwise keep charging). When the MoR
 * is not configured, the cancel is local-only and the response
 * says so plainly — the owner must then confirm in the MoR
 * dashboard.
 *
 * Cancel is NEVER delete: projects, clips, and data remain, and
 * GDPR deletion (Phase 5) is a separate, explicit act.
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  if (isViewAsRequest(req)) {
    return NextResponse.json(
      { error: "View-as sessions are read-only and cannot cancel." },
      { status: 403 },
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
    return NextResponse.json({ error: "Invalid cancel request." }, { status: 400 });
  }
  const { userId, subscriptionId, mode } = parsed.data;
  const db = resolveBillingDb();
  if (!db) {
    return NextResponse.json(
      { error: "Billing needs database setup." },
      { status: 503 },
    );
  }
  const subs = await listSubscriptionsByUser(db, userId).catch(() => []);
  const sub = subs.find((s) => s.id === subscriptionId);
  if (!sub) {
    return NextResponse.json(
      { error: "Subscription not found." },
      { status: 404 },
    );
  }
  if (sub.status === "canceled") {
    return NextResponse.json(
      { error: "This subscription is already canceled." },
      { status: 400 },
    );
  }
  const morName: MorName =
    process.env.BILLING_MOR_PROVIDER === "lemonsqueezy"
      ? "lemonsqueezy"
      : "paddle";
  let morCanceled = false;
  if (sub.provider_subscription_id) {
    const provider = morProviderFor(morName);
    if (provider.cancelSubscription) {
      const result = await provider.cancelSubscription({
        subscriptionId: sub.provider_subscription_id,
        mode: mode as CancelMode,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.reason ?? "MoR cancel failed." },
          { status: 503 },
        );
      }
      morCanceled = true;
    }
  }
  const patch = cancelPatch(sub, mode as CancelMode);
  const updated = await updateSubscription(db, sub.id, patch).catch(
    () => null,
  );
  if (!updated) {
    return NextResponse.json(
      { error: "Cancel could not be recorded." },
      { status: 500 },
    );
  }
  scheduleAudit({
    actor: userId,
    action: "billing.cancel",
    target: sub.id,
    metadata: { mode, morCanceled },
    ip: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
  });
  return NextResponse.json({
    subscription: updated,
    morCanceled,
    note: morCanceled
      ? undefined
      : "Recorded locally only — confirm the cancel in the MoR dashboard if a MoR subscription exists.",
  });
}
