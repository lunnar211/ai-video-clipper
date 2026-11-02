import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import { listAudit, auditToCsv, auditToJson } from "@/lib/admin/audit";

/**
 * GET /api/admin/audit/export?format=csv|json — download audit entries
 * as a file (attachment). Console roles only. The export carries the
 * same fields as the audit list; nothing is redacted because audit
 * metadata is already sanitized at write time.
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
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  try {
    const entries = await listAudit(db, { limit: 1000 });
    const body = format === "json" ? auditToJson(entries) : auditToCsv(entries);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type":
          format === "json" ? "application/json" : "text/csv",
        "Content-Disposition": `attachment; filename="clipforge-audit.${format}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Audit export failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
