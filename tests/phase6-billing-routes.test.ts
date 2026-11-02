/**
 * ClipForge Phase 6 — route tests (mocked session + stubbed fetch).
 *
 * Same harness as Phase 5: the admin session is mocked, the
 * database is an in-memory stub keyed by PostgREST table, and the
 * MoR is a stubbed fetch (no real payment calls). Each request
 * carries a unique x-forwarded-for so the 5/min per-IP limiter
 * never trips across tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/admin/session", async (importOriginal) => {
  const orig =
    await importOriginal<typeof import("@/lib/admin/session")>();
  return {
    ...orig,
    getAdminSession: vi.fn(),
    requireAdminSession: vi.fn(),
  };
});

// Phase 8: billing routes are session-bound, so the session user
// is mocked to "user-1" (the caller id the tests already use).
// Caller-supplied userId bodies are ignored by the routes.
vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserId: vi.fn().mockResolvedValue("user-1"),
}));

import {
  getAdminSession,
  requireAdminSession,
} from "@/lib/admin/session";
import { getSessionUserId } from "@/lib/auth/session-user";
import { hmacHex } from "@/lib/billing/mor";

import { POST as webhook } from "@/app/api/billing/webhook/route";
import { POST as checkout } from "@/app/api/billing/checkout/route";
import { POST as cancelSub } from "@/app/api/billing/subscriptions/cancel/route";
import { POST as redeem } from "@/app/api/billing/coupons/redeem/route";
import { POST as recordMetering } from "@/app/api/admin/billing/metering/record/route";
import { POST as createCoupon } from "@/app/api/admin/billing/coupons/route";
import { POST as runDunning } from "@/app/api/admin/billing/dunning/run/route";
import { GET as fraudSignals } from "@/app/api/admin/billing/fraud-signals/route";
import { POST as attribute } from "@/app/api/billing/referrals/attribute/route";

const ADMIN_SESSION = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "owner" as const,
  status: "active" as const,
  publishingPaused: false,
  mfaEnrolled: true,
  mfaVerified: true,
};

type Row = Record<string, unknown> & { id: string };

let tables: Record<string, Row[]>;
let ipCounter = 0;
const savedEnv: Record<string, string | undefined> = {};

function nextIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250) + 1}.${(ipCounter % 250) + 1}`;
}

function req(
  url: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Request {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "x-forwarded-for": nextIp(),
      ...(body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Minimal PostgREST stub: eq filters on GET, merge on PATCH. */
function stubFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  const path = url.pathname;

  // Paddle API stub (checkout + cancel only).
  if (url.hostname.includes("paddle.com")) {
    if (path === "/transactions" && method === "POST") {
      return Promise.resolve(
        jsonResponse({ data: { checkout: { url: "https://checkout.paddle.test/x" } } }),
      );
    }
    if (path.endsWith("/cancel") && method === "POST") {
      return Promise.resolve(jsonResponse({}));
    }
    return Promise.resolve(jsonResponse({}, 404));
  }

  const table = path.replace("/rest/v1/", "");
  const rows = (tables[table] ??= []);
  const filters: Array<[string, string]> = [];
  for (const [k, v] of url.searchParams) {
    if (["order", "limit", "offset", "select"].includes(k)) continue;
    if (v.startsWith("eq.")) filters.push([k, decodeURIComponent(v.slice(3))]);
  }
  const matches = (row: Row) =>
    filters.every(([k, v]) => String(row[k] ?? "") === v);

  if (method === "GET") {
    const limit = Number(url.searchParams.get("limit") ?? "1000");
    return Promise.resolve(
      jsonResponse(rows.filter(matches).slice(0, limit)),
    );
  }
  if (method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}")) as Row;
    if (table === "clipper_webhook_events") {
      const dup = rows.find(
        (r) =>
          r.provider === body.provider && r.event_id === body.event_id,
      );
      if (dup) return Promise.resolve(jsonResponse({}, 409));
    }
    if (table === "clipper_referral_codes") {
      const dup = rows.find((r) => r.code === body.code);
      if (dup) return Promise.resolve(jsonResponse({}, 409));
    }
    const row: Row = {
      ...body,
      id: `id-${rows.length + 1}-${table}`,
      created_at: new Date().toISOString(),
    };
    rows.push(row);
    return Promise.resolve(jsonResponse([row], 201));
  }
  if (method === "PATCH") {
    const patch = JSON.parse(String(init?.body ?? "{}")) as Row;
    const updated = rows.filter(matches);
    for (const row of updated) Object.assign(row, patch);
    return Promise.resolve(jsonResponse(updated));
  }
  return Promise.resolve(jsonResponse({}, 405));
}

