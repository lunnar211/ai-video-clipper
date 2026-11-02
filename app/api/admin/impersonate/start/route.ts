import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import { getUserRow, createImpersonationRow } from "@/lib/admin/store";
import { emitAuditSafe } from "@/lib/admin/audit";
import {
  createViewAsMarker,
  viewAsStartSchema,
  VIEW_AS_COOKIE,
  VIEW_AS_TTL_MS,
} from "@/lib/admin/impersonation";
import { parseTokenKey } from "@/lib/publish/tokens";

/**
 * POST /api/admin/impersonate/start — start a VIEW-ONLY "view as"
 * session for another user (owner/admin). Requires a reason (10–500
 * chars), writes an audit entry, and sets a signed view-as cookie.
 * View-as NEVER exposes tokens and NEVER lets the admin publish or
 * bill as the user — write routes refuse view-as requests.
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
  const parsed = viewAsStartSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid impersonation request" },
      { status: 400 },
    );
  }
  const key = parseTokenKey(process.env.PUBLISH_TOKEN_KEY);
  if (!key) {
    return NextResponse.json(
      { error: "Impersonation is not configured yet (token key missing)." },
      { status: 503 },
    );
  }
  try {
    const target = await getUserRow(db, parsed.data.targetUserId);
    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    const row = await createImpersonationRow(db, {
      admin_id: session.userId,
      target_user_id: parsed.data.targetUserId,
      reason: parsed.data.reason,
    });
    await emitAuditSafe({
      actor: session.userId,
      action: "admin.impersonate_start",
      target: parsed.data.targetUserId,
      metadata: { reason: parsed.data.reason },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    const res = NextResponse.json({
      sessionId: row.id,
      targetUserId: parsed.data.targetUserId,
      expiresInSeconds: Math.floor(VIEW_AS_TTL_MS / 1000),
    });
    res.cookies.set(
      VIEW_AS_COOKIE,
      createViewAsMarker(
        {
          adminId: session.userId,
          targetUserId: parsed.data.targetUserId,
          reason: parsed.data.reason,
        },
        key,
      ),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: Math.floor(VIEW_AS_TTL_MS / 1000),
      },
    );
    return res;
  } catch {
    return NextResponse.json(
      { error: "Impersonation start failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
