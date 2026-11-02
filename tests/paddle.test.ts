import { afterEach, describe, expect, it, vi } from "vitest";
import { PaddleBillingProvider, priceIdForTier } from "@/lib/billing/paddle";

describe("PaddleBillingProvider", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
    vi.unstubAllGlobals();
  });

  it("is inert when keys are missing (mocked, $0 spent)", async () => {
    delete process.env.PADDLE_API_KEY;
    delete process.env.PADDLE_PRO_PRICE_ID;
    const fetchMock = vi.fn(async () => {
      throw new Error("must not be called");
    });
    const provider = new PaddleBillingProvider(
      fetchMock as unknown as typeof fetch,
    );
    expect(provider.isConfigured()).toBe(false);
    expect(provider.missingConfig()).toContain("PADDLE_API_KEY");
    const res = await provider.createCheckout({
      email: "a@example.com",
      priceId: "pri_test",
      userId: "u1",
    });
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a transaction and returns the checkout URL (mocked)", async () => {
    process.env.PADDLE_API_KEY = "test-key-never-real";
    process.env.PADDLE_PRO_PRICE_ID = "pri_test";
    process.env.PADDLE_ENV = "sandbox";
    let seenUrl = "";
    let seenBody: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          data: { checkout: { url: "https://sandbox-checkout.paddle.com/txn" } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const provider = new PaddleBillingProvider(
      fetchMock as unknown as typeof fetch,
    );
    const res = await provider.createCheckout({
      email: "a@example.com",
      priceId: "pri_test",
      userId: "u1",
    });
    expect(res).toEqual({
      ok: true,
      checkoutUrl: "https://sandbox-checkout.paddle.com/txn",
    });
    expect(seenUrl).toBe("https://sandbox-api.paddle.com/transactions");
    expect(seenBody).toMatchObject({
      items: [{ price_id: "pri_test", quantity: 1 }],
      customer: { email: "a@example.com" },
      custom_data: { user_id: "u1" },
    });
  });

  it("priceIdForTier reads the pro price from env only", () => {
    process.env.PADDLE_PRO_PRICE_ID = "pri_test";
    expect(priceIdForTier("pro")).toBe("pri_test");
    expect(priceIdForTier("enterprise")).toBeNull();
  });
});