beforeEach(() => {
  // The file's afterEach runs vi.resetAllMocks(), which wipes the
  // factory default — so the session default is restored here,
  // every test, not just at mock creation.
  vi.mocked(getSessionUserId).mockResolvedValue("user-1");
  tables = {
    clipper_users: [
      {
        id: "user-1",
        email: "user@example.com",
        plan: "free",
      } as Row,
    ],
    clipper_audit_log: [],
  };
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PADDLE_API_KEY",
    "PADDLE_WEBHOOK_SECRET",
    "PADDLE_PRO_PRICE_ID",
  ]) {
    savedEnv[key] = process.env[key];
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.PADDLE_API_KEY = "paddle-test-key";
  process.env.PADDLE_WEBHOOK_SECRET = "whsec_test";
  process.env.PADDLE_PRO_PRICE_ID = "pri_pro";
  vi.stubGlobal("fetch", stubFetch);
  vi.mocked(requireAdminSession).mockResolvedValue({
    ok: true,
    session: ADMIN_SESSION,
  });
  vi.mocked(getAdminSession).mockResolvedValue(ADMIN_SESSION);
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function paddleSigned(body: string): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000);
  return {
    "paddle-signature": `ts=${ts};h1=${hmacHex("whsec_test", `${ts}:${body}`)}`,
  };
}

describe("webhook", () => {
  it("rejects a bad signature with 401 and processes nothing", async () => {
    const body = JSON.stringify({
      event_id: "evt_bad",
      event_type: "subscription.created",
      data: {},
    });
    const res = await webhook(
      new Request("http://localhost/api/billing/webhook?provider=paddle", {
        method: "POST",
        headers: {
          "x-forwarded-for": nextIp(),
          "paddle-signature": "ts=1;h1=deadbeef",
        },
        body,
      }),
    );
    expect(res.status).toBe(401);
    expect(tables.clipper_webhook_events ?? []).toHaveLength(0);
  });

  it("activates a subscription only on a verified event, and ignores a duplicate delivery", async () => {
    const body = JSON.stringify({
      event_id: "evt_1",
      event_type: "subscription.created",
      data: {
        id: "sub_1",
        status: "active",
        customer_email: "user@example.com",
        custom_data: { user_id: "user-1" },
        items: [{ price: { id: "pri_pro" } }],
        current_billing_period: {
          starts_at: "2026-11-02T00:00:00.000Z",
          ends_at: "2026-12-02T00:00:00.000Z",
        },
      },
    });
    const make = () =>
      new Request("http://localhost/api/billing/webhook?provider=paddle", {
        method: "POST",
        headers: {
          "x-forwarded-for": nextIp(),
          ...paddleSigned(body),
        },
        body,
      });
    const first = await webhook(make());
    expect(first.status).toBe(200);
    const firstJson = (await first.json()) as Record<string, unknown>;
    expect(firstJson.processed).toBe("subscription_created");
    expect(tables.clipper_subscriptions).toHaveLength(1);
    expect(tables.clipper_subscriptions[0].plan).toBe("pro");
    expect(tables.clipper_subscriptions[0].status).toBe("active");
    const second = await webhook(make());
    expect((await second.json()) as Record<string, unknown>).toEqual({
      ignored: "duplicate",
    });
    expect(tables.clipper_subscriptions).toHaveLength(1);
  });

  it("answers 503 when the webhook secret is missing (MoR retries)", async () => {
    delete process.env.PADDLE_WEBHOOK_SECRET;
    const body = JSON.stringify({
      event_id: "evt_x",
      event_type: "subscription.created",
      data: {},
    });
    const res = await webhook(
      new Request("http://localhost/api/billing/webhook?provider=paddle", {
        method: "POST",
        headers: { "x-forwarded-for": nextIp() },
        body,
      }),
    );
    expect(res.status).toBe(503);
  });
});

describe("checkout", () => {
  it("refuses unknown tiers, free, and tiers without a price", async () => {
    const bad = await checkout(
      req("http://localhost/api/billing/checkout", {
        email: "a@example.com",
        tier: "enterprise",
        userId: "user-1",
      }),
    );
    expect(bad.status).toBe(400);
    const free = await checkout(
      req("http://localhost/api/billing/checkout", {
        email: "a@example.com",
        tier: "free",
        userId: "user-1",
      }),
    );
    expect(free.status).toBe(400);
    delete process.env.PADDLE_PRO_PRICE_ID;
    const noPrice = await checkout(
      req("http://localhost/api/billing/checkout", {
        email: "a@example.com",
        tier: "pro",
        userId: "user-1",
      }),
    );
    expect(noPrice.status).toBe(503);
  });

  it("happy path returns a MoR checkout URL and records a pending subscription", async () => {
    const res = await checkout(
      req("http://localhost/api/billing/checkout", {
        email: "user@example.com",
        tier: "pro",
        userId: "user-1",
      }),
    );
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as Record<string, unknown>).checkoutUrl,
    ).toBe("https://checkout.paddle.test/x");
    expect(tables.clipper_subscriptions).toHaveLength(1);
    expect(tables.clipper_subscriptions[0].status).toBe("pending");
  });
});

