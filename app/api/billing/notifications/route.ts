import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  listNotificationsByUser,
  resolveBillingDb,
} from "@/lib/billing/store";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/billing/notifications — in-app billing notices
 * (payment failures, dunning steps, low balance), session-bound
 * since Phase 8. Email notices stay inert until a working mail
 * provider lands.
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
      { error: "Sign in to see your notifications." },
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
    const notifications = await listNotificationsByUser(db, userId);
    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json(
      { error: "Notification list failed." },
      { status: 500 },
    );
  }
}
