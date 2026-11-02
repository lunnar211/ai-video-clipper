import { NextResponse } from "next/server";
import { apiKeyAuth } from "@/lib/integrations/apiAuth";
import { resolveIntegrationDb } from "@/lib/integrations/store";
import { listUserClips } from "@/lib/admin/store";

/**
 * GET /api/v1/clips — the key owner's clips (id, title, start/end,
 * created_at; never transcripts or media). API key with read scope.
 */
export async function GET(req: Request) {
  const { key, errorResponse } = await apiKeyAuth(req, "read");
  if (errorResponse) return errorResponse;
  const db = resolveIntegrationDb();
  if (!db) {
    return NextResponse.json(
      { error: "The integrations database is not configured yet." },
      { status: 503 },
    );
  }
  try {
    const clips = await listUserClips(db, key.user_id);
    return NextResponse.json({ clips });
  } catch {
    return NextResponse.json(
      { error: "Clip list failed." },
      { status: 500 },
    );
  }
}
