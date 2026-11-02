import { getKey, type FetchImpl } from "@/lib/ai/providers";

/**
 * Billing provider abstraction (Phase 3). Paddle is the merchant of
 * record: it sells in its own name, handles tax, and pays the seller
 * out. One adapter is shipped (Paddle Billing API). No prices are
 * invented: price IDs come from env, and when the key or price IDs
 * are missing, checkout is honestly "not configured" — never a fake
 * checkout link.
 *
 * Nepal-payout finding (re-verified from Paddle's public help page,
 * "Which countries are supported by Paddle?", plus independent
 * October 2026 country checks): Paddle works with software sellers
 * anywhere EXCEPT the countries on its published unsupported list,
 * and Nepal is not on that list; payouts run by bank wire or
 * Payoneer. That is NOT a guarantee — every seller still passes
 * Paddle's own review, and the list can change. The owner must
 * confirm during Paddle onboarding.
 */

export type CheckoutResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; reason: string };

export interface BillingProvider {
  readonly name: string;
  isConfigured(): boolean;
  missingConfig(): string[];
  createCheckout(input: {
    email: string;
    priceId: string;
    userId: string;
  }): Promise<CheckoutResult>;
}

export function paddleBaseUrl(): string {
  return process.env.PADDLE_ENV === "live"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

export class PaddleBillingProvider implements BillingProvider {
  readonly name = "paddle";

  constructor(private readonly fetchImpl: FetchImpl = fetch) {}

  isConfigured(): boolean {
    return this.missingConfig().length === 0;
  }

  missingConfig(): string[] {
    const missing: string[] = [];
    if (!getKey("PADDLE_API_KEY")) missing.push("PADDLE_API_KEY");
    if (!getKey("PADDLE_PRO_PRICE_ID")) missing.push("PADDLE_PRO_PRICE_ID");
    return missing;
  }

  async createCheckout(input: {
    email: string;
    priceId: string;
    userId: string;
  }): Promise<CheckoutResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        reason: `Billing is not configured yet (missing: ${this.missingConfig().join(", ")}).`,
      };
    }
    const key = getKey("PADDLE_API_KEY") as string;
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
        reason: "Paddle returned no checkout URL (is a default payment link set in the Paddle dashboard?).",
      };
    }
    return { ok: true, checkoutUrl: url };
  }
}

export function getBillingProvider(fetchImpl?: FetchImpl): BillingProvider {
  return new PaddleBillingProvider(fetchImpl);
}

/** Price ID for a tier name, from env. Unknown tiers return null. */
export function priceIdForTier(tier: string): string | null {
  if (tier === "pro") return getKey("PADDLE_PRO_PRICE_ID");
  return null;
}
