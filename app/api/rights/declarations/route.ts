import { NextResponse } from "next/server";
import {
  declarationSchema,
  resolveRightsDb,
  createDeclarationRow,
  getDeclarationRow,
  DECLARATION_TEXT,
} from "@/lib/rights/declarations";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";

export const runtime = "nodejs";

/**
 * Per-project ownership declarations (ClipForge Phase 2).
 *
 * POST stores an immutable declaration record (user id when signed
 * in, IP, timestamp, project id, text version). Without a configured
 * database it answers 503 honestly — the session checkbox remains
 * the fallback and the UI labels it session-only.
 * GET ?projectId= answers whether a record exists for the project.
 */

async function sessionUserId(): Promise<string | null> {
  try {
    const client = await createSupabaseServerClient();
    if (!client) return null;
    const { data } = await client.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const db = resolveRightsDb();
  if (!db) {
    return NextResponse.json(
      {
        error:
          "Declaration storage is not connected yet (no database on the server). Your session checkbox still applies — it is a session-only record until database setup lands.",
      },
      { status: 503 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = declarationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid declaration request.", details: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const row = await createDeclarationRow(db, {
      user_id: await sessionUserId(),
      project_id: parsed.data.projectId,
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
      declaration_text: DECLARATION_TEXT,
      declaration_text_version: parsed.data.declarationTextVersion,
    });
    return NextResponse.json({
      stored: true,
      acceptedAt: row.accepted_at,
      declarationTextVersion: row.declaration_text_version,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Storage failed";
    return NextResponse.json(
      { error: `Declaration storage failed: ${message}` },
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
  const db = resolveRightsDb();
  if (!db) {
    return NextResponse.json(
      {
        error:
          "Declaration storage is not connected yet (no database on the server).",
      },
      { status: 503 },
    );
  }
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json(
      { error: "Expected ?projectId=." },
      { status: 400 },
    );
  }
  try {
    const row = await getDeclarationRow(db, projectId);
    return NextResponse.json({
      declared: row !== null,
      acceptedAt: row?.accepted_at ?? null,
      declarationTextVersion: row?.declaration_text_version ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed";
    return NextResponse.json(
      { error: `Declaration lookup failed: ${message}` },
      { status: 502 },
    );
  }
}
