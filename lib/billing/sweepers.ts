/**
 * Dunning sweeper (ClipForge Phase 8).
 *
 * The same step logic the manual admin run uses (see
 * app/api/admin/billing/dunning/run), extracted so the scheduled
 * cron route and the manual route share one implementation. A
 * "retry" step only bumps the attempt count, schedules the next
 * retry, and notifies in-app — it NEVER charges a card (the
 * merchant of record owns actual payment retries). A "cancel" step
 * only fires after the configured grace period. Nothing here
 * suspends or blocks a user.
 */

import { nextDunningStep } from "./dunning";
import {
  createNotification,
  listSubscriptions,
  updateSubscription,
  type BillingDb,
} from "./store";

export type DunningSweepStep = {
  subscriptionId: string;
  userId: string;
  action: "retry" | "cancel";
  nextRetryAt: string | null;
};

export type DunningSweepResult = {
  retried: number;
  canceled: number;
  waiting: number;
  steps: DunningSweepStep[];
};

/**
 * Advance every past_due subscription one dunning step. Returns
 * counts plus the per-subscription steps so callers can audit them
 * with their own actor. Never throws for a single bad row — a
 * failed update is skipped and counted as waiting.
 */
export async function runDunningSweep(
  db: BillingDb,
  nowMs: number = Date.now(),
): Promise<DunningSweepResult> {
  const pastDue = await listSubscriptions(db, "past_due").catch(() => []);
  let retried = 0;
  let canceled = 0;
  let waiting = 0;
  const steps: DunningSweepStep[] = [];
  for (const sub of pastDue) {
    const step = nextDunningStep({
      attempts: sub.dunning_attempts,
      startedAt: sub.dunning_started_at,
      nextRetryAt: sub.dunning_next_retry_at,
      nowMs,
    });
    if (step.action === "wait") {
      waiting++;
      continue;
    }
    try {
      if (step.action === "retry") {
        await updateSubscription(db, sub.id, {
          dunning_attempts: sub.dunning_attempts + 1,
          dunning_next_retry_at: step.nextRetryAt,
        });
        await createNotification(db, {
          user_id: sub.user_id,
          kind: "billing_payment_retry",
          title: "Payment retry scheduled",
          body: "Your payment will be retried. Please update your payment method if it keeps failing.",
        });
        retried++;
      } else {
        await updateSubscription(db, sub.id, {
          status: "canceled",
          canceled_at: new Date(nowMs).toISOString(),
          cancel_at_period_end: false,
        });
        await createNotification(db, {
          user_id: sub.user_id,
          kind: "billing_subscription_canceled",
          title: "Subscription canceled",
          body: "Your subscription was canceled after repeated payment failures. You can resubscribe anytime.",
        });
        canceled++;
      }
      steps.push({
        subscriptionId: sub.id,
        userId: sub.user_id,
        action: step.action,
        nextRetryAt: step.nextRetryAt,
      });
    } catch {
      waiting++;
    }
  }
  return { retried, canceled, waiting, steps };
}
