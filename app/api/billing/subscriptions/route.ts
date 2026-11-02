import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  listSubscriptionsByUser,
  resolveBillingDb,
} from "@/lib/billing/store";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/billing/subscriptions?userId=… — the caller's own
 * subscriptions, newest first. userId is caller-asserted (see the
 * identity note on the checkout route); session binding is a later
 * hardening slice. Statuses and plan names only — never payment
 * data (the MoR holds that).
 */
export async function GET(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json(
      { error: "userId is required." },
      { status: 400 },
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
