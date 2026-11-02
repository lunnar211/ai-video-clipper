import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  listSubscriptionsByUser,
  resolveBillingDb,
} from "@/lib/billing/store";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/billing/subscriptions — the caller's own subscriptions,
 * newest first. Session-bound since Phase 8: the user id comes
 * from the Supabase session, never from a query parameter.
 * Statuses and plan names only — never payment data (the MoR
 * holds that).
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
      { error: "Sign in to list your subscriptions." },
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
    const subscriptions = await listSubscriptionsByUser(db, userId);
    return NextResponse.json({ subscriptions });
  } catch {
    return NextResponse.json(
      { error: "Subscription list failed." },
      { status: 500 },
    );
  }
}
