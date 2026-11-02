import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import {
  getBreakglassGrant,
  consumeBreakglassGrant,
  fetchBreakglassItem,
} from "@/lib/admin/store";
import { emitAuditSafe } from "@/lib/admin/audit";
import { breakglassGrantUsable } from "@/lib/admin/breakglass";
import { getClientIp } from "@/lib/rate-limit";

/**
 * GET /api/admin/break-glass/[id] — consume a break-glass grant and
 * return the granted item's SAFE metadata only (project id/title/
 * created_at or clip id/title/start/end/created_at — never media
 * keys, transcripts, or content). The grant must belong to the
 * requesting admin, be unused, and be unexpired; consuming it writes
 * an audit entry recording the item id (never its content). A second
 * fetch of the same grant returns 410.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const grant = await getBreakglassGrant(db, id);
    if (!grant) {
      return NextResponse.json({ error: "Grant not found." }, { status: 404 });
    }
    if (grant.admin_id !== session.userId) {
      return NextResponse.json(
        { error: "This grant belongs to another admin." },
        { status: 403 },
      );
    }
    if (!breakglassGrantUsable(grant)) {
      return NextResponse.json(
        { error: "This grant is already used or expired." },
        { status: 410 },
      );
    }
    const item = await fetchBreakglassItem(
      db,
      grant.item_type,
      grant.item_id,
    );
    if (!item) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }
    await consumeBreakglassGrant(db, id);
    await emitAuditSafe({
      actor: session.userId,
      action: "admin.breakglass",
      target: grant.item_id,
      metadata: {
        itemType: grant.item_type,
        reason: grant.reason,
        phase: "consumed",
      },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ item });
  } catch {
    return NextResponse.json(
      { error: "Break-glass fetch failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
