import { NextResponse } from "next/server";
import { adminIdentity } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import { getMfaRow } from "@/lib/admin/store";

/**
 * GET /api/admin/mfa/status — whether this admin has enrolled TOTP
 * and whether the current enrolment is verified. Identity-only gate
 * (status is what the MFA setup screen reads). 503 without a database.
 */
export async function GET(req: Request) {
  const { session, errorResponse } = await adminIdentity(req, CONSOLE_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "The admin database is not configured yet." },
      { status: 503 },
    );
  }
  try {
    const row = await getMfaRow(db, session.userId);
    return NextResponse.json({
      enrolled: row !== null,
      verified: row?.verified_at !== null && row !== null,
    });
  } catch {
    return NextResponse.json(
      { error: "MFA status check failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
