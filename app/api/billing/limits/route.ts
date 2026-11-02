import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getPlan, remainingAllowance } from "@/lib/billing/plans";
import {
  getUserPlan,
  listLedgerByUser,
  resolveBillingDb,
} from "@/lib/billing/store";
import {
  isLowBalance,
  minuteBalance,
  monthlyConsumption,
} from "@/lib/billing/metering";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/billing/limits — the caller's plan, limits, monthly
 * minutes used, minute balance, and low-balance flag in one
 * place, session-bound since Phase 8. This is the enforcement
 * read path: the metering record route refuses consumption past
 * the monthly cap.
 */
export async function GET(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to see your limits." },
      { status: 401 },
    );
  }
  const db = resolveBillingDb();
  if (!db) {
    return NextResponse.json(
      { error: "Billing needs database setup." },
      { status: 503 },
    );
  }
  try {
    const planId = (await getUserPlan(db, userId)) ?? "free";
    const plan = getPlan(planId) ?? getPlan("free");
    const entries = await listLedgerByUser(db, userId);
    const now = new Date();
    const used = monthlyConsumption(
      entries,
      now.getUTCFullYear(),
      now.getUTCMonth(),
    );
    const balance = minuteBalance(entries);
    return NextResponse.json({
      plan: plan?.id ?? "free",
      placeholder: plan?.placeholder ?? true,
      limits: plan
        ? {
            minutesPerMonth: plan.minutesPerMonth,
            projects: plan.projects,
            seats: plan.seats,
            publishTargets: plan.publishTargets,
          }
        : null,
      minutesUsedThisMonth: used,
      minutesRemaining: plan
        ? remainingAllowance(plan.minutesPerMonth, used)
        : null,
      minuteBalance: balance,
      lowBalance: isLowBalance(balance),
    });
  } catch {
    return NextResponse.json(
      { error: "Limits lookup failed." },
      { status: 500 },
    );
  }
}
