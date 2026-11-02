import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";

/**
 * GET /api/admin/session — who is signed in to the admin console, and
 * whether their MFA session is verified. 401 when not signed in,
 * 403 when the role is forbidden / suspended / MFA is missing, 503
 * when the admin database is not configured.
 */
export async function GET(req: Request) {
  const { session, errorResponse } = await adminGate(req, CONSOLE_ROLES);
  if (errorResponse) return errorResponse;
  return NextResponse.json({
    userId: session.userId,
    role: session.role,
    mfaVerified: session.mfaVerified,
  });
}
