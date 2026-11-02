import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  listSubscriptions,
  resolveBillingDb,
} from "@/lib/billing/store";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET /api/admin/billing/subscriptions?status=… — console list. */
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
  const status = new URL(req.url).searchParams.get("status");
  try {
    const subscriptions = await listSubscriptions(db, status);
    return NextResponse.json({ subscriptions });
  } catch {
    return NextResponse.json(
      { error: "Subscription list failed." },
      { status: 500 },
    );
  }
}
