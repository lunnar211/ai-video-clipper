import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import { getViewAsMarker } from "@/lib/admin/impersonation";

/**
 * GET /api/admin/session — who is signed in to the admin console, and
 * whether their MFA session is verified. Also reports an active
 * view-as session (target user id only — never the marker), which
 * the admin layout uses to render the view-as banner. 401 when not
 * signed in, 403 when the role is forbidden / suspended / MFA is
 * missing, 503 when the admin database is not configured.
 */
export async function GET(req: Request) {
  const { session, errorResponse } = await adminGate(req, CONSOLE_ROLES);
  if (errorResponse) return errorResponse;
  const viewAs = getViewAsMarker(req);
  return NextResponse.json({
    userId: session.userId,
    role: session.role,
    mfaVerified: session.mfaVerified,
    viewAs: viewAs
      ? { targetUserId: viewAs.targetUserId, reason: viewAs.reason }
      : null,
  });
}
