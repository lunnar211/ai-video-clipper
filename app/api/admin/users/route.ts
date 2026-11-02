import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import { listUserRows } from "@/lib/admin/store";

/**
 * GET /api/admin/users — list users (id, email, plan, role, status,
 * created_at). Console roles only. 503 without a database.
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
  try {
    const users = await listUserRows(db);
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json(
      { error: "User list failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
