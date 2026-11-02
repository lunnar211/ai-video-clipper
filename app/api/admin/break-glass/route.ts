import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import { createBreakglassGrant } from "@/lib/admin/store";
import { emitAuditSafe } from "@/lib/admin/audit";
import {
  breakglassRequestSchema,
  BREAKGLASS_TTL_MS,
} from "@/lib/admin/breakglass";

/**
 * POST /api/admin/break-glass — request a time-boxed (15 min),
 * single-use break-glass grant to view ONE project or clip's safe
 * metadata (owner/admin). Requires a reason (10–500 chars) and writes
 * an audit entry. The grant itself reveals nothing — the item is
 * fetched only via GET /api/admin/break-glass/[id], which consumes
 * the grant and audits the access. The item's CONTENT is never copied
 * into any log.
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
  const parsed = breakglassRequestSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid break-glass request" },
      { status: 400 },
    );
  }
  try {
    const grant = await createBreakglassGrant(db, {
      admin_id: session.userId,
      item_type: parsed.data.itemType,
      item_id: parsed.data.itemId,
      reason: parsed.data.reason,
      expires_at: new Date(Date.now() + BREAKGLASS_TTL_MS).toISOString(),
    });
    await emitAuditSafe({
      actor: session.userId,
      action: "admin.breakglass",
      target: parsed.data.itemId,
      metadata: {
        itemType: parsed.data.itemType,
        reason: parsed.data.reason,
        phase: "granted",
      },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({
      grantId: grant.id,
      expiresAt: grant.expires_at,
      note: "This grant is single-use and expires in 15 minutes. Fetch it once via GET /api/admin/break-glass/[id].",
    });
  } catch {
    return NextResponse.json(
      { error: "Break-glass grant failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
