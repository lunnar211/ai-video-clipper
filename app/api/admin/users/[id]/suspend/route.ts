import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import { getUserRow, setUserStatus } from "@/lib/admin/store";
import { emitAuditSafe } from "@/lib/admin/audit";

const SuspendSchema = z.object({
  reason: z.string().min(3).max(500).optional(),
});

/**
 * POST /api/admin/users/[id]/suspend — suspend an account (owner/admin).
 * Writes an audit entry with the reason. Suspended users fail the
 * admin gate and cannot publish (enforced by the publish gates).
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
  const parsed = SuspendSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid reason" },
      { status: 400 },
    );
  }
  try {
    const user = await getUserRow(db, id);
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    await setUserStatus(db, id, "suspended", parsed.data.reason ?? null);
    await emitAuditSafe({
      actor: session.userId,
      action: "admin.suspend",
      target: id,
      metadata: { reason: parsed.data.reason ?? null },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ id, status: "suspended" });
  } catch {
    return NextResponse.json(
      { error: "Suspend failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
