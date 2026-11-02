import { NextResponse } from "next/server";
import {
  appealSchema,
  createAppealRow,
} from "@/lib/rights/strikes";
import { resolveRightsDb } from "@/lib/rights/declarations";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Strike appeal intake (ClipForge Phase 2). Public form: the account
 * holder appeals a strike by id with a reason. Stored when a
 * database is configured; 503 honestly otherwise (the form then
 * points at the Contact page).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = appealSchema.safeParse({ ...(body as object), strikeId: id });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid appeal.", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const db = resolveRightsDb();
  if (!db) {
    return NextResponse.json(
      {
        error:
          "Appeal intake is not connected yet (no database on the server). Please send your appeal to the contact address on the Contact page instead — nothing was filed.",
      },
      { status: 503 },
    );
  }
  try {
    const row = await createAppealRow(db, {
      strike_id: parsed.data.strikeId,
      appellant_name: parsed.data.appellantName,
      appellant_email: parsed.data.appellantEmail,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ filed: true, id: row.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Intake failed";
    return NextResponse.json(
      { error: `Appeal intake failed: ${message}` },
      { status: 502 },
    );
  }
}
