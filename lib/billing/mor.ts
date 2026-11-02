/**
 * Merchant-of-record (MoR) interface (ClipForge Phase 6).
 *
 * The app never touches card or payment-instrument data: the MoR
 * sells in its own name, handles tax, and pays the seller out. This
 * module is the swappable seam — Paddle is the first adapter
 * (sandbox-first, matching the owner's sister sites); Lemon Squeezy
 * is a second adapter SLOT whose checkout is deliberately inert
 * until a later slice wires its API (its webhook verification is
 * real, so events can be validated the moment the slot is filled).
 *
 * Activation NEVER trusts a client claim or redirect: only a
 * server-to-server verified webhook event activates a subscription
 * or grants credits, and every event id is recorded exactly once
 * (duplicate deliveries are ignored — see lib/billing/store.ts).
 *
 * Money is integer minor units only, everywhere. No floats.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getKey, type FetchImpl } from "@/lib/ai/providers";
import { paddleBaseUrl } from "./paddle";

export type MorName = "paddle" | "lemonsqueezy";

export type CheckoutResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; reason: string };

export type NormalizedMorEvent = {
  /** Provider event id — the idempotency key. */
  eventId: string;
  /** Raw provider event type, e.g. subscription.created. */
  type: string;
  /** Normalized kind the webhook route switches on. */
  kind:
    | "subscription_created"
    | "subscription_updated"
    | "subscription_canceled"
    | "transaction_completed"
    | "transaction_failed"
    | "unknown";
  /** MoR subscription id, when the event carries one. */
  subscriptionId: string | null;
  /** MoR transaction id, when the event carries one. */
  transactionId: string | null;
  customerEmail: string | null;
  /** MoR subscription status, when the event carries one. */
  status: string | null;
  /** Current billing period bounds, when the event carries them. */
  periodStart: string | null;
  periodEnd: string | null;
  /** Price id of the purchased item, when the event carries one. */
  priceId: string | null;
  /** Amount in integer minor units, when the event carries one. */
  amountMinor: number | null;
  currency: string | null;
  /** Pass-through ids for credit packs / coupons, from custom data. */
  customData: Record<string, string>;
};

export interface MorProvider {
  readonly name: MorName;
  isConfigured(): boolean;
  missingConfig(): string[];
  createCheckout(input: {
    email: string;
    priceId: string;
    userId: string;
    couponCode?: string;
  }): Promise<CheckoutResult>;
  /** Verify a webhook signature against the provider's secret. */
  verifyWebhook(rawBody: string, headers: Headers): boolean;
  /** Parse a verified body into a normalized event (null = unknown). */
  parseWebhookEvent(body: unknown): NormalizedMorEvent | null;
  /**
   * Cancel at the MoR. Optional: providers without a cancel API
   * omit it, and the route records a local-only cancel instead.
   */
  cancelSubscription?(input: {
    subscriptionId: string;
    mode: "immediate" | "end_of_period";
  }): Promise<{ ok: boolean; reason?: string }>;
  webhookSecretEnvName(): string;
}

/** HMAC-SHA256 hex digest. */
export function hmacHex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

/** Constant-time comparison that never throws on length mismatch. */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Paddle webhook verification. Paddle sends
 * `Paddle-Signature: ts=<unix>;h1=<hex>` where h1 is
 * HMAC-SHA256(secret, `${ts}:${rawBody}`). The timestamp must be
 * within 5 minutes (replay window), matching Paddle's guidance.
 * NOTE: confirm against a Paddle sandbox test webhook before
 * relying on live activation — the construction follows Paddle's
 * published verification docs, but live confirmation is still owed.
 */
export function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!signatureHeader || !secret) return false;
  const parts = new Map(
    signatureHeader.split(";").map((pair) => {
      const [k, v] = pair.split("=");
      return [k?.trim(), v?.trim() ?? ""];
    }),
  );
  const ts = parts.get("ts");
  const h1 = parts.get("h1");
  if (!ts || !h1) return false;
  const tsMs = Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(nowMs - tsMs) > 5 * 60 * 1000) {
    return false;
  }
  return safeEqualHex(hmacHex(secret, `${ts}:${rawBody}`), h1);
}

/** Lemon Squeezy: X-Signature is HMAC-SHA256(secret, rawBody). */
export function verifyLemonSqueezySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  return safeEqualHex(hmacHex(secret, rawBody), signatureHeader.trim());
}

export class PaddleMorProvider implements MorProvider {
  readonly name: MorName = "paddle";

  constructor(private readonly fetchImpl: FetchImpl = fetch) {}

  isConfigured(): boolean {
    return this.missingConfig().length === 0;
  }

  missingConfig(): string[] {
    const missing: string[] = [];
    if (!getKey("PADDLE_API_KEY")) missing.push("PADDLE_API_KEY");
    if (!getKey("PADDLE_WEBHOOK_SECRET"))
      missing.push("PADDLE_WEBHOOK_SECRET");
    return missing;
  }

