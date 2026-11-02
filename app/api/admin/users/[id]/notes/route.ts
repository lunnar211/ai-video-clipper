import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES, SUPPORT_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import {
  getUserRow,
  createSupportNote,
  listSupportNotes,
} from "@/lib/admin/store";
import { emitAuditSafe } from "@/lib/admin/audit";

const NoteSchema = z.object({
  note: z.string().min(1).max(2000),
});

/**
 * GET /api/admin/users/[id]/notes — list support notes (console roles).
 * POST — add an admin-authored, attributed, timestamped note
 * (owner/admin/support). Notes are insert-only (no edit/delete API).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await adminGate(req, CONSOLE_ROLES);
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
    const notes = await listSupportNotes(db, id);
    return NextResponse.json({ notes });
  } catch {
    return NextResponse.json(
      { error: "Notes list failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}

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
  const { session, errorResponse } = await adminGate(req, SUPPORT_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "The admin database is not configured yet." },
      { status: 503 },
    );
  }
  const { id } = await params;
  const parsed = NoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid note" },
      { status: 400 },
    );
  }
  try {
    const user = await getUserRow(db, id);
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    const row = await createSupportNote(db, {
      user_id: id,
      admin_id: session.userId,
      note: parsed.data.note,
    });
    await emitAuditSafe({
      actor: session.userId,
      action: "admin.note",
      target: id,
      metadata: null,
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ note: row });
  } catch {
    return NextResponse.json(
      { error: "Note creation failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
