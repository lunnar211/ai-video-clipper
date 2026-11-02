/**
 * Cancellation (ClipForge Phase 6).
 *
 * Two modes, kept distinct on purpose:
 * - immediate: access ends now; the subscription row becomes
 *   "canceled" with canceled_at set.
 * - end_of_period: the subscription stays active until
 *   current_period_end; cancel_at_period_end is set and the MoR
 *   (or a later webhook) confirms the final cancel.
 *
 * Cancel is NEVER delete: the user's projects, clips, and data
 * remain, and GDPR deletion (Phase 5) is a separate, explicit act.
 * Both modes are documented plainly on the cancel route and page.
 */

import type { SubscriptionRow } from "./store";

export type CancelMode = "immediate" | "end_of_period";

export type CancelPatch = Partial<SubscriptionRow>;

/** Patch fields for a cancel request (pure, testable). */
export function cancelPatch(
  sub: SubscriptionRow,
  mode: CancelMode,
  nowMs = Date.now(),
): CancelPatch {
  const now = new Date(nowMs).toISOString();
  if (mode === "immediate") {
    return {
      status: "canceled",
      canceled_at: now,
      cancel_at_period_end: false,
    };
  }
  return { cancel_at_period_end: true };
}

/** What access remains: active until this timestamp (or null). */
export function accessUntil(sub: SubscriptionRow): string | null {
  if (sub.status === "canceled") return sub.canceled_at;
  if (sub.cancel_at_period_end) return sub.current_period_end;
  return sub.current_period_end;
}

/** True while the subscription still grants plan access. */
export function hasAccess(
  sub: SubscriptionRow,
  nowMs = Date.now(),
): boolean {
  if (sub.status === "canceled") return false;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  if (sub.current_period_end) {
    return Date.parse(sub.current_period_end) > nowMs;
  }
  return true;
}