  async createCheckout(input: {
    email: string;
    priceId: string;
    userId: string;
    couponCode?: string;
  }): Promise<CheckoutResult> {
    const key = getKey("PADDLE_API_KEY");
    if (!key) {
      return {
        ok: false,
        reason: "Billing is not configured yet (missing: PADDLE_API_KEY).",
      };
    }
    const discount =
      input.couponCode !== undefined
        ? { code: input.couponCode }
        : undefined;
    const res = await this.fetchImpl(`${paddleBaseUrl()}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Paddle-Version": "1",
      },
      body: JSON.stringify({
        items: [{ price_id: input.priceId, quantity: 1 }],
        customer: { email: input.email },
        custom_data: { user_id: input.userId },
        ...(discount ? { discount } : {}),
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: `Paddle request failed (HTTP ${res.status}).` };
    }
    const data = (await res.json()) as {
      data?: { checkout?: { url?: string | null } };
    };
    const url = data.data?.checkout?.url;
    if (!url) {
      return {
        ok: false,
        reason:
          "Paddle returned no checkout URL (is a default payment link set in the Paddle dashboard?).",
      };
    }
    return { ok: true, checkoutUrl: url };
  }

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const secret = getKey("PADDLE_WEBHOOK_SECRET");
    if (!secret) return false;
    return verifyPaddleSignature(
      rawBody,
      headers.get("paddle-signature"),
      secret,
    );
  }

  parseWebhookEvent(body: unknown): NormalizedMorEvent | null {
    if (typeof body !== "object" || body === null) return null;
    const b = body as Record<string, unknown>;
    const eventId = typeof b.event_id === "string" ? b.event_id : null;
    const type = typeof b.event_type === "string" ? b.event_type : null;
    if (!eventId || !type) return null;
    const data =
      typeof b.data === "object" && b.data !== null
        ? (b.data as Record<string, unknown>)
        : {};
    const customData =
      typeof data.custom_data === "object" && data.custom_data !== null
        ? Object.fromEntries(
            Object.entries(data.custom_data as Record<string, unknown>)
              .filter(([, v]) => typeof v === "string")
              .map(([k, v]) => [k, v as string]),
          )
        : {};
    const items = Array.isArray(data.items) ? data.items : [];
    const firstItem =
      items.length > 0 && typeof items[0] === "object"
        ? (items[0] as Record<string, unknown>)
        : {};
    const price =
      typeof firstItem.price === "object" && firstItem.price !== null
        ? (firstItem.price as Record<string, unknown>)
        : {};
    const totals =
      typeof data.totals === "object" && data.totals !== null
        ? (data.totals as Record<string, unknown>)
        : {};
    const kind =
      type === "subscription.created"
        ? "subscription_created"
        : type === "subscription.updated"
          ? "subscription_updated"
          : type === "subscription.canceled"
            ? "subscription_canceled"
            : type === "transaction.completed"
              ? "transaction_completed"
              : type === "transaction.payment_failed"
                ? "transaction_failed"
                : "unknown";
    const amountMinor =
      typeof totals.total === "string" && /^\d+$/.test(totals.total)
        ? Number.parseInt(totals.total, 10)
        : null;
    return {
      eventId,
      type,
      kind,
      subscriptionId:
        typeof data.subscription_id === "string"
          ? data.subscription_id
          : typeof data.id === "string" && type.startsWith("subscription.")
            ? data.id
            : null,
      transactionId:
        typeof data.id === "string" && type.startsWith("transaction.")
          ? data.id
          : null,
      customerEmail:
        typeof data.customer_email === "string"
          ? data.customer_email
          : null,
      status: typeof data.status === "string" ? data.status : null,
      periodStart:
        typeof data.current_billing_period === "object" &&
        data.current_billing_period !== null &&
        typeof (data.current_billing_period as Record<string, unknown>)
          .starts_at === "string"
          ? ((data.current_billing_period as Record<string, unknown>)
              .starts_at as string)
          : null,
      periodEnd:
        typeof data.current_billing_period === "object" &&
        data.current_billing_period !== null &&
        typeof (data.current_billing_period as Record<string, unknown>)
          .ends_at === "string"
          ? ((data.current_billing_period as Record<string, unknown>)
              .ends_at as string)
          : null,
      priceId: typeof price.id === "string" ? price.id : null,
      amountMinor,
      currency:
        typeof data.currency_code === "string" ? data.currency_code : null,
      customData,
    };
  }

  webhookSecretEnvName(): string {
    return "PADDLE_WEBHOOK_SECRET";
  }

  async cancelSubscription(input: {
    subscriptionId: string;
    mode: "immediate" | "end_of_period";
  }): Promise<{ ok: boolean; reason?: string }> {
    const key = getKey("PADDLE_API_KEY");
    if (!key) {
      return { ok: false, reason: "Paddle is not configured." };
    }
    const res = await this.fetchImpl(
      `${paddleBaseUrl()}/subscriptions/${encodeURIComponent(input.subscriptionId)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Paddle-Version": "1",
        },
        body: JSON.stringify({
          effective_from:
            input.mode === "immediate"
              ? "immediately"
              : "next_billing_period",
        }),
      },
    );
    if (!res.ok) {
      return { ok: false, reason: `Paddle cancel failed (HTTP ${res.status}).` };
    }
    return { ok: true };
  }
}

