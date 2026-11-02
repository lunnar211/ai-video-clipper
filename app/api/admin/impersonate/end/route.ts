import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import {
  listOpenImpersonations,
  endImpersonationRow,
} from "@/lib/admin/store";
import { emitAuditSafe } from "@/lib/admin/audit";
import { VIEW_AS_COOKIE } from "@/lib/admin/impersonation";

/**
 * POST /api/admin/impersonate/end — end every open view-as session
 * for this admin (owner/admin), clear the view-as cookie, and write
 * an audit entry per ended session. Safe to call with no open session.
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
    const open = await listOpenImpersonations(db, session.userId);
    for (const row of open) {
      await endImpersonationRow(db, row.id);
      await emitAuditSafe({
        actor: session.userId,
        action: "admin.impersonate_end",
        target: row.target_user_id,
        metadata: { reason: row.reason },
        ip: getClientIp(req),
        user_agent: req.headers.get("user-agent"),
      });
    }
    const res = NextResponse.json({ ended: open.length });
    res.cookies.set(VIEW_AS_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch {
    return NextResponse.json(
      { error: "Impersonation end failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
