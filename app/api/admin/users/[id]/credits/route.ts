import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import { getUserRow, createCreditAdjustment } from "@/lib/admin/store";
import { emitAuditSafe } from "@/lib/admin/audit";

const CreditsSchema = z.object({
  deltaClips: z.number().int().refine((n) => n !== 0, "deltaClips must not be 0"),
  reason: z.string().min(3).max(500),
});

/**
 * POST /api/admin/users/[id]/credits — adjust a user's clip credit
 * balance (owner/admin). Every adjustment needs a reason and writes
 * an audit entry; the balance is the sum of adjustments, never an
 * edited field. 400 on a missing user or a zero delta.
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
  const parsed = CreditsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid adjustment" },
      { status: 400 },
    );
  }
  try {
    const user = await getUserRow(db, id);
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    const row = await createCreditAdjustment(db, {
      user_id: id,
      admin_id: session.userId,
      delta_clips: parsed.data.deltaClips,
      reason: parsed.data.reason,
    });
    await emitAuditSafe({
      actor: session.userId,
      action: "admin.credit_adjust",
      target: id,
      metadata: {
        delta_clips: parsed.data.deltaClips,
        reason: parsed.data.reason,
      },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ adjustment: row });
  } catch {
    return NextResponse.json(
      { error: "Credit adjustment failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
