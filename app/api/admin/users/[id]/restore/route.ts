import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import { getUserRow, setUserStatus } from "@/lib/admin/store";
import { emitAuditSafe } from "@/lib/admin/audit";

/**
 * POST /api/admin/users/[id]/restore — restore a suspended account
 * (owner/admin). Writes an audit entry.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { id } = await params;
  try {
    const user = await getUserRow(db, id);
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    await setUserStatus(db, id, "active", null);
    await emitAuditSafe({
      actor: session.userId,
      action: "admin.restore",
      target: id,
      metadata: null,
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ id, status: "active" });
  } catch {
    return NextResponse.json(
      { error: "Restore failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
