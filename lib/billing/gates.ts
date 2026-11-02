/**
 * Plan hard-gating (ClipForge Phase 8).
 *
 * Phase 6 metered usage but never refused anything: a Free user
 * could render or publish past every limit. These pure checks
 * enforce the plan server-side at render, publish, and project
 * creation time. Limits come from the billing config
 * (BILLING_PLANS_JSON overrides, placeholder defaults otherwise) —
 * this module invents no prices and no limits.
 *
 * Gating applies only when the caller is authenticated AND the
 * billing database resolves: guests keep the browser-side caps
 * (3 free renders / day, 500 MB, 10 minutes) because there is no
 * user to meter. Callers pass usage figures in; this module never
 * reads the database, so it stays unit-testable.
 *
 * Each action checks only its own limit: rendering and publishing
 * check monthly minutes (publishing also checks target count);
 * project creation checks the project count. A user at their
 * project limit can still render and publish existing projects.
 */

import { getPlan, withinLimit, type PlanId } from "./plans";
import { consumptionMinutes } from "./metering";

export type GateResult =
  | { allowed: true }
  | {
      allowed: false;
      /** Machine-readable reason for the refusal. */
      reason: "minutes_exceeded" | "projects_exceeded" | "targets_exceeded";
      limit: number;
      usage: number;
    };

function planOrFree(planId: string): PlanId {
  return planId === "pro" || planId === "agency" ? planId : "free";
}

/** Monthly-minutes check for a metered action. */
export function checkMinutesGate(input: {
  planId: string;
  minutesUsedThisMonth: number;
  requestedMinutes: number;
}): GateResult {
  const plan = getPlan(planOrFree(input.planId));
  if (!plan) return { allowed: true };
  const after = input.minutesUsedThisMonth + input.requestedMinutes;
  if (!withinLimit(plan.minutesPerMonth, after)) {
    return {
      allowed: false,
      reason: "minutes_exceeded",
      limit: plan.minutesPerMonth,
      usage: after,
    };
  }
  return { allowed: true };
}

/** Project-count check for project creation (count AFTER creation). */
export function checkProjectGate(input: {
  planId: string;
  projectCount: number;
}): GateResult {
  const plan = getPlan(planOrFree(input.planId));
  if (!plan) return { allowed: true };
  const after = input.projectCount + 1;
  if (!withinLimit(plan.projects, after)) {
    return {
      allowed: false,
      reason: "projects_exceeded",
      limit: plan.projects,
      usage: after,
    };
  }
  return { allowed: true };
}

/** Publish-target check for a post with this many targets. */
export function checkTargetsGate(input: {
  planId: string;
  targetCount: number;
}): GateResult {
  const plan = getPlan(planOrFree(input.planId));
  if (!plan) return { allowed: true };
  if (!withinLimit(plan.publishTargets, input.targetCount)) {
    return {
      allowed: false,
      reason: "targets_exceeded",
      limit: plan.publishTargets,
      usage: input.targetCount,
    };
  }
  return { allowed: true };
}

/** Minutes a clip of this length would consume (min 1). */
export function minutesForClip(durationSec: number): number {
  return consumptionMinutes(durationSec);
}

/** Human-readable refusal for a gate result (no prices, no upsell). */
export function gateRefusalMessage(
  result: Extract<GateResult, { allowed: false }>,
): string {
  if (result.reason === "minutes_exceeded") {
    return `Monthly minute limit reached (${result.usage} of ${result.limit} minutes used).`;
  }
  if (result.reason === "projects_exceeded") {
    return `Project limit reached (${result.usage} of ${result.limit} projects).`;
  }
  return `Publish target limit reached (${result.usage} of ${result.limit} targets).`;
}
