import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { listAudit, resolveAdminDb } from "@/lib/admin/audit";
import { flagVelocity } from "@/lib/billing/fraud";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/admin/billing/fraud-signals — velocity flags over
 * recent billing.checkout audit entries. Flags are SIGNALS, not
 * verdicts: nothing is auto-blocked on a flag alone. The admin
 * decides (suspend lives in Phase 4).
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
  const db = resolveAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "Billing needs database setup." },
      { status: 503 },
    );
  }
  try {
    const entries = await listAudit(db, {
      action: "billing.checkout",
      limit: 500,
    });
    const flags = flagVelocity(entries);
    return NextResponse.json({ flags, checked: entries.length });
  } catch {
    return NextResponse.json(
      { error: "Fraud signal check failed." },
      { status: 500 },
    );
  }
}
