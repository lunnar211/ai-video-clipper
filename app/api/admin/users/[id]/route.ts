import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import {
  getUserRow,
  listUserProjects,
  listUserClips,
  listUserPosts,
  listUserAccounts,
  listSupportNotes,
  listCreditAdjustments,
  countUserDeclarations,
  listUserFingerprintScans,
  listUserStrikes,
} from "@/lib/admin/store";
import { assembleDrilldown } from "@/lib/admin/users";

/**
 * GET /api/admin/users/[id] — full user drill-down: profile, plan,
 * usage minutes, projects, connected accounts (STATUS ONLY — never
 * tokens), posts timeline, compliance record (declarations,
 * fingerprint scans, strikes), support notes, credit adjustments +
 * balance. Console roles only.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await adminGate(req, CONSOLE_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "The admin database is not configured yet." },
      { status: 503 },
    );
  }
  const { id } = await params;
  try {
    const user = await getUserRow(db, id);
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    const [
      projects,
      clips,
      posts,
      accounts,
      supportNotes,
      creditAdjustments,
      declarationCount,
      fingerprintScans,
      strikes,
    ] = await Promise.all([
      listUserProjects(db, id),
      listUserClips(db, id),
      listUserPosts(db, id),
      listUserAccounts(db, id),
      listSupportNotes(db, id),
      listCreditAdjustments(db, id),
      countUserDeclarations(db, id),
      listUserFingerprintScans(db, id),
      listUserStrikes(db, id),
    ]);
    const drilldown = assembleDrilldown({
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        role: user.role,
        status: user.status,
        publishing_paused: user.publishing_paused,
        created_at: user.created_at,
      },
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        created_at: p.created_at,
      })),
      clips: clips.map((c) => ({
        id: c.id,
        title: c.title,
        start_seconds: c.start_seconds,
        end_seconds: c.end_seconds,
        created_at: c.created_at,
      })),
      posts: posts.map((p) => ({
        id: p.id,
        clip_ref: p.clip_ref,
        status: p.status,
        schedule_at: p.schedule_at,
        created_at: p.created_at,
      })),
      accounts,
      declarationCount,
      fingerprintScanCount: fingerprintScans.length,
      strikeCount: strikes.length,
      upheldStrikeCount: strikes.filter((s) => s.status === "upheld").length,
      supportNotes: supportNotes.map((n) => ({
        id: n.id,
        user_id: n.user_id,
        admin_id: n.admin_id,
        note: n.note,
        created_at: n.created_at,
      })),
      creditAdjustments: creditAdjustments.map((a) => ({
        id: a.id,
        user_id: a.user_id,
        admin_id: a.admin_id,
        delta_clips: a.delta_clips,
        reason: a.reason,
        created_at: a.created_at,
      })),
    });
    return NextResponse.json({ user: drilldown });
  } catch {
    return NextResponse.json(
      { error: "User detail failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
