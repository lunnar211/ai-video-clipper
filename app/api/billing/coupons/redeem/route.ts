import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { isViewAsRequest } from "@/lib/admin/impersonation";
import {
  createRedemption,
  getCouponByCode,
  incrementCouponUses,
  listRedemptionsByUser,
  resolveBillingDb,
} from "@/lib/billing/store";
import { validateCoupon } from "@/lib/billing/coupons";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  userId: z.string().min(1).max(200),
  code: z.string().min(3).max(50),
  plan: z.string().min(1).max(50).nullable().optional(),
  /** Total in integer minor units, when known (0 = rules only). */
  totalMinor: z.number().int().nonnegative().optional().default(0),
  checkoutReference: z.string().min(1).max(200),
});

/**
 * POST /api/billing/coupons/redeem — validate a coupon and record
 * the redemption. Rejection reasons are specific (expired, used
 * up, already used, wrong plan). The discount itself is applied
 * where the charge is created (checkout → MoR discount code);
 * this route records the app-side redemption so limits are real.
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
      { error: "View-as sessions are read-only and cannot redeem." },
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
    return NextResponse.json({ error: "Invalid redeem request." }, { status: 400 });
  }
  const { userId, code, plan, totalMinor, checkoutReference } = parsed.data;
  const db = resolveBillingDb();
  if (!db) {
    return NextResponse.json(
      { error: "Coupons need database setup." },
      { status: 503 },
    );
  }
  const coupon = await getCouponByCode(db, code).catch(() => null);
  if (!coupon) {
    return NextResponse.json(
      { error: "Unknown coupon code." },
      { status: 400 },
    );
  }
  const prior = await listRedemptionsByUser(db, userId).catch(() => []);
  const validation = validateCoupon({
    coupon,
    totalMinor,
    plan: plan ?? null,
    priorRedemptionsForUser: prior,
  });
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.reason },
      { status: 400 },
    );
  }
  const redemption = await createRedemption(db, {
    coupon_id: coupon.id,
    user_id: userId,
    checkout_reference: checkoutReference,
  }).catch(() => null);
  if (!redemption) {
    return NextResponse.json(
      { error: "Redemption could not be recorded." },
      { status: 500 },
    );
  }
  await incrementCouponUses(db, coupon).catch(() => null);
  scheduleAudit({
    actor: userId,
    action: "billing.coupon_redeemed",
    target: coupon.id,
    metadata: { code: coupon.code },
    ip: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
  });
  return NextResponse.json({
    redemption,
    discountMinor: validation.discountMinor,
  });
}
