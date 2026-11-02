import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { getUserRow } from "@/lib/admin/store";
import {
  buildGdprArchive,
  GDPR_EXPORT_COLUMNS,
  type GdprTableName,
} from "@/lib/integrations/gdpr";
import {
  readGdprTable,
  resolveIntegrationDb,
} from "@/lib/integrations/store";

const exportSchema = z.object({
  userId: z.string().min(1),
});

/**
 * POST /api/admin/gdpr/export — build a downloadable archive of ALL
 * of one user's data (safe columns only — never tokens, hashes,
 * secrets, transcripts, or video). Owner/admin only (end users
 * without a console role request export through support; the
 * execution is audited here). 503 without a database.
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
  const parsed = exportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide userId." },
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
    const rows: Partial<Record<GdprTableName, unknown[]>> = {
      clipper_users: [user],
    };
    for (const table of Object.keys(GDPR_EXPORT_COLUMNS) as GdprTableName[]) {
      if (table === "clipper_users") continue;
      rows[table] = await readGdprTable(
        db,
        table,
        "user_id",
        userId,
        GDPR_EXPORT_COLUMNS[table],
      );
    }
    const archive = buildGdprArchive(userId, rows);
    scheduleAudit({
      actor: session.userId,
      action: "gdpr.export",
      target: userId,
      metadata: {
        tables: Object.keys(archive.tables),
      },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return new NextResponse(JSON.stringify(archive, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="clipforge-export-${userId}.json"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "GDPR export failed." },
      { status: 500 },
    );
  }
}
