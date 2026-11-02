import { NextResponse } from "next/server";
import { z } from "zod";
import { getKey } from "@/lib/ai/providers";
import {
  morProviderFor,
  mapMorStatus,
  type MorName,
  type NormalizedMorEvent,
} from "@/lib/billing/mor";
import {
  createCommission,
  createInvoice,
  createNotification,
  createSubscription,
  getReferralByReferredUser,
  getSubscriptionByProviderId,
  getUserByEmail,
  listInvoicesByUser,
  recordLedgerEntry,
  recordWebhookEvent,
  resolveBillingDb,
  updateSubscription,
  updateUserPlan,
  type SubscriptionRow,
} from "@/lib/billing/store";
import { buildInvoiceInput } from "@/lib/billing/invoices";
import { affiliateRatePercent, commissionFor } from "@/lib/billing/affiliates";
import { planFromPriceId, isPlanId } from "@/lib/billing/plans";
import { scheduleAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const maxDuration = 30;

const querySchema = z.object({
  provider: z.enum(["paddle", "lemonsqueezy"]).optional(),
});

/**
 * MoR webhook receiver (ClipForge Phase 6).
 *
 * This is the ONLY activation path: a subscription is created or
 * changed, credits are granted, and invoices are recorded ONLY here,
 * after HMAC signature verification, server-to-server. Client
 * redirects and client claims never activate anything.
 *
 * Duplicate deliveries are ignored via clipper_webhook_events
 * (UNIQUE on provider + event id) — the duplicate-payment
 * protection. A verified event with no configured database answers
 * 503 (not 200) so the MoR retries instead of assuming delivery.
 *
 * No IP rate limit here by design: MoR IPs vary, and the HMAC
 * signature is the authentication. An unverified request answers
 * 401 and is never processed.
 */
export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsedQuery = querySchema.safeParse({
    provider: url.searchParams.get("provider") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }
  const providerName: MorName =
    parsedQuery.data.provider ??
    (process.env.BILLING_MOR_PROVIDER === "lemonsqueezy"
      ? "lemonsqueezy"
      : "paddle");
  // Query ?provider= overrides the env default (the MoR dashboard
  // webhook URL carries it, so a Paddle event never hits the LS path).
  const activeProvider = morProviderFor(providerName);

  const secret = getKey(activeProvider.webhookSecretEnvName());
  if (!secret) {
    return NextResponse.json(
      {
        error: `Webhook is not configured yet (missing: ${activeProvider.webhookSecretEnvName()}).`,
      },
      { status: 503 },
    );
  }
  const rawBody = await req.text();
  if (!activeProvider.verifyWebhook(rawBody, req.headers)) {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 401 },
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const event = activeProvider.parseWebhookEvent(body);
  if (!event) {
    return NextResponse.json(
      { error: "Unknown webhook event shape." },
      { status: 400 },
    );
  }
  const db = resolveBillingDb();
  if (!db) {
    return NextResponse.json(
      { error: "Billing needs database setup." },
      { status: 503 },
    );
  }
  const recorded = await recordWebhookEvent(db, {
    provider: providerName,
    event_id: event.eventId,
    type: event.type,
  }).catch(() => null);
  if (!recorded) {
    return NextResponse.json(
      { error: "Webhook event could not be recorded." },
      { status: 503 },
    );
  }
  if (recorded.duplicate) {
    return NextResponse.json({ ignored: "duplicate" });
  }

  scheduleAudit({
    actor: "mor-webhook",
    action: "billing.event",
    target: event.subscriptionId ?? event.transactionId,
    metadata: {
      provider: providerName,
      type: event.type,
      kind: event.kind,
    },
    ip: null,
    user_agent: null,
  });

  try {
    const result = await applyMorEvent(db, providerName, event);
    return NextResponse.json(result);
  } catch {
    // The event is recorded (so a retry is a duplicate), but the
    // application failed: surface it so the failure is visible in
    // the MoR dashboard instead of silently acknowledged.
    return NextResponse.json(
      { error: "Webhook event could not be applied." },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { error: "Use POST for MoR webhooks." },
    { status: 405 },
  );
}

/** Resolve the user for an event: custom data, then provider id, then email. */
async function resolveUserId(
  db: NonNullable<ReturnType<typeof resolveBillingDb>>,
  providerName: MorName,
  event: NormalizedMorEvent,
): Promise<string | null> {
  if (event.customData.user_id) return event.customData.user_id;
  if (event.subscriptionId) {
    const sub = await getSubscriptionByProviderId(
      db,
      providerName,
      event.subscriptionId,
    ).catch(() => null);
    if (sub) return sub.user_id;
  }
  if (event.customerEmail) {
    const user = await getUserByEmail(db, event.customerEmail).catch(
      () => null,
    );
    if (user) return user.id;
  }
  return null;
}

function planForEvent(
  providerName: MorName,
  event: NormalizedMorEvent,
  existingPlan: string | null,
): string | null {
  if (event.priceId) {
    const plan = planFromPriceId(event.priceId, providerName);
    if (plan) return plan;
  }
  if (event.customData.plan && isPlanId(event.customData.plan)) {
    return event.customData.plan;
  }
  return existingPlan;
}

async function applyMorEvent(
  db: NonNullable<ReturnType<typeof resolveBillingDb>>,
  providerName: MorName,
  event: NormalizedMorEvent,
): Promise<Record<string, unknown>> {
  switch (event.kind) {
    case "subscription_created":
    case "subscription_updated": {
      const existing = event.subscriptionId
        ? await getSubscriptionByProviderId(
            db,
            providerName,
            event.subscriptionId,
          ).catch(() => null)
        : null;
      const plan = planForEvent(
        providerName,
        event,
        existing?.plan ?? null,
      );
      const status = mapMorStatus(providerName, event.status);
      if (!existing) {
        const userId = await resolveUserId(db, providerName, event);
        if (!userId || !plan) {
          scheduleAudit({
            actor: "mor-webhook",
            action: "billing.event",
            target: event.subscriptionId,
            metadata: {
              note: "subscription skipped: user or plan could not be determined",
              provider: providerName,
              type: event.type,
            },
            ip: null,
            user_agent: null,
          });
          return { ignored: "user or plan unknown" };
        }
        const sub = await createSubscription(db, {
          user_id: userId,
          provider: providerName,
          provider_subscription_id: event.subscriptionId,
          plan,
          status: status ?? "pending",
        });
        await updateSubscription(db, sub.id, {
          current_period_start: event.periodStart,
          current_period_end: event.periodEnd,
        }).catch(() => null);
        await updateUserPlan(db, userId, plan).catch(() => null);
        scheduleAudit({
          actor: userId,
          action: "billing.subscription_created",
          target: sub.id,
          metadata: { provider: providerName, plan },
          ip: null,
          user_agent: null,
        });
        return { processed: "subscription_created", subscriptionId: sub.id };
      }
      const patch: Partial<SubscriptionRow> = {};
      if (plan) patch.plan = plan;
      if (status) patch.status = status;
      if (event.periodStart) patch.current_period_start = event.periodStart;
      if (event.periodEnd) patch.current_period_end = event.periodEnd;
      await updateSubscription(db, existing.id, patch).catch(() => null);
      if (plan) {
        await updateUserPlan(db, existing.user_id, plan).catch(() => null);
      }
      scheduleAudit({
        actor: existing.user_id,
        action: "billing.subscription_updated",
        target: existing.id,
        metadata: { provider: providerName, plan: plan ?? existing.plan },
        ip: null,
        user_agent: null,
      });
      return { processed: "subscription_updated", subscriptionId: existing.id };
    }
    case "subscription_canceled": {
      if (!event.subscriptionId) return { ignored: "no subscription id" };
      const existing = await getSubscriptionByProviderId(
        db,
        providerName,
        event.subscriptionId,
      ).catch(() => null);
      if (!existing) return { ignored: "unknown subscription" };
      await updateSubscription(db, existing.id, {
        status: "canceled",
        canceled_at: new Date().toISOString(),
        cancel_at_period_end: false,
      }).catch(() => null);
      await updateUserPlan(db, existing.user_id, "free").catch(() => null);
      scheduleAudit({
        actor: existing.user_id,
        action: "billing.subscription_canceled",
        target: existing.id,
        metadata: { provider: providerName },
        ip: null,
        user_agent: null,
      });
      return { processed: "subscription_canceled" };
    }
    case "transaction_completed": {
      const userId = await resolveUserId(db, providerName, event);
      if (!userId) return { ignored: "user unknown" };
      const priorInvoices = await listInvoicesByUser(db, userId).catch(
        () => [],
      );
      const isFirstPaid = priorInvoices.length === 0;
      let subscriptionId: string | null = null;
      if (event.subscriptionId) {
        const sub = await getSubscriptionByProviderId(
          db,
          providerName,
          event.subscriptionId,
        ).catch(() => null);
        subscriptionId = sub?.id ?? null;
      }
      const plan = planForEvent(providerName, event, null);
      const invoice = await createInvoice(
        db,
        buildInvoiceInput({
          userId,
          subscriptionId,
          currency: event.currency ?? "USD",
          items: [
            {
              description: plan ? `${plan} plan` : "Purchase",
              quantity: 1,
              amount_minor: event.amountMinor ?? 0,
            },
          ],
          provider: providerName,
          providerTransactionId: event.transactionId,
        }),
      );
      scheduleAudit({
        actor: userId,
        action: "billing.invoice_created",
        target: invoice.id,
        metadata: { provider: providerName, totalMinor: invoice.total_minor },
        ip: null,
        user_agent: null,
      });
      // Credit-pack purchases grant minutes from custom data.
      const packMinutes = event.customData.credit_pack_minutes
        ? Number.parseInt(event.customData.credit_pack_minutes, 10)
        : NaN;
      if (Number.isFinite(packMinutes) && packMinutes > 0) {
        await recordLedgerEntry(db, {
          user_id: userId,
          delta_minutes: packMinutes,
          kind: "purchase",
          reason: "Credit pack purchase",
          reference: invoice.id,
        }).catch(() => null);
        scheduleAudit({
          actor: userId,
          action: "billing.credit_purchase",
          target: invoice.id,
          metadata: { minutes: packMinutes },
          ip: null,
          user_agent: null,
        });
      }
      // First paid event for a referred user earns a commission.
      if (isFirstPaid && event.amountMinor !== null && event.amountMinor > 0) {
        const referral = await getReferralByReferredUser(db, userId).catch(
          () => null,
        );
        if (referral) {
          const amount = commissionFor(
            event.amountMinor,
            affiliateRatePercent(),
          );
          if (amount > 0) {
            await createCommission(db, {
              referral_id: referral.id,
              user_id: referral.referrer_user_id,
              amount_minor: amount,
              currency: event.currency ?? "USD",
              status: "pending",
            }).catch(() => null);
            scheduleAudit({
              actor: referral.referrer_user_id,
              action: "billing.commission",
              target: referral.id,
              metadata: { amountMinor: amount },
              ip: null,
              user_agent: null,
            });
          }
        }
      }
      return { processed: "transaction_completed", invoiceId: invoice.id };
    }
    case "transaction_failed": {
      if (!event.subscriptionId) return { ignored: "no subscription id" };
      const existing = await getSubscriptionByProviderId(
        db,
        providerName,
        event.subscriptionId,
      ).catch(() => null);
      if (!existing) return { ignored: "unknown subscription" };
      const now = new Date().toISOString();
      await updateSubscription(db, existing.id, {
        status: "past_due",
        dunning_started_at: existing.dunning_started_at ?? now,
        dunning_attempts: 0,
        dunning_next_retry_at: null,
      }).catch(() => null);
      await createNotification(db, {
        user_id: existing.user_id,
        kind: "billing_payment_failed",
        title: "Payment failed",
        body: "Your latest payment failed. Please update your payment method to keep your plan.",
      }).catch(() => null);
      scheduleAudit({
        actor: existing.user_id,
        action: "billing.dunning_step",
        target: existing.id,
        metadata: { step: "payment_failed" },
        ip: null,
        user_agent: null,
      });
      return { processed: "transaction_failed" };
    }
    default:
      return { ignored: "unknown kind" };
  }
}