/**
 * Lemon Squeezy adapter SLOT. Webhook verification is real (X-Signature
 * HMAC), but checkout is deliberately inert: the LS checkout API call
 * is a later slice, and returning a fake or half-built checkout would
 * be worse than an honest "not live yet". Until that slice lands, the
 * route reports the slot as not configured for checkout.
 */
export class LemonSqueezyMorProvider implements MorProvider {
  readonly name: MorName = "lemonsqueezy";

  isConfigured(): boolean {
    return false;
  }

  missingConfig(): string[] {
    return ["LEMONSQUEEZY_CHECKOUT_NOT_IMPLEMENTED"];
  }

  async createCheckout(): Promise<CheckoutResult> {
    return {
      ok: false,
      reason:
        "Lemon Squeezy checkout is not live yet (adapter slot only). Use Paddle, or wait for the Lemon Squeezy checkout slice.",
    };
  }

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const secret = getKey("LEMONSQUEEZY_WEBHOOK_SECRET");
    if (!secret) return false;
    return verifyLemonSqueezySignature(
      rawBody,
      headers.get("x-signature"),
      secret,
    );
  }

  parseWebhookEvent(body: unknown): NormalizedMorEvent | null {
    if (typeof body !== "object" || body === null) return null;
    const b = body as Record<string, unknown>;
    const meta =
      typeof b.meta === "object" && b.meta !== null
        ? (b.meta as Record<string, unknown>)
        : {};
    const eventName =
      typeof meta.event_name === "string" ? meta.event_name : null;
    if (!eventName) return null;
    const data =
      typeof b.data === "object" && b.data !== null
        ? (b.data as Record<string, unknown>)
        : {};
    const attrs =
      typeof data.attributes === "object" && data.attributes !== null
        ? (data.attributes as Record<string, unknown>)
        : {};
    const kind =
      eventName === "subscription_created"
        ? "subscription_created"
        : eventName === "subscription_updated"
          ? "subscription_updated"
          : eventName === "subscription_cancelled"
            ? "subscription_canceled"
            : eventName === "order_created"
              ? "transaction_completed"
              : eventName === "subscription_payment_failed"
                ? "transaction_failed"
                : "unknown";
    const total =
      typeof attrs.total === "number" ? Math.trunc(attrs.total) : null;
    // Lemon Squeezy webhooks carry no separate event id; the object id
    // is the dedupe key (a subscription emits one event per change,
    // and replays carry the same object id + event name).
    return {
      eventId: `${eventName}:${typeof data.id === "string" ? data.id : "unknown"}`,
      type: eventName,
      kind,
      subscriptionId:
        typeof attrs.subscription_id === "number"
          ? String(attrs.subscription_id)
          : null,
      transactionId:
        typeof data.id === "string" && eventName === "order_created"
          ? data.id
          : null,
      customerEmail:
        typeof attrs.user_email === "string" ? attrs.user_email : null,
      status: typeof attrs.status === "string" ? attrs.status : null,
      periodStart: null,
      periodEnd:
        typeof attrs.renews_at === "string"
          ? attrs.renews_at
          : typeof attrs.ends_at === "string"
            ? attrs.ends_at
            : null,
      priceId: null,
      amountMinor: total,
      currency:
        typeof attrs.currency === "string" ? attrs.currency : null,
      customData: {},
    };
  }

  webhookSecretEnvName(): string {
    return "LEMONSQUEEZY_WEBHOOK_SECRET";
  }
}

/** Map a provider status string onto an app subscription status. */
export function mapMorStatus(
  provider: MorName,
  status: string | null,
): "trialing" | "active" | "past_due" | "canceled" | null {
  if (!status) return null;
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "past_due") return "past_due";
  if (status === "canceled") return "canceled";
  if (provider === "lemonsqueezy" && (status === "cancelled" || status === "expired")) {
    return "canceled";
  }
  // Paddle "paused" and anything unknown: do NOT change local status.
  return null;
}

/** Provider selection: BILLING_MOR_PROVIDER=lemonsqueezy, else paddle. */
export function getMorProvider(fetchImpl?: FetchImpl): MorProvider {
  if (process.env.BILLING_MOR_PROVIDER === "lemonsqueezy") {
    return new LemonSqueezyMorProvider();
  }
  return new PaddleMorProvider(fetchImpl);
}

/** Explicit provider selection (webhook ?provider= overrides env). */
export function morProviderFor(
  name: MorName,
  fetchImpl?: FetchImpl,
): MorProvider {
  if (name === "lemonsqueezy") return new LemonSqueezyMorProvider();
  return new PaddleMorProvider(fetchImpl);
}
