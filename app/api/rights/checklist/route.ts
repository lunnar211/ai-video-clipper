import { NextResponse } from "next/server";
import {
  checklistSchema,
  checklistComplete,
  createChecklistRow,
} from "@/lib/rights/checklist";
import { resolveRightsDb } from "@/lib/rights/declarations";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Per-post compliance checklist records (ClipForge Phase 2).
 *
 * POST validates the four ticks and stores the record when a
 * database is configured. Without one it answers 503 honestly — the
 * checklist UI still works session-locally and says so. A record
 * with incomplete ticks is rejected: a checklist is only meaningful
 * when every item is ticked.
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
  const parsed = checklistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid checklist record.", details: parsed.error.issues },
      { status: 400 },
    );
  }
  if (!checklistComplete(parsed.data.ticks)) {
    return NextResponse.json(
      { error: "All four checklist items must be ticked before the record is stored." },
      { status: 400 },
    );
  }
  const db = resolveRightsDb();
  if (!db) {
    return NextResponse.json(
      {
        error:
          "Checklist storage is not connected yet (no database on the server). Your ticks still apply in this session — they are a session-only record until database setup lands.",
      },
      { status: 503 },
    );
  }
  try {
    const row = await createChecklistRow(db, parsed.data);
    return NextResponse.json({ stored: true, id: row.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Storage failed";
    return NextResponse.json(
      { error: `Checklist storage failed: ${message}` },
      { status: 502 },
    );
  }
}
