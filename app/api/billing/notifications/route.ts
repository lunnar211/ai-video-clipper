import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  listNotificationsByUser,
  resolveBillingDb,
} from "@/lib/billing/store";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/billing/notifications?userId=… — in-app billing notices
 * (payment failures, dunning steps, low balance). Email notices
 * stay inert until a working mail provider lands.
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
    const notifications = await listNotificationsByUser(db, userId);
    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json(
      { error: "Notification list failed." },
      { status: 500 },
    );
  }
}
