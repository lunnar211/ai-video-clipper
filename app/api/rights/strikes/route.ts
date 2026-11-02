import { NextResponse } from "next/server";
import {
  strikeSchema,
  createStrikeRow,
  listStrikeRows,
} from "@/lib/rights/strikes";
import { resolveRightsDb } from "@/lib/rights/declarations";
import { getAdminIdentity, isAdmin } from "@/lib/rights/admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { dispatchEventSafe } from "@/lib/integrations/dispatch";
import { makeDomainEvent } from "@/lib/integrations/events";

export const runtime = "nodejs";

/**
 * Strike intake + admin review queue (ClipForge Phase 2).
 *
 * POST is the public DMCA/takedown intake form: it validates the
 * notice fields (including both required statements) and stores the
 * record when a database is configured. Without one it answers 503
 * honestly and the form points at the Contact page instead — a
 * notice is never pretended to be filed.
 * GET is the admin review queue, role-gated (owner/admin rows only).
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = strikeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid takedown notice.", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const db = resolveRightsDb();
  if (!db) {
    return NextResponse.json(
      {
        error:
          "Takedown intake is not connected yet (no database on the server). Please send your notice to the contact address on the Contact page instead — nothing was filed.",
      },
      { status: 503 },
    );
  }
  try {
    const row = await createStrikeRow(db, {
      reporter_name: parsed.data.reporterName,
      reporter_email: parsed.data.reporterEmail,
      work_description: parsed.data.workDescription,
      infringing_ref: parsed.data.infringingRef,
      accused_user_id: parsed.data.accusedUserId ?? null,
    });
    // Audit only: reporter details are never logged.
    scheduleAudit({
      actor: "guest",
      action: "strike.created",
      target: row.id,
      metadata: { accusedUserId: parsed.data.accusedUserId ?? null },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    // Phase 5: same event on the integration bus (webhook fan-out).
    // Swallowed on failure — never changes this response.
    void dispatchEventSafe(
      makeDomainEvent("strike.created", {
        targetId: row.id,
        actor: "guest",
        payload: { accusedUserId: parsed.data.accusedUserId ?? null },
      }),
    );
    return NextResponse.json({ filed: true, id: row.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Intake failed";
    return NextResponse.json(
      { error: `Takedown intake failed: ${message}` },
      { status: 502 },
    );
  }
}

export async function GET(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const identity = await getAdminIdentity();
  if (!isAdmin(identity)) {
    return NextResponse.json(
      { error: "Admin access required. Sign in with an admin account." },
      { status: 401 },
    );
  }
  const db = resolveRightsDb();
  if (!db) {
    return NextResponse.json(
      { error: "Review queue is not connected yet (no database on the server)." },
      { status: 503 },
    );
  }
  try {
    const rows = await listStrikeRows(db);
    return NextResponse.json({ strikes: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "List failed";
    return NextResponse.json(
      { error: `Review queue failed: ${message}` },
      { status: 502 },
    );
  }
}
