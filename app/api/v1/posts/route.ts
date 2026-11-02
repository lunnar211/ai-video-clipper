import { NextResponse } from "next/server";
import { apiKeyAuth } from "@/lib/integrations/apiAuth";
import { resolveIntegrationDb } from "@/lib/integrations/store";
import { listUserPosts } from "@/lib/admin/store";

/**
 * GET /api/v1/posts — the key owner's posts (id, clip ref, status,
 * schedule time, created_at; never tokens). API key with read scope.
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
    const posts = await listUserPosts(db, key.user_id);
    return NextResponse.json({ posts });
  } catch {
    return NextResponse.json(
      { error: "Post list failed." },
      { status: 500 },
    );
  }
}
