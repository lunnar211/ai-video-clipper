/**
 * Plan definitions (ClipForge Phase 6).
 *
 * Limits are OWNER-CONFIGURABLE, not hard-coded prices: the built-in
 * defaults below are PLACEHOLDERS the owner must confirm before any
 * launch (see docs/PHASE6.md). They describe product behavior (how
 * many minutes, projects, seats, publish targets a plan allows) and
 * are overridable with BILLING_PLANS_JSON, a JSON object keyed by
 * plan id with any subset of the limit fields.
 *
 * PRICES ARE NOT HERE. Prices live in the merchant-of-record
 * dashboard as price IDs, referenced from env (PADDLE_PRO_PRICE_ID,
 * PADDLE_AGENCY_PRICE_ID, LEMONSQUEEZY_*). A plan with no price ID
 * configured cannot be checked out — the checkout route answers
 * 503 "price not configured" rather than inventing a price.
 *
 * -1 means unlimited for a limit field.
 */

import { z } from "zod";

function envValue(
  name: string,
  env: Record<string, string | undefined>,
): string | null {
  const value = env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

export const PLAN_IDS = ["free", "pro", "agency"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanLimits = {
  minutesPerMonth: number;
  projects: number;
  seats: number;
  publishTargets: number;
};

export type PlanDefinition = PlanLimits & {
  id: PlanId;
  /** True when these limits are the built-in placeholders. */
  placeholder: boolean;
};

const limitFields = z.object({
  minutesPerMonth: z.number().int().min(-1).optional(),
  projects: z.number().int().min(-1).optional(),
  seats: z.number().int().min(-1).optional(),
  publishTargets: z.number().int().min(-1).optional(),
});

const plansOverrideSchema = z.record(z.string(), limitFields);

/** Built-in PLACEHOLDER limits — the owner confirms or replaces them. */
export const PLACEHOLDER_PLANS: Record<PlanId, PlanLimits> = {
  free: { minutesPerMonth: 30, projects: 3, seats: 1, publishTargets: 1 },
  pro: { minutesPerMonth: 600, projects: 50, seats: 1, publishTargets: 3 },
  agency: {
    minutesPerMonth: 3000,
    projects: -1,
    seats: 5,
    publishTargets: 10,
  },
};

/** Parse BILLING_PLANS_JSON (empty/invalid → no overrides). */
export function planOverrides(
  env: Record<string, string | undefined> = process.env,
): Partial<Record<PlanId, Partial<PlanLimits>>> {
  const raw = env.BILLING_PLANS_JSON;
  if (!raw) return {};
  try {
    const parsed = plansOverrideSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return {};
    const out: Partial<Record<PlanId, Partial<PlanLimits>>> = {};
    for (const id of PLAN_IDS) {
      if (parsed.data[id]) out[id] = parsed.data[id];
    }
    return out;
  } catch {
    return {};
  }
}

/** Effective plan definitions: placeholder defaults + owner overrides. */
export function getPlans(
  env: Record<string, string | undefined> = process.env,
): Record<PlanId, PlanDefinition> {
  const overrides = planOverrides(env);
  const out = {} as Record<PlanId, PlanDefinition>;
  for (const id of PLAN_IDS) {
    const merged = { ...PLACEHOLDER_PLANS[id], ...overrides[id] };
    out[id] = {
      id,
      ...merged,
      placeholder: overrides[id] === undefined,
    };
  }
  return out;
}

export function getPlan(
  id: string,
  env: Record<string, string | undefined> = process.env,
): PlanDefinition | null {
  if (!(PLAN_IDS as readonly string[]).includes(id)) return null;
  return getPlans(env)[id as PlanId];
}

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

/**
 * Price ID for a plan from env, per MoR provider. Free has no price
 * (it is never sold). Returns null when the owner has not configured
 * a price ID for that plan — callers must refuse checkout then.
 */
export function priceIdForPlan(
  plan: PlanId,
  provider: "paddle" | "lemonsqueezy",
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (plan === "free") return null;
  if (provider === "paddle") {
    if (plan === "pro") return envValue("PADDLE_PRO_PRICE_ID", env);
    return envValue("PADDLE_AGENCY_PRICE_ID", env);
  }
  if (plan === "pro") return envValue("LEMONSQUEEZY_PRO_PRICE_ID", env);
  return envValue("LEMONSQUEEZY_AGENCY_PRICE_ID", env);
}

/** Plan id for a configured price ID, or null when unknown. */
export function planFromPriceId(
  priceId: string,
  provider: "paddle" | "lemonsqueezy",
  env: Record<string, string | undefined> = process.env,
): PlanId | null {
  for (const plan of PLAN_IDS) {
    if (plan === "free") continue;
    if (priceIdForPlan(plan, provider, env) === priceId) return plan;
  }
  return null;
}

/**
 * -1 (unlimited) always passes; otherwise usage may reach the
 * limit exactly. Plan numbers are inclusive: a 30-minute plan
 * allows 30 minutes, a 3-target plan allows 3 targets. (A strict
 * `<` here silently sold one less than the configured limit —
 * the 30th minute and the 3rd target were refused. Fixed in
 * Phase 8 when the gates started using this helper.)
 */
export function withinLimit(limit: number, usage: number): boolean {
  if (limit < 0) return true;
  return usage <= limit;
}

/** Remaining allowance; -1 (unlimited) reports null, never a number. */
export function remainingAllowance(
  limit: number,
  usage: number,
): number | null {
  if (limit < 0) return null;
  return Math.max(0, limit - usage);
}
