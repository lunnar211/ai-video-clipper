import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isViewAsRequest } from "@/lib/admin/impersonation";
import {
  createReferralCode,
  listReferralCodesByUser,
  resolveBillingDb,
} from "@/lib/billing/store";
import { generateReferralCode } from "@/lib/billing/affiliates";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  userId: z.string().min(1).max(200),
});

/**
 * POST /api/billing/referrals/code — get or create the caller's
 * referral code. One code per user (the first created wins);
 * commissions are records only — payouts are manual, and no copy
 * here promises a payout date or method.
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
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { userId } = parsed.data;
  const db = resolveBillingDb();
  if (!db) {
    return NextResponse.json(
      { error: "Billing needs database setup." },
      { status: 503 },
    );
  }
  const existing = await listReferralCodesByUser(db, userId).catch(() => []);
  if (existing[0]) {
    return NextResponse.json({ code: existing[0].code });
  }
  // Retry on the (rare) random collision: the code column is UNIQUE.
  for (let attempt = 0; attempt < 5; attempt++) {
    const created = await createReferralCode(db, {
      code: generateReferralCode(),
      user_id: userId,
    }).catch(() => null);
    if (created) return NextResponse.json({ code: created.code });
  }
  return NextResponse.json(
    { error: "Referral code could not be created." },
    { status: 500 },
  );
}
