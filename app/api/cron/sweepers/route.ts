import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { resolveBillingDb } from "@/lib/billing/store";
import { runDunningSweep } from "@/lib/billing/sweepers";
import { resolveIntegrationDb } from "@/lib/integrations/store";
import { runWebhookRetrySweep } from "@/lib/integrations/sweepers";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/sweepers — scheduled sweeper (ClipForge Phase 8).
 *
 * Runs the two retries that used to be manual-only:
 *  - webhook delivery retries (due, undelivered, attempts left)
 *  - dunning steps (same schedule + grace rules as the manual run)
 *
 * Auth is the cron bearer secret ONLY: Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET` automatically when the
 * variable is set. Without CRON_SECRET the route honestly 503s
 * (never open). No IP rate limit here — the secret is the gate
 * and the route runs once a day. Nothing here charges a card or
 * blocks a user: dunning "retry" only bumps attempt counts and
 * notifies; cancellation still needs the grace period to expire.
 * Schedule lives in vercel.json (daily).
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Scheduled sweepers are not configured (CRON_SECRET)." },
      { status: 503 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const nowMs = Date.now();
  const webhooks = { attempted: 0, delivered: 0, failed: 0, skipped: 0 };
  const integrationDb = resolveIntegrationDb();
  if (integrationDb) {
    const result = await runWebhookRetrySweep(integrationDb, {
      nowMs,
    }).catch(() => null);
    if (result) {
      webhooks.attempted = result.attempted;
      webhooks.delivered = result.delivered;
      webhooks.failed = result.failed;
      webhooks.skipped = result.skipped;
    }
  }
  const dunning = { retried: 0, canceled: 0, waiting: 0 };
  const billingDb = resolveBillingDb();
  if (billingDb) {
    const result = await runDunningSweep(billingDb, nowMs).catch(() => null);
    if (result) {
      dunning.retried = result.retried;
      dunning.canceled = result.canceled;
      dunning.waiting = result.waiting;
      for (const step of result.steps) {
        scheduleAudit({
          actor: "cron",
          action: "billing.dunning_step",
          target: step.subscriptionId,
          metadata: { step: step.action, via: "sweeper" },
          ip: getClientIp(req),
          user_agent: req.headers.get("user-agent"),
        });
      }
    }
  }
  return NextResponse.json({ webhooks, dunning });
}
