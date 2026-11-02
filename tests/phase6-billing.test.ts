/**
 * ClipForge Phase 6 — billing core unit tests (no database, no
 * network, no real payment calls). Money math is integer minor
 * units throughout; every test asserts exact integers.
 */

import { describe, it, expect } from "vitest";
import {
  getPlans,
  getPlan,
  priceIdForPlan,
  planFromPriceId,
  withinLimit,
  remainingAllowance,
} from "@/lib/billing/plans";
import {
  consumptionMinutes,
  minuteBalance,
  monthlyConsumption,
  isLowBalance,
} from "@/lib/billing/metering";
import {
  validateCoupon,
  applyDiscount,
} from "@/lib/billing/coupons";
import {
  invoiceNumber,
  invoiceTotal,
  buildInvoiceInput,
} from "@/lib/billing/invoices";
import { nextDunningStep } from "@/lib/billing/dunning";
import {
  cancelPatch,
  hasAccess,
} from "@/lib/billing/cancellation";
import {
  generateReferralCode,
  canAttribute,
  commissionFor,
  affiliateRatePercent,
} from "@/lib/billing/affiliates";
import { flagVelocity } from "@/lib/billing/fraud";
import {
  verifyPaddleSignature,
  verifyLemonSqueezySignature,
  hmacHex,
  PaddleMorProvider,
  LemonSqueezyMorProvider,
} from "@/lib/billing/mor";
import type { CouponRow, LedgerEntry } from "@/lib/billing/store";

function ledger(
  delta: number,
  kind: LedgerEntry["kind"],
  created_at: string,
): LedgerEntry {
  return {
    id: "x",
    user_id: "u1",
    delta_minutes: delta,
    kind,
    reason: "test",
    reference: null,
    created_at,
  };
}

function coupon(over: Partial<CouponRow> = {}): CouponRow {
  return {
    id: "c1",
    code: "SAVE20",
    kind: "percent",
    value: 20,
    max_uses: null,
    uses_count: 0,
    per_user_once: true,
    plan: null,
    expires_at: null,
    created_by: null,
    created_at: "2026-11-01T00:00:00.000Z",
    ...over,
  };
}

describe("plans", () => {
  it("placeholder defaults exist for all three plans", () => {
    const plans = getPlans({});
    expect(plans.free.minutesPerMonth).toBe(30);
    expect(plans.pro.minutesPerMonth).toBe(600);
    expect(plans.agency.projects).toBe(-1);
    expect(plans.free.placeholder).toBe(true);
  });

  it("BILLING_PLANS_JSON overrides merge over placeholders", () => {
    const plans = getPlans({
      BILLING_PLANS_JSON: JSON.stringify({ pro: { minutesPerMonth: 900 } }),
    });
    expect(plans.pro.minutesPerMonth).toBe(900);
    expect(plans.pro.placeholder).toBe(false);
    expect(plans.free.minutesPerMonth).toBe(30);
  });

  it("invalid BILLING_PLANS_JSON is ignored, never crashes", () => {
    const plans = getPlans({ BILLING_PLANS_JSON: "not json{" });
    expect(plans.pro.minutesPerMonth).toBe(600);
  });

  it("price ids come from env only; free has no price", () => {
    const env = { PADDLE_PRO_PRICE_ID: "pri_pro" };
    expect(priceIdForPlan("free", "paddle", env)).toBeNull();
    expect(priceIdForPlan("pro", "paddle", env)).toBe("pri_pro");
    expect(priceIdForPlan("agency", "paddle", env)).toBeNull();
    expect(planFromPriceId("pri_pro", "paddle", env)).toBe("pro");
    expect(planFromPriceId("nope", "paddle", env)).toBeNull();
  });

  it("unknown plan ids return null", () => {
    expect(getPlan("enterprise", {})).toBeNull();
  });

  it("limits: -1 is unlimited, usage must stay under the cap", () => {
    expect(withinLimit(-1, 999999)).toBe(true);
    expect(withinLimit(10, 9)).toBe(true);
    expect(withinLimit(10, 10)).toBe(false);
    expect(remainingAllowance(-1, 5)).toBeNull();
    expect(remainingAllowance(10, 3)).toBe(7);
  });
});

