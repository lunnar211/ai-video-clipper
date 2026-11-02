/**
 * Webhook retry sweeper (ClipForge Phase 8).
 *
 * Re-attempts due webhook deliveries in batches, reusing the same
 * replay path the manual admin replay uses (same signing, same
 * backoff, same delivery-row updates). A delivery is due when it
 * is not delivered, has attempts left, and its next_attempt_at is
 * unset or in the past. Delivered rows are never retried. The
 * delivery row itself is the record — no extra audit spam.
 */

import type { FetchImpl } from "@/lib/ai/providers";
import { replayDelivery } from "./dispatch";
import {
  listWebhookDeliveries,
  type IntegrationDb,
} from "./store";

export type WebhookSweepResult = {
  attempted: number;
  delivered: number;
  failed: number;
  skipped: number;
};

/** Max attempts per delivery before the sweeper stops retrying. */
export const WEBHOOK_SWEEP_MAX_ATTEMPTS = 5;
/** Max deliveries per sweeper run (keeps the cron invocation short). */
export const WEBHOOK_SWEEP_BATCH = 20;

/** Pure due-check: not delivered, attempts left, next attempt due. */
export function isDeliveryDue(
  delivery: {
    status: string;
    attempts: number;
    next_attempt_at: string | null;
  },
  nowMs: number,
  maxAttempts: number = WEBHOOK_SWEEP_MAX_ATTEMPTS,
): boolean {
  if (delivery.status === "delivered") return false;
  if (delivery.attempts >= maxAttempts) return false;
  if (delivery.next_attempt_at === null) return true;
  return Date.parse(delivery.next_attempt_at) <= nowMs;
}

/**
 * Retry due deliveries, oldest first. Each attempt goes through
 * replayDelivery (endpoint lookup, secret decrypt, signed POST,
 * row update with the documented 1s×2/60s-cap backoff). A delivery
 * whose endpoint or key is unavailable is skipped, not failed.
 */
export async function runWebhookRetrySweep(
  db: IntegrationDb,
  opts: {
    nowMs?: number;
    batchLimit?: number;
    maxAttempts?: number;
    fetchImpl?: FetchImpl;
  } = {},
): Promise<WebhookSweepResult> {
  const nowMs = opts.nowMs ?? Date.now();
  const batchLimit = opts.batchLimit ?? WEBHOOK_SWEEP_BATCH;
  const maxAttempts = opts.maxAttempts ?? WEBHOOK_SWEEP_MAX_ATTEMPTS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const all = await listWebhookDeliveries(db, null, fetchImpl).catch(() => []);
  const due = all
    .filter((d) => isDeliveryDue(d, nowMs, maxAttempts))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, batchLimit);
  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  for (const delivery of due) {
    const result = await replayDelivery(db, delivery, fetchImpl).catch(
      () => null,
    );
    if (!result) {
      skipped++;
    } else if (result.status === "delivered") {
      delivered++;
    } else {
      failed++;
    }
  }
  return {
    attempted: delivered + failed,
    delivered,
    failed,
    skipped,
  };
}