describe("cancel", () => {
  it("401s when signed out, 404s for a foreign subscription, and records a local-only cancel", async () => {
    tables.clipper_subscriptions = [
      {
        id: "sub-row-1",
        user_id: "user-1",
        provider: "paddle",
        provider_subscription_id: null,
        plan: "pro",
        status: "active",
        current_period_end: "2026-12-02T00:00:00.000Z",
        cancel_at_period_end: false,
        canceled_at: null,
      } as Row,
    ];
    vi.mocked(getSessionUserId).mockResolvedValueOnce(null);
    const signedOut = await cancelSub(
      req("http://localhost/api/billing/subscriptions/cancel", {
        subscriptionId: "sub-row-1",
        mode: "immediate",
      }),
    );
    expect(signedOut.status).toBe(401);
    const foreign = await cancelSub(
      req("http://localhost/api/billing/subscriptions/cancel", {
        userId: "user-1",
        subscriptionId: "nope",
        mode: "immediate",
      }),
    );
    expect(foreign.status).toBe(404);
    const res = await cancelSub(
      req("http://localhost/api/billing/subscriptions/cancel", {
        userId: "user-1",
        subscriptionId: "sub-row-1",
        mode: "end_of_period",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      subscription: { cancel_at_period_end: boolean };
      morCanceled: boolean;
    };
    expect(json.subscription.cancel_at_period_end).toBe(true);
    expect(json.morCanceled).toBe(false);
  });
});

describe("coupons + metering + dunning + fraud + affiliates", () => {
  it("redeem refuses expired coupons and records a valid redemption", async () => {
    tables.clipper_coupons = [
      {
        id: "c-exp",
        code: "OLD",
        kind: "percent",
        value: 20,
        max_uses: null,
        uses_count: 0,
        per_user_once: true,
        plan: null,
        expires_at: "2026-01-01T00:00:00.000Z",
        created_by: null,
      } as Row,
      {
        id: "c-ok",
        code: "SAVE20",
        kind: "percent",
        value: 20,
        max_uses: null,
        uses_count: 0,
        per_user_once: true,
        plan: null,
        expires_at: null,
        created_by: null,
      } as Row,
    ];
    const expired = await redeem(
      req("http://localhost/api/billing/coupons/redeem", {
        userId: "user-1",
        code: "OLD",
        checkoutReference: "chk-1",
      }),
    );
    expect(expired.status).toBe(400);
    const ok = await redeem(
      req("http://localhost/api/billing/coupons/redeem", {
        userId: "user-1",
        code: "SAVE20",
        totalMinor: 1000,
        checkoutReference: "chk-2",
      }),
    );
    expect(ok.status).toBe(200);
    expect(
      ((await ok.json()) as Record<string, unknown>).discountMinor,
    ).toBe(200);
  });

  it("admin coupon creation refuses percent over 100", async () => {
    const res = await createCoupon(
      req("http://localhost/api/admin/billing/coupons", {
        code: "BAD",
        kind: "percent",
        value: 150,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("metering refuses consumption past the monthly cap with 402", async () => {
    tables.clipper_users = [
      { id: "user-1", email: "u@e.c", plan: "free" } as Row,
    ];
    const now = new Date().toISOString();
    tables.clipper_credit_ledger = [
      {
        id: "l1",
        user_id: "user-1",
        delta_minutes: -29,
        kind: "consumption",
        reason: "publish",
        reference: null,
        created_at: now,
      } as Row,
    ];
    const res = await recordMetering(
      req("http://localhost/api/admin/billing/metering/record", {
        userId: "user-1",
        minutes: 5,
        kind: "consumption",
        reason: "publish",
      }),
    );
    expect(res.status).toBe(402);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.minutesRemaining).toBe(1);
  });

  it("dunning run cancels a subscription past grace", async () => {
    tables.clipper_subscriptions = [
      {
        id: "sub-past",
        user_id: "user-1",
        provider: "paddle",
        provider_subscription_id: "sub_9",
        plan: "pro",
        status: "past_due",
        dunning_attempts: 3,
        dunning_started_at: "2026-10-01T00:00:00.000Z",
        dunning_next_retry_at: null,
      } as Row,
    ];
    const res = await runDunning(
      req("http://localhost/api/admin/billing/dunning/run", {}),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      canceled: 1,
    });
    expect(tables.clipper_subscriptions[0].status).toBe("canceled");
  });

  it("fraud signals flag a checkout burst from one actor", async () => {
    const now = Date.now();
    tables.clipper_audit_log = Array.from({ length: 6 }, (_, i) => ({
      id: `a${i}`,
      actor: "user-1",
      action: "billing.checkout",
      target: null,
      metadata: {},
      ip: "1.2.3.4",
      user_agent: null,
      created_at: new Date(now - i * 60 * 1000).toISOString(),
    })) as Row[];
    const res = await fraudSignals(
      new Request("http://localhost/api/admin/billing/fraud-signals", {
        headers: { "x-forwarded-for": nextIp() },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      flags: Array<{ kind: string; key: string }>;
    };
    expect(
      json.flags.some(
        (f) => f.kind === "checkout_velocity_actor" && f.key === "user-1",
      ),
    ).toBe(true);
  });

  it("attribution refuses self-referral", async () => {
    tables.clipper_referral_codes = [
      { id: "rc1", code: "ABCDEFGH", user_id: "user-1" } as Row,
    ];
    const res = await attribute(
      req("http://localhost/api/billing/referrals/attribute", {
        code: "ABCDEFGH",
        userId: "user-1",
      }),
    );
    expect(res.status).toBe(400);
  });
});
