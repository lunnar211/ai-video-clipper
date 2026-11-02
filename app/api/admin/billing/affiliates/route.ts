import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  listCommissions,
  listReferrals,
  resolveBillingDb,
} from "@/lib/billing/store";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/admin/billing/affiliates — referrals + commissions.
 * Commissions are records only: payouts are manual, and nothing
 * here promises a payout date or method.
 */
export async function GET(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const { errorResponse } = await adminGate(req, CONSOLE_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveBillingDb();
  if (!db) {
    return NextResponse.json(
      { error: "Billing needs database setup." },
      { status: 503 },
    );
  }
  try {
    const [referrals, commissions] = await Promise.all([
      listReferrals(db),
      listCommissions(db),
    ]);
    return NextResponse.json({ referrals, commissions });
  } catch {
    return NextResponse.json(
      { error: "Affiliate list failed." },
      { status: 500 },
    );
  }
}
