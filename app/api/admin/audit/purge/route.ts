import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import { purgeExpiredAudit, auditRetentionDays } from "@/lib/admin/audit";

/**
 * POST /api/admin/audit/purge — delete audit rows older than the
 * configured retention window (default 365 days). This is the ONLY
 * deletion path for the audit log: it runs through the admin role
 * gate, and the purge itself writes an audit entry recording the
 * cutoff and the deleted count. Owner/admin only.
 */
export async function POST(req: Request) {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429 },
    );
  }
  const { session, errorResponse } = await adminGate(req, ACTION_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "The admin database is not configured yet." },
      { status: 503 },
    );
  }
  try {
    const result = await purgeExpiredAudit(db, session.userId);
    return NextResponse.json({
      deleted: result.deleted,
      cutoff: result.cutoff,
      retentionDays: auditRetentionDays(),
    });
  } catch {
    return NextResponse.json(
      { error: "Audit purge failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
