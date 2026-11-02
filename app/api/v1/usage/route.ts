import { NextResponse } from "next/server";
import { apiKeyAuth } from "@/lib/integrations/apiAuth";
import { resolveIntegrationDb } from "@/lib/integrations/store";
import {
  listUserClips,
  listUserPosts,
  listUserProjects,
} from "@/lib/admin/store";

/**
 * GET /api/v1/usage — the key owner's usage summary: counts of
 * projects, clips, and posts (by status), plus total clip seconds
 * summed from clip start/end. Real aggregates over the owner's rows
 * — never estimates. API key with read scope.
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
    const [projects, clips, posts] = await Promise.all([
      listUserProjects(db, key.user_id),
      listUserClips(db, key.user_id),
      listUserPosts(db, key.user_id),
    ]);
    const postsByStatus: Record<string, number> = {};
    for (const post of posts) {
      postsByStatus[post.status] = (postsByStatus[post.status] ?? 0) + 1;
    }
    const totalClipSeconds = clips.reduce(
      (sum, clip) => sum + Math.max(0, clip.end_seconds - clip.start_seconds),
      0,
    );
    return NextResponse.json({
      usage: {
        projects: projects.length,
        clips: clips.length,
        totalClipSeconds,
        posts: posts.length,
        postsByStatus,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Usage summary failed." },
      { status: 500 },
    );
  }
}