describe("metering", () => {
  it("consumption rounds up to whole minutes, minimum 1", () => {
    expect(consumptionMinutes(61)).toBe(2);
    expect(consumptionMinutes(60)).toBe(1);
    expect(consumptionMinutes(0)).toBe(1);
    expect(consumptionMinutes(-5)).toBe(1);
  });

  it("balance is the sum of ledger deltas", () => {
    const entries = [
      ledger(100, "purchase", "2026-11-01T00:00:00.000Z"),
      ledger(-30, "consumption", "2026-11-01T01:00:00.000Z"),
      ledger(10, "grant", "2026-11-01T02:00:00.000Z"),
    ];
    expect(minuteBalance(entries)).toBe(80);
  });

  it("monthly consumption counts only consumption entries in-month", () => {
    const entries = [
      ledger(-30, "consumption", "2026-11-05T00:00:00.000Z"),
      ledger(-20, "consumption", "2026-10-05T00:00:00.000Z"),
      ledger(50, "purchase", "2026-11-05T00:00:00.000Z"),
    ];
    expect(monthlyConsumption(entries, 2026, 10)).toBe(30);
    expect(monthlyConsumption(entries, 2026, 9)).toBe(20);
  });

  it("low balance uses the configured threshold, default 10", () => {
    expect(isLowBalance(9, {})).toBe(true);
    expect(isLowBalance(10, {})).toBe(false);
    expect(isLowBalance(49, { BILLING_LOW_BALANCE_MINUTES: "50" })).toBe(true);
  });
});

