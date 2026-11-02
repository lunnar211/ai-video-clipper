import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import { listAudit } from "@/lib/admin/audit";

/**
 * GET /api/admin/audit — list audit entries with filters
 * (actor, action, target, limit, offset). Console roles only.
 * 503 when the admin database is not configured.
 */
export async function GET(req: Request) {
  const { errorResponse } = await adminGate(req, CONSOLE_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "The admin database is not configured yet." },
      { status: 503 },
    );
  }
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1),
    1000,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0,
  );
  try {
    const entries = await listAudit(
      db,
      {
        actor: url.searchParams.get("actor") ?? undefined,
        action: url.searchParams.get("action") ?? undefined,
        target: url.searchParams.get("target") ?? undefined,
        limit,
        offset,
      },
    );
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json(
      { error: "Audit list failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
