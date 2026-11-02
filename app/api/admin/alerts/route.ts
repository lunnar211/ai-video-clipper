import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES, ACTION_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import {
  createAdminAlert,
  listAdminAlerts,
} from "@/lib/admin/store";
import { listAudit, emitAuditSafe } from "@/lib/admin/audit";
import { detectAnomalies, type Anomaly } from "@/lib/admin/metrics";
import {
  alertConfig,
  dispatchAnomaly,
} from "@/lib/admin/alerts";

/**
 * GET /api/admin/alerts — current anomaly evaluation over recent
 * audit rows + stored alerts (console roles). Thresholds are
 * returned; webhook URLs are NEVER returned to the client.
 * POST — evaluate + dispatch to every configured webhook channel
 * and store the alerts (owner/admin). Without any configured
 * webhook, dispatch reports "not configured" honestly and the
 * in-console alerts still work.
 */
async function evaluate(db: NonNullable<ReturnType<typeof resolveAdminDb>>) {
  const now = Date.now();
  const audit = await listAudit(db, { limit: 1000 });
  const config = alertConfig();
  const anomalies: Anomaly[] = detectAnomalies(
    audit,
    config.volumeThresholdPerHour,
    config.ipUsersThreshold,
    now,
  );
  return { anomalies, config };
}

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
    const { anomalies, config } = await evaluate(db);
    const stored = await listAdminAlerts(db);
    return NextResponse.json({
      anomalies,
      storedAlerts: stored,
      thresholds: {
        volumeThresholdPerHour: config.volumeThresholdPerHour,
        ipUsersThreshold: config.ipUsersThreshold,
      },
      channelsConfigured: {
        slack: config.slackWebhookUrl !== null,
        discord: config.discordWebhookUrl !== null,
        email: config.emailWebhookUrl !== null,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Alert evaluation failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429 },
    );
  }
  const { session, errorResponse } = await adminGate(req, ACTION_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "The admin database is not configured yet." },
      { status: 503 },
    );
  }
  try {
    const { anomalies, config } = await evaluate(db);
    const dispatched: { rule: string; channel: string; sent: boolean; reason?: string }[] = [];
    for (const anomaly of anomalies) {
      await createAdminAlert(db, {
        rule: anomaly.rule,
        severity: anomaly.severity,
        detail: anomaly.detail,
      });
      const results = await dispatchAnomaly(anomaly, config);
      for (const r of results) {
        dispatched.push({ rule: anomaly.rule, channel: r.channel, sent: r.sent, reason: r.reason });
      }
    }
    await emitAuditSafe({
      actor: session.userId,
      action: "admin.alert_dispatch",
      target: null,
      metadata: { anomalyCount: anomalies.length },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ anomalies, dispatched });
  } catch {
    return NextResponse.json(
      { error: "Alert dispatch failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
