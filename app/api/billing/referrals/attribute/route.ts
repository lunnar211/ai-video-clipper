import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { isViewAsRequest } from "@/lib/admin/impersonation";
import {
  createReferral,
  getReferralByReferredUser,
  getReferralCodeOwner,
  resolveBillingDb,
} from "@/lib/billing/store";
import { canAttribute } from "@/lib/billing/affiliates";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  code: z.string().min(3).max(50),
  userId: z.string().min(1).max(200),
});

/**
 * POST /api/billing/referrals/attribute — attribute a new user to
 * the owner of a referral code. One referrer per user, forever;
 * self-referral is refused. Attribution is the record a later
 * commission is computed from — it promises no payout by itself.
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
      { error: "View-as sessions are read-only." },
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
    return NextResponse.json({ error: "Invalid attribution request." }, { status: 400 });
  }
  const { code, userId } = parsed.data;
  const db = resolveBillingDb();
  if (!db) {
    return NextResponse.json(
      { error: "Billing needs database setup." },
      { status: 503 },
    );
  }
  const owner = await getReferralCodeOwner(db, code).catch(() => null);
  if (!owner) {
    return NextResponse.json(
      { error: "Unknown referral code." },
      { status: 400 },
    );
  }
  const existing = await getReferralByReferredUser(db, userId).catch(
    () => null,
  );
  const check = canAttribute({
    referrerUserId: owner.user_id,
    referredUserId: userId,
    existingReferralForReferred: existing !== null,
  });
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 });
  }
  const referral = await createReferral(db, {
    code: owner.code,
    referrer_user_id: owner.user_id,
    referred_user_id: userId,
  }).catch(() => null);
  if (!referral) {
    return NextResponse.json(
      { error: "Attribution could not be recorded." },
      { status: 500 },
    );
  }
  scheduleAudit({
    actor: userId,
    action: "billing.affiliate_attributed",
    target: referral.id,
    metadata: { code: owner.code },
    ip: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ referral });
}
