import { NextResponse } from "next/server";
import { apiKeyAuth } from "@/lib/integrations/apiAuth";
import { resolveIntegrationDb } from "@/lib/integrations/store";
import { listUserProjects } from "@/lib/admin/store";

/**
 * GET /api/v1/projects — the key owner's projects (id, title,
 * created_at). API key with read scope. 401 without a valid key,
 * 403 for insufficient scope, 429 over the per-key limit, 503
 * without a database.
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
    const projects = await listUserProjects(db, key.user_id);
    return NextResponse.json({ projects });
  } catch {
    return NextResponse.json(
      { error: "Project list failed." },
      { status: 500 },
    );
  }
}
