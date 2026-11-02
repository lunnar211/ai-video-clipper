import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { isViewAsRequest } from "@/lib/admin/impersonation";
import { morProviderFor, type MorName } from "@/lib/billing/mor";
import {
  getPlan,
  isPlanId,
  priceIdForPlan,
} from "@/lib/billing/plans";
import {
  createRedemption,
  createSubscription,
  getCouponByCode,
  incrementCouponUses,
  listRedemptionsByUser,
  resolveBillingDb,
} from "@/lib/billing/store";
import { validateCoupon } from "@/lib/billing/coupons";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  email: z.string().email().max(200),
  tier: z.string().min(1).max(50),
  userId: z.string().min(1).max(200).optional(),
  /** App-side coupon code (validated here; see note below). */
  couponCode: z.string().min(3).max(50).optional(),
});

/**
 * Billing checkout (ClipForge Phase 6; Phase 3 route extended).
 *
 * Inert until the MoR key + a price ID for the tier are set:
 * without them it answers 503 "not configured" — never a fake
 * checkout link. Activation happens ONLY on the verified MoR
 * webhook (see app/api/billing/webhook/route.ts); a successful
 * checkout here records a PENDING subscription row (best-effort)
 * and nothing else.
 *
 * COUPON NOTE: an app-side coupon is validated here (expiry, uses,
 * per-user-once, plan) and, on success, its code is also passed to
 * the MoR as the discount code — so the owner must create the SAME
 * code in the MoR dashboard for the price cut to actually apply.
 * If the MoR rejects the code, checkout fails honestly with the
 * MoR's reason and no redemption is recorded. Coupons never
 * silently charge full price while claiming a discount.
 *
 * USER IDENTITY NOTE (standing gap since Phase 3): userId comes
 * from the request body, not a verified session. Session binding
 * is a later hardening slice; until then, treat user-scoped
 * billing rows as caller-asserted.
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  // View-as sessions are read-only: an admin viewing as a user may
  // never start a checkout as that user.
  if (isViewAsRequest(req)) {
    return NextResponse.json(
      { error: "View-as sessions are read-only and cannot check out." },
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
    return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  }
  const { email, tier, couponCode } = parsed.data;
  const userId = parsed.data.userId ?? "anonymous";
  if (!isPlanId(tier)) {
    return NextResponse.json(
      { error: `Unknown plan "${tier}".` },
      { status: 400 },
    );
  }
  if (tier === "free") {
    return NextResponse.json(
      { error: "The free plan has no checkout." },
      { status: 400 },
    );
  }
  const morName: MorName =
    process.env.BILLING_MOR_PROVIDER === "lemonsqueezy"
      ? "lemonsqueezy"
      : "paddle";
  const priceId = priceIdForPlan(tier, morName);
  if (!priceId) {
    return NextResponse.json(
      {
        error: `No price configured for tier "${tier}". Billing is not configured yet.`,
      },
      { status: 503 },
    );
  }
  // Coupon validation (rules only — the MoR applies the price cut).
  // Without a database, coupons cannot be validated: refuse the
  // coupon rather than silently ignoring it.
  const db = resolveBillingDb();
  if (couponCode && !db) {
    return NextResponse.json(
      { error: "Coupons need database setup." },
      { status: 503 },
    );
  }
  if (couponCode && db) {
    const coupon = await getCouponByCode(db, couponCode).catch(() => null);
    if (!coupon) {
      return NextResponse.json(
        { error: "Unknown coupon code." },
        { status: 400 },
      );
    }
    const prior = await listRedemptionsByUser(db, userId).catch(() => []);
    const validation = validateCoupon({
      coupon,
      totalMinor: 0,
      plan: tier,
      priorRedemptionsForUser: prior,
    });
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.reason },
        { status: 400 },
      );
    }
  }
  const provider = morProviderFor(morName);
  const result = await provider.createCheckout({
    email,
    priceId,
    userId,
    couponCode,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 503 });
  }
  // Best-effort bookkeeping: pending subscription + coupon redemption.
  // Neither is required for webhook activation (the webhook upserts
  // by MoR id), so a bookkeeping failure never blocks checkout.
  if (db) {
    const plan = getPlan(tier);
    if (plan) {
      await createSubscription(
        db,
        {
          user_id: userId,
          provider: morName,
          provider_subscription_id: null,
          plan: tier,
          status: "pending",
        },
      ).catch(() => null);
    }
    if (couponCode) {
      const coupon = await getCouponByCode(db, couponCode).catch(() => null);
      if (coupon) {
        await createRedemption(db, {
          coupon_id: coupon.id,
          user_id: userId,
          checkout_reference: `checkout:${tier}:${Date.now()}`,
        }).catch(() => null);
        await incrementCouponUses(db, coupon).catch(() => null);
      }
    }
  }
  // Audit only: the buyer's email is never logged.
  scheduleAudit({
    actor: userId,
    action: "billing.checkout",
    target: null,
    metadata: { tier, ...(couponCode ? { couponCode } : {}) },
    ip: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ checkoutUrl: result.checkoutUrl });
}
