import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  listCommissions,
  listCoupons,
  listInvoices,
  listReferrals,
  listSubscriptions,
  resolveBillingDb,
} from "@/lib/billing/store";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/admin/billing/overview — billing console counts.
 * Status-only where money is concerned: totals are integer minor
 * units summed from invoice records, and no payment-instrument
 * data exists anywhere in these tables (the MoR holds it).
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
    const [subs, invoices, coupons, referrals, commissions] =
      await Promise.all([
        listSubscriptions(db, null),
        listInvoices(db),
        listCoupons(db),
        listReferrals(db),
        listCommissions(db),
      ]);
    const subscriptionsByStatus: Record<string, number> = {};
    for (const s of subs) {
      subscriptionsByStatus[s.status] =
        (subscriptionsByStatus[s.status] ?? 0) + 1;
    }
    const invoiceTotalMinor = invoices.reduce(
      (sum, inv) => sum + inv.total_minor,
      0,
    );
    const commissionTotalMinor = commissions.reduce(
      (sum, c) => sum + c.amount_minor,
      0,
    );
    return NextResponse.json({
      subscriptionsByStatus,
      subscriptionCount: subs.length,
      dunningQueue: subs.filter((s) => s.status === "past_due").length,
      invoiceCount: invoices.length,
      invoiceTotalMinor,
      couponCount: coupons.length,
      referralCount: referrals.length,
      commissionCount: commissions.length,
      commissionTotalMinor,
    });
  } catch {
    return NextResponse.json(
      { error: "Billing overview failed." },
      { status: 500 },
    );
  }
}
