/**
 * Dunning (ClipForge Phase 6).
 *
 * Failed payments follow a configured retry schedule, then cancel
 * after a configured grace period. Both are owner-configurable:
 * BILLING_DUNNING_RETRY_DAYS (comma list, default "1,3,7") and
 * BILLING_DUNNING_GRACE_DAYS (default 14). Pure functions over the
 * subscription row + "now", so the schedule is unit-testable.
 * Notifications go in-app (clipper_notifications); email stays
 * inert until a working mail provider lands.
 */

export type DunningDecision =
  | { action: "wait"; nextRetryAt: string | null }
  | { action: "retry"; nextRetryAt: string | null }
  | { action: "cancel"; nextRetryAt: null };

export function dunningRetryDays(
  env: Record<string, string | undefined> = process.env,
): number[] {
  const raw = env.BILLING_DUNNING_RETRY_DAYS ?? "1,3,7";
  const days = raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  return days.length > 0 ? days : [1, 3, 7];
}

export function dunningGraceDays(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number.parseInt(env.BILLING_DUNNING_GRACE_DAYS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 14;
}

/**
 * Next dunning step for a past_due subscription. attempts counts
 * retries already sent; startedAt is when dunning began (ISO).
 * - Past grace → cancel.
 * - Next retry day reached → retry (and schedule the following one).
 * - Otherwise → wait until the next retry day.
 */
export function nextDunningStep(input: {
  attempts: number;
  startedAt: string | null;
  nextRetryAt: string | null;
  nowMs?: number;
  env?: Record<string, string | undefined>;
}): DunningDecision {
  const nowMs = input.nowMs ?? Date.now();
  const env = input.env ?? process.env;
  const retryDays = dunningRetryDays(env);
  const graceMs = dunningGraceDays(env) * 24 * 60 * 60 * 1000;
  const startedMs = input.startedAt ? Date.parse(input.startedAt) : NaN;
  if (Number.isFinite(startedMs) && nowMs - startedMs >= graceMs) {
    return { action: "cancel", nextRetryAt: null };
  }
  if (input.attempts >= retryDays.length) {
    // Retries exhausted but grace remains: wait for grace to cancel.
    return { action: "wait", nextRetryAt: null };
  }
  const nextDay = retryDays[input.attempts];
  const base = Number.isFinite(startedMs) ? startedMs : nowMs;
  const scheduled = new Date(
    base + nextDay * 24 * 60 * 60 * 1000,
  ).toISOString();
  if (input.nextRetryAt && Date.parse(input.nextRetryAt) > nowMs) {
    return { action: "wait", nextRetryAt: input.nextRetryAt };
  }
  return { action: "retry", nextRetryAt: scheduled };
}
