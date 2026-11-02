import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { getUserRow } from "@/lib/admin/store";
import {
  GDPR_DELETION_ORDER,
  GDPR_RETAINED,
} from "@/lib/integrations/gdpr";
import {
  deleteGdprTable,
  resolveIntegrationDb,
} from "@/lib/integrations/store";

const deleteSchema = z.object({
  userId: z.string().min(1),
  confirm: z.literal(true, {
    error: "Deletion requires confirm: true.",
  }),
});

/**
 * POST /api/admin/gdpr/delete — hard-delete one user's data in
 * dependency order (children first, user row last). Requires
 * confirm: true. The response states plainly what is RETAINED:
 * immutable audit rows (Phase 4 retention policy) and strike records
 * (legal hold). Owner/admin only. 503 without a database.
 */
export async function POST(req: Request) {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const { session, errorResponse } = await adminGate(req, ACTION_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveIntegrationDb();
  if (!db) {
    return NextResponse.json(
      { error: "The integrations database is not configured yet." },
      { status: 503 },
    );
  }
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide userId and confirm: true." },
      { status: 400 },
    );
  }
  const userId = parsed.data.userId;
  try {
    const user = await getUserRow(db, userId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 },
      );
    }
    const deleted: Record<string, number> = {};
    for (const table of GDPR_DELETION_ORDER) {
      const column = table === "clipper_users" ? "id" : "user_id";
      deleted[table] = await deleteGdprTable(db, table, column, userId);
    }
    scheduleAudit({
      actor: session.userId,
      action: "gdpr.delete",
      target: userId,
      metadata: { deleted },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({
      deleted,
      retained: GDPR_RETAINED,
      note: "Audit rows and strike records are retained as documented in docs/PHASE5.md.",
    });
  } catch {
    return NextResponse.json(
      { error: "GDPR deletion failed." },
      { status: 500 },
    );
  }
}