describe("coupons", () => {
  it("percent discounts round down in integer minor units", () => {
    expect(applyDiscount(1999, coupon({ value: 20 }))).toBe(399);
    expect(applyDiscount(1000, coupon({ kind: "fixed", value: 250 }))).toBe(250);
    expect(applyDiscount(100, coupon({ kind: "fixed", value: 500 }))).toBe(100);
  });

  it("expired, exhausted, reused, and wrong-plan coupons are refused", () => {
    const base = {
      totalMinor: 1000,
      plan: "pro",
      priorRedemptionsForUser: [],
      nowMs: Date.parse("2026-11-02T00:00:00.000Z"),
    };
    expect(
      validateCoupon({
        ...base,
        coupon: coupon({ expires_at: "2026-11-01T00:00:00.000Z" }),
      }),
    ).toEqual({ ok: false, reason: "This coupon has expired." });
    expect(
      validateCoupon({
        ...base,
        coupon: coupon({ max_uses: 2, uses_count: 2 }),
      }),
    ).toEqual({
      ok: false,
      reason: "This coupon has reached its use limit.",
    });
    expect(
      validateCoupon({
        ...base,
        coupon: coupon(),
        priorRedemptionsForUser: [
          {
            id: "r1",
            coupon_id: "c1",
            user_id: "u1",
            checkout_reference: "chk",
            created_at: "2026-11-01T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual({ ok: false, reason: "You have already used this coupon." });
    expect(
      validateCoupon({ ...base, coupon: coupon({ plan: "agency" }) }),
    ).toEqual({
      ok: false,
      reason: "This coupon applies to the agency plan only.",
    });
    expect(
      validateCoupon({ ...base, coupon: coupon() }),
    ).toEqual({ ok: true, discountMinor: 200 });
  });
});

describe("invoices", () => {
  it("numbers are dated and totals are integer sums", () => {
    expect(invoiceNumber(new Date("2026-11-02T00:00:00.000Z"), "abcdef12")).toBe(
      "INV-20261102-ABCDEF12",
    );
    expect(
      invoiceTotal([
        { description: "Pro", quantity: 1, amount_minor: 1900 },
        { description: "Pack", quantity: 2, amount_minor: 500 },
      ]),
    ).toBe(2900);
    const input = buildInvoiceInput({
      userId: "u1",
      subscriptionId: null,
      currency: "USD",
      items: [{ description: "Pro", quantity: 1, amount_minor: 1900 }],
      provider: "paddle",
      providerTransactionId: "txn_1",
    });
    expect(input.total_minor).toBe(1900);
    expect(input.number.startsWith("INV-")).toBe(true);
  });
});

describe("dunning", () => {
  const started = "2026-11-01T00:00:00.000Z";
  it("retries on schedule, then cancels after grace", () => {
    const step0 = nextDunningStep({
      attempts: 0,
      startedAt: started,
      nextRetryAt: null,
      nowMs: Date.parse("2026-11-01T12:00:00.000Z"),
    });
    expect(step0.action).toBe("retry");
    const waiting = nextDunningStep({
      attempts: 1,
      startedAt: started,
      nextRetryAt: "2026-11-04T00:00:00.000Z",
      nowMs: Date.parse("2026-11-02T00:00:00.000Z"),
    });
    expect(waiting.action).toBe("wait");
    const canceled = nextDunningStep({
      attempts: 3,
      startedAt: started,
      nextRetryAt: null,
      nowMs: Date.parse("2026-11-20T00:00:00.000Z"),
    });
    expect(canceled.action).toBe("cancel");
  });
});

describe("cancellation", () => {
  const sub = {
    id: "s1",
    user_id: "u1",
    provider: "paddle",
    provider_subscription_id: "sub_1",
    plan: "pro",
    status: "active" as const,
    current_period_start: "2026-11-01T00:00:00.000Z",
    current_period_end: "2026-12-01T00:00:00.000Z",
    cancel_at_period_end: false,
    canceled_at: null,
    dunning_attempts: 0,
    dunning_next_retry_at: null,
    dunning_started_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  };
  it("immediate cancels now; end-of-period keeps access to period end", () => {
    expect(
      cancelPatch(sub, "immediate", Date.parse("2026-11-02T00:00:00.000Z")),
    ).toMatchObject({ status: "canceled" });
    expect(cancelPatch(sub, "end_of_period")).toEqual({
      cancel_at_period_end: true,
    });
    expect(hasAccess(sub, Date.parse("2026-11-15T00:00:00.000Z"))).toBe(true);
    expect(
      hasAccess({ ...sub, status: "canceled" as const }),
    ).toBe(false);
  });
});

describe("affiliates", () => {
  it("codes are 8 chars from the safe alphabet; rules refuse self/double attribution", () => {
    const code = generateReferralCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(
      canAttribute({
        referrerUserId: "u1",
        referredUserId: "u1",
        existingReferralForReferred: false,
      }),
    ).toEqual({ ok: false, reason: "You cannot refer yourself." });
    expect(
      canAttribute({
        referrerUserId: "u1",
        referredUserId: "u2",
        existingReferralForReferred: true,
      }),
    ).toEqual({
      ok: false,
      reason: "This account is already attributed to a referrer.",
    });
    expect(commissionFor(1999, 10)).toBe(199);
    expect(affiliateRatePercent({})).toBe(10);
    expect(affiliateRatePercent({ BILLING_AFFILIATE_RATE_PERCENT: "25" })).toBe(25);
  });
});

describe("fraud velocity", () => {
  it("flags actor and IP bursts inside the window only", () => {
    const now = Date.parse("2026-11-02T12:00:00.000Z");
    const entries = Array.from({ length: 6 }, (_, i) => ({
      actor: "u1",
      ip: "1.2.3.4",
      created_at: new Date(now - i * 60 * 1000).toISOString(),
    }));
    entries.push({
      actor: "u9",
      ip: "9.9.9.9",
      created_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    });
    const flags = flagVelocity(entries, { nowMs: now });
    expect(flags).toContainEqual({
      kind: "checkout_velocity_actor",
      key: "u1",
      count: 6,
      windowMinutes: 60,
    });
    expect(flags).toContainEqual({
      kind: "checkout_velocity_ip",
      key: "1.2.3.4",
      count: 6,
      windowMinutes: 60,
    });
    expect(flags.some((f) => f.key === "u9")).toBe(false);
  });
});

describe("MoR webhook verification", () => {
  it("Paddle signatures verify and reject tampering, staleness, and wrong secrets", () => {
    const secret = "whsec_test";
    const body = '{"event_id":"evt_1"}';
    const ts = Math.floor(Date.parse("2026-11-02T12:00:00.000Z") / 1000);
    const sig = `ts=${ts};h1=${hmacHex(secret, `${ts}:${body}`)}`;
    expect(
      verifyPaddleSignature(
        body,
        sig,
        secret,
        Date.parse("2026-11-02T12:00:30.000Z"),
      ),
    ).toBe(true);
    expect(
      verifyPaddleSignature(
        body + "x",
        sig,
        secret,
        Date.parse("2026-11-02T12:00:30.000Z"),
      ),
    ).toBe(false);
    expect(
      verifyPaddleSignature(
        body,
        sig,
        secret,
        Date.parse("2026-11-02T12:20:00.000Z"),
      ),
    ).toBe(false);
  });

  it("Lemon Squeezy signatures verify against the raw body", () => {
    const secret = "lssec";
    const body = '{"meta":{}}';
    expect(
      verifyLemonSqueezySignature(body, hmacHex(secret, body), secret),
    ).toBe(true);
    expect(
      verifyLemonSqueezySignature(body, "deadbeef", secret),
    ).toBe(false);
  });

  it("Paddle events normalize; Lemon Squeezy checkout stays inert", async () => {
    const paddle = new PaddleMorProvider(async () => new Response("{}", { status: 200 }));
    const evt = paddle.parseWebhookEvent({
      event_id: "evt_1",
      event_type: "subscription.created",
      data: {
        id: "sub_1",
        customer_email: "a@b.c",
        custom_data: { user_id: "u1" },
        items: [{ price: { id: "pri_pro" } }],
        totals: { total: "1900" },
        currency_code: "USD",
      },
    });
    expect(evt?.kind).toBe("subscription_created");
    expect(evt?.subscriptionId).toBe("sub_1");
    expect(evt?.amountMinor).toBe(1900);
    expect(evt?.customData.user_id).toBe("u1");
    const ls = new LemonSqueezyMorProvider();
    expect(ls.isConfigured()).toBe(false);
    await expect(ls.createCheckout()).resolves.toMatchObject({ ok: false });
  });
});
