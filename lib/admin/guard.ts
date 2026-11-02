/**
 * Shared admin route guard (ClipForge Phase 4).
 *
 * Every admin route starts with: rate limit (in the route), then
 * adminGate() for role + MFA enforcement. The guard returns either a
 * session or a ready-made error Response — routes return early on
 * the error case. Cookie header comes from the request so tests can
 * drive routes without next/headers request scope.
 */

import { NextResponse } from "next/server";
import {
  requireAdminSession,
  getAdminSession,
  type AdminSession,
} from "./session";
import { CONSOLE_ROLES, type AdminRole } from "./roles";

export type AdminGate =
  | { session: AdminSession; errorResponse: null }
  | { session: null; errorResponse: Response };

export async function adminGate(
  req: Request,
  allowedRoles: AdminRole[],
): Promise<AdminGate> {
  const gate = await requireAdminSession(
    allowedRoles,
    req.headers.get("cookie"),
  );
  if (!gate.ok) {
    return {
      session: null,
      errorResponse: NextResponse.json(
        {
          error: gate.error,
          ...(gate.mfaSetupRequired !== undefined
            ? { mfaSetupRequired: gate.mfaSetupRequired }
            : {}),
        },
        { status: gate.status },
      ),
    };
  }
  return { session: gate.session, errorResponse: null };
}

/**
 * Identity-only gate (sign-in + role, no MFA check). Used ONLY by the
 * MFA setup/verify routes themselves — every other admin route uses
 * adminGate() above, which enforces MFA for owner/admin roles.
 */
export async function adminIdentity(
  req: Request,
  allowedRoles: AdminRole[],
): Promise<AdminGate> {
  const session = await getAdminSession(req.headers.get("cookie"));
  if (!session) {
    return {
      session: null,
      errorResponse: NextResponse.json(
        { error: "Sign in with an admin account to use the admin console." },
        { status: 401 },
      ),
    };
  }
  if (session.status === "suspended") {
    return {
      session: null,
      errorResponse: NextResponse.json(
        { error: "This account is suspended." },
        { status: 403 },
      ),
    };
  }
  if (!allowedRoles.includes(session.role)) {
    return {
      session: null,
      errorResponse: NextResponse.json(
        { error: "This role cannot use the admin console." },
        { status: 403 },
      ),
    };
  }
  return { session, errorResponse: null };
}

/**
 * Server layout gate decision (admin hard gate, login-build addition).
 * Pure and unit-testable; the /admin layout resolves the session with
 * getAdminSession() and applies this verdict BEFORE rendering any
 * console UI, so outsiders never see admin nav or content.
 * - No session -> redirect to /signin (nothing admin renders).
 * - Signed in but suspended, or without a console role -> redirect
 *   to "/" (they are already signed in, so the sign-in page would
 *   loop them back here).
 * - Console role (owner/admin/support/analyst/viewer) -> allowed.
 * MFA is deliberately NOT checked here: owner/admin MFA is still
 * enforced by adminGate() on every API route, and /admin/mfa itself
 * must stay reachable so enrolment is possible.
 */
export type LayoutGateVerdict =
  | { allowed: true; redirectTo: null }
  | { allowed: false; redirectTo: "/signin" | "/" };

export function adminLayoutGate(
  session: AdminSession | null,
): LayoutGateVerdict {
  if (!session) return { allowed: false, redirectTo: "/signin" };
  if (
    session.status === "suspended" ||
    !CONSOLE_ROLES.includes(session.role)
  ) {
    return { allowed: false, redirectTo: "/" };
  }
  return { allowed: true, redirectTo: null };
}
