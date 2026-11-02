import { NextResponse } from "next/server";
import { z } from "zod";
import { getBillingProvider, priceIdForTier } from "@/lib/billing/paddle";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { isViewAsRequest } from "@/lib/admin/impersonation";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  email: z.string().email().max(200),
  tier: z.string().min(1).max(50),
  userId: z.string().min(1).max(200).optional(),
});

/**
 * Billing checkout. Inert until Paddle keys + price IDs are set:
 * without them it answers 503 "Billing is not configured yet".
 * Session-based email (from the signed-in user) replaces the body
 * email once auth is wired into this route.
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  // View-as sessions are read-only: an admin viewing as a user may
  // never start a checkout as that user.
  if (isViewAsRequest(req)) {
    return NextResponse.json(
      { error: "View-as sessions are read-only and cannot check out." },
      { status: 403 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  }
  const priceId = priceIdForTier(parsed.data.tier);
  if (!priceId) {
    return NextResponse.json(
      { error: `No price configured for tier "${parsed.data.tier}". Billing is not configured yet.` },
      { status: 503 },
    );
  }
  const provider = getBillingProvider();
  const result = await provider.createCheckout({
    email: parsed.data.email,
    priceId,
    userId: parsed.data.userId ?? "anonymous",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 503 });
  }
  // Audit only: the buyer's email is never logged.
  scheduleAudit({
    actor: parsed.data.userId ?? "guest",
    action: "billing.checkout",
    target: null,
    metadata: { tier: parsed.data.tier },
    ip: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ checkoutUrl: result.checkoutUrl });
}
