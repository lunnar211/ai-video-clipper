/**
 * Coupons (ClipForge Phase 6).
 *
 * Creation is admin-gated and audited; redemption happens at
 * checkout. All discount math is integer minor units — percent
 * discounts round DOWN (the buyer never pays a fraction of a minor
 * unit, and the seller never discounts more than the percent says).
 * Rejection reasons are specific, never a bare "invalid".
 */

import { z } from "zod";
import type { CouponRow, CouponRedemptionRow } from "./store";

export const couponCreateSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, "Code may only use letters, digits, - and _.")
    .transform((s) => s.toUpperCase()),
  kind: z.enum(["percent", "fixed"]),
  /** Percent 1–100, or fixed discount in integer minor units. */
  value: z.number().int().positive(),
  maxUses: z.number().int().positive().nullable().optional(),
  perUserOnce: z.boolean().optional().default(true),
  plan: z.string().min(1).max(50).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export type CouponValidation =
  | { ok: true; discountMinor: number }
  | { ok: false; reason: string };

/**
 * Pure validation: expiry, usage cap, per-user-once, plan scope,
 * and percent range. The caller supplies the coupon row, the user's
 * prior redemptions, and "now" — no database access here, so the
 * rules are unit-testable without mocks.
 */
export function validateCoupon(input: {
  coupon: CouponRow;
  totalMinor: number;
  plan: string | null;
  priorRedemptionsForUser: CouponRedemptionRow[];
  nowMs?: number;
}): CouponValidation {
  const { coupon, totalMinor, plan, priorRedemptionsForUser } = input;
  const nowMs = input.nowMs ?? Date.now();
  if (coupon.expires_at && Date.parse(coupon.expires_at) <= nowMs) {
    return { ok: false, reason: "This coupon has expired." };
  }
  if (
    coupon.max_uses !== null &&
    coupon.uses_count >= coupon.max_uses
  ) {
    return { ok: false, reason: "This coupon has reached its use limit." };
  }
  if (
    coupon.per_user_once &&
    priorRedemptionsForUser.some((r) => r.coupon_id === coupon.id)
  ) {
    return { ok: false, reason: "You have already used this coupon." };
  }
  if (coupon.plan !== null && plan !== null && coupon.plan !== plan) {
    return {
      ok: false,
      reason: `This coupon applies to the ${coupon.plan} plan only.`,
    };
  }
  if (coupon.kind === "percent" && coupon.value > 100) {
    return { ok: false, reason: "This coupon is misconfigured." };
  }
  return { ok: true, discountMinor: applyDiscount(totalMinor, coupon) };
}

/** Discount in integer minor units, rounded down for percent. */
export function applyDiscount(
  totalMinor: number,
  coupon: Pick<CouponRow, "kind" | "value">,
): number {
  if (totalMinor <= 0) return 0;
  if (coupon.kind === "percent") {
    return Math.min(
      totalMinor,
      Math.floor((totalMinor * coupon.value) / 100),
    );
  }
  return Math.min(totalMinor, coupon.value);
}
