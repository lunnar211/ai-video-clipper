/**
 * Affiliates (ClipForge Phase 6).
 *
 * Referral codes attribute signups to referrers; commission records
 * track what a referrer earned on a referred user's first paid
 * event. PAYOUTS ARE MANUAL: no payout rail is wired, and no copy
 * anywhere promises a payout date or method — the owner picks a
 * rail later (see docs/PHASE6.md). The commission rate is
 * owner-configurable (BILLING_AFFILIATE_RATE_PERCENT, PLACEHOLDER
 * default 10) and commission math is integer minor units, rounded
 * down.
 */

import { randomBytes } from "node:crypto";

export function affiliateRatePercent(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number.parseInt(
    env.BILLING_AFFILIATE_RATE_PERCENT ?? "",
    10,
  );
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) return 10;
  return raw;
}

/** 8-char referral code (A–Z, 2–9 — no confusing 0/1/O/I). */
export function generateReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

export type AttributionCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Attribution rules: no self-referral, one referrer per referred
 * user (a second code is refused, never silently overwritten).
 */
export function canAttribute(input: {
  referrerUserId: string;
  referredUserId: string;
  existingReferralForReferred: boolean;
}): AttributionCheck {
  if (input.referrerUserId === input.referredUserId) {
    return { ok: false, reason: "You cannot refer yourself." };
  }
  if (input.existingReferralForReferred) {
    return {
      ok: false,
      reason: "This account is already attributed to a referrer.",
    };
  }
  return { ok: true };
}

/** Integer minor-unit commission, rounded down. */
export function commissionFor(
  amountMinor: number,
  ratePercent: number,
): number {
  if (amountMinor <= 0 || ratePercent <= 0) return 0;
  return Math.floor((amountMinor * ratePercent) / 100);
}
