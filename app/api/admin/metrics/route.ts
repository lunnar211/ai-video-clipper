import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import {
  resolveAdminDb,
  listUserRows,
  listRenderJobs,
  listAllTargets,
  listAllStrikes,
} from "@/lib/admin/store";
import { listAudit } from "@/lib/admin/audit";
import {
  dauMau,
  funnel,
  queueHealth,
  costByUser,
  costByFeature,
  revenue,
  publishSuccessByPlatform,
  topErrors,
  strikeStats,
  detectAnomalies,
} from "@/lib/admin/metrics";
import { alertConfig } from "@/lib/admin/alerts";

/**
 * GET /api/admin/metrics — every dashboard number, computed from real
 * database rows (users, audit log, render jobs, publish targets,
 * strikes). No number is invented: when the database is not
 * configured the route 503s and the dashboard shows setup
 * instructions; with a database but no rows, every aggregate is an
 * honest zero/empty. MRR is reported as unavailable until
 * subscription data exists (never estimated).
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
  try {
    const now = Date.now();
    const [users, audit, renderJobs, targets, strikes] = await Promise.all([
      listUserRows(db),
      listAudit(db, { limit: 1000 }),
      listRenderJobs(db),
      listAllTargets(db),
      listAllStrikes(db),
    ]);
    const config = alertConfig();
    return NextResponse.json({
      dauMau: dauMau(audit, now),
      funnel: funnel(users, audit),
      queueHealth: queueHealth(
        renderJobs,
        targets.map((t) => ({ status: t.status })),
      ),
      costByUser: costByUser(audit),
      costByFeature: costByFeature(audit),
      revenue: revenue(users),
      publishSuccessByPlatform: publishSuccessByPlatform(targets),
      topErrors: topErrors(audit, targets),
      strikeStats: strikeStats(strikes),
      anomalies: detectAnomalies(
        audit,
        config.volumeThresholdPerHour,
        config.ipUsersThreshold,
        now,
      ),
    });
  } catch {
    return NextResponse.json(
      { error: "Metrics failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
