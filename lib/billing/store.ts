/**
 * Billing storage helpers (ClipForge Phase 6, PostgREST pattern).
 *
 * Mirrors lib/admin/store.ts: server-side reads/writes through
 * PostgREST with the service-role key, injectable fetch for tests,
 * honest null when the database is not configured (resolved by the
 * routes). Nothing here stores card or payment-instrument data: the
 * MoR holds payment data, and the app stores only references
 * (provider ids, amounts in integer minor units, statuses).
 *
 * NOTE on Phase 4 clip credits: clipper_credit_adjustments (delta in
 * CLIPS, admin adjustments) is untouched. Phase 6 metering uses a
 * separate MINUTES ledger (clipper_credit_ledger, delta_minutes)
 * because subscription limits are minute-based. The two balances
 * are different units and are never mixed.
 */

import type { FetchImpl } from "@/lib/ai/providers";
import {
  resolveRightsDb,
  restHeaders,
  type RightsDb,
} from "@/lib/rights/declarations";

export type BillingDb = RightsDb;

export function resolveBillingDb(): BillingDb | null {
  return resolveRightsDb();
}

async function postRow<T>(
  db: BillingDb,
  table: string,
  row: Record<string, unknown>,
  fetchImpl: FetchImpl,
): Promise<T> {
  const res = await fetchImpl(`${db.url}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...restHeaders(db), Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`${table} insert failed (HTTP ${res.status})`);
  const data = (await res.json()) as T[];
  const created = data[0];
  if (!created) throw new Error(`${table} insert returned no row`);
  return created;
}

async function getRows<T>(
  db: BillingDb,
  table: string,
  query: string,
  fetchImpl: FetchImpl,
): Promise<T[]> {
  const res = await fetchImpl(`${db.url}/rest/v1/${table}?${query}`, {
    headers: restHeaders(db),
  });
  if (!res.ok) throw new Error(`${table} read failed (HTTP ${res.status})`);
  return (await res.json()) as T[];
}

async function patchRows<T>(
  db: BillingDb,
  table: string,
  query: string,
  patch: Record<string, unknown>,
  fetchImpl: FetchImpl,
): Promise<T[]> {
  const res = await fetchImpl(`${db.url}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { ...restHeaders(db), Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`${table} update failed (HTTP ${res.status})`);
  return (await res.json()) as T[];
}

/* ------------------------------------------------------------------ */
/* Subscriptions                                                      */
/* ------------------------------------------------------------------ */

export type SubscriptionStatus =
  | "pending"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export type SubscriptionRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_subscription_id: string | null;
  plan: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  dunning_attempts: number;
  dunning_next_retry_at: string | null;
  dunning_started_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function createSubscription(
  db: BillingDb,
  row: {
    user_id: string;
    provider: string;
    provider_subscription_id: string | null;
    plan: string;
    status: SubscriptionStatus;
  },
  fetchImpl: FetchImpl = fetch,
): Promise<SubscriptionRow> {
  return postRow(db, "clipper_subscriptions", row, fetchImpl);
}

export async function listSubscriptionsByUser(
  db: BillingDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<SubscriptionRow[]> {
  return getRows(
    db,
    "clipper_subscriptions",
    `user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
    fetchImpl,
  );
}

export async function listSubscriptions(
  db: BillingDb,
  status: string | null,
  fetchImpl: FetchImpl = fetch,
): Promise<SubscriptionRow[]> {
  const filter = status
    ? `status=eq.${encodeURIComponent(status)}&`
    : "";
  return getRows(
    db,
    "clipper_subscriptions",
    `${filter}order=created_at.desc&limit=200`,
    fetchImpl,
  );
}

export async function getSubscriptionByProviderId(
  db: BillingDb,
  provider: string,
  providerSubscriptionId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<SubscriptionRow | null> {
  const rows = await getRows<SubscriptionRow>(
    db,
    "clipper_subscriptions",
    `provider=eq.${encodeURIComponent(provider)}&provider_subscription_id=eq.${encodeURIComponent(providerSubscriptionId)}&limit=1`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

export async function updateSubscription(
  db: BillingDb,
  id: string,
  patch: Partial<SubscriptionRow>,
  fetchImpl: FetchImpl = fetch,
): Promise<SubscriptionRow | null> {
  const rows = await patchRows<SubscriptionRow>(
    db,
    "clipper_subscriptions",
    `id=eq.${encodeURIComponent(id)}`,
    patch,
    fetchImpl,
  );
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Invoices                                                           */
/* ------------------------------------------------------------------ */

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  amount_minor: number;
};

export type InvoiceRow = {
  id: string;
  user_id: string;
  subscription_id: string | null;
  number: string;
  status: string;
  currency: string;
  total_minor: number;
  line_items: InvoiceLineItem[];
  provider: string;
  provider_transaction_id: string | null;
  created_at: string;
};

export async function createInvoice(
  db: BillingDb,
  row: Omit<InvoiceRow, "id" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<InvoiceRow> {
  return postRow(db, "clipper_invoices", row, fetchImpl);
}

export async function listInvoicesByUser(
  db: BillingDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<InvoiceRow[]> {
  return getRows(
    db,
    "clipper_invoices",
    `user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
    fetchImpl,
  );
}

export async function listInvoices(
  db: BillingDb,
  fetchImpl: FetchImpl = fetch,
): Promise<InvoiceRow[]> {
  return getRows(
    db,
    "clipper_invoices",
    `order=created_at.desc&limit=200`,
    fetchImpl,
  );
}

export async function getInvoice(
  db: BillingDb,
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<InvoiceRow | null> {
  const rows = await getRows<InvoiceRow>(
    db,
    "clipper_invoices",
    `id=eq.${encodeURIComponent(id)}&limit=1`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Credit ledger (MINUTES — never mixed with Phase 4 clip credits)    */
/* ------------------------------------------------------------------ */

export type LedgerKind =
  | "grant"
  | "purchase"
  | "consumption"
  | "adjustment"
  | "expiry";

export type LedgerEntry = {
  id: string;
  user_id: string;
  delta_minutes: number;
  kind: LedgerKind;
  reason: string;
  reference: string | null;
  created_at: string;
};

export async function recordLedgerEntry(
  db: BillingDb,
  row: Omit<LedgerEntry, "id" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<LedgerEntry> {
  return postRow(db, "clipper_credit_ledger", row, fetchImpl);
}

export async function listLedgerByUser(
  db: BillingDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<LedgerEntry[]> {
  return getRows(
    db,
    "clipper_credit_ledger",
    `user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=500`,
    fetchImpl,
  );
}

/* ------------------------------------------------------------------ */
/* Coupons                                                            */
/* ------------------------------------------------------------------ */

export type CouponRow = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  max_uses: number | null;
  uses_count: number;
  per_user_once: boolean;
  plan: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
};

export async function createCoupon(
  db: BillingDb,
  row: Omit<CouponRow, "id" | "created_at" | "uses_count">,
  fetchImpl: FetchImpl = fetch,
): Promise<CouponRow> {
  return postRow(
    db,
    "clipper_coupons",
    { ...row, uses_count: 0 },
    fetchImpl,
  );
}

export async function getCouponByCode(
  db: BillingDb,
  code: string,
  fetchImpl: FetchImpl = fetch,
): Promise<CouponRow | null> {
  const rows = await getRows<CouponRow>(
    db,
    "clipper_coupons",
    `code=eq.${encodeURIComponent(code.toUpperCase())}&limit=1`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

export async function listCoupons(
  db: BillingDb,
  fetchImpl: FetchImpl = fetch,
): Promise<CouponRow[]> {
  return getRows(
    db,
    "clipper_coupons",
    `order=created_at.desc&limit=200`,
    fetchImpl,
  );
}

export async function incrementCouponUses(
  db: BillingDb,
  coupon: CouponRow,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  await patchRows(
    db,
    "clipper_coupons",
    `id=eq.${encodeURIComponent(coupon.id)}`,
    { uses_count: coupon.uses_count + 1 },
    fetchImpl,
  );
}

export type CouponRedemptionRow = {
  id: string;
  coupon_id: string;
  user_id: string;
  checkout_reference: string;
  created_at: string;
};

export async function createRedemption(
  db: BillingDb,
  row: Omit<CouponRedemptionRow, "id" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<CouponRedemptionRow> {
  return postRow(db, "clipper_coupon_redemptions", row, fetchImpl);
}

export async function listRedemptionsByUser(
  db: BillingDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<CouponRedemptionRow[]> {
  return getRows(
    db,
    "clipper_coupon_redemptions",
    `user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
    fetchImpl,
  );
}

/* ------------------------------------------------------------------ */
/* User plan lookup (clipper_users.plan, widened by migration 006)    */
/* ------------------------------------------------------------------ */

export async function getUserPlan(
  db: BillingDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string | null> {
  const rows = await getRows<{ plan: string }>(
    db,
    "clipper_users",
    `id=eq.${encodeURIComponent(userId)}&select=plan&limit=1`,
    fetchImpl,
  );
  return rows[0]?.plan ?? null;
}

export async function getUserByEmail(
  db: BillingDb,
  email: string,
  fetchImpl: FetchImpl = fetch,
): Promise<{ id: string; plan: string } | null> {
  const rows = await getRows<{ id: string; plan: string }>(
    db,
    "clipper_users",
    `email=eq.${encodeURIComponent(email)}&select=id,plan&limit=1`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

export async function updateUserPlan(
  db: BillingDb,
  userId: string,
  plan: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  await patchRows(
    db,
    "clipper_users",
    `id=eq.${encodeURIComponent(userId)}`,
    { plan },
    fetchImpl,
  );
}

/* ------------------------------------------------------------------ */
/* Affiliates                                                         */
/* ------------------------------------------------------------------ */

/**
 * Referral-code registry: a code maps to exactly one owner. This is
 * separate from clipper_referrals (which records each attribution):
 * without a registry, a code that was never used would have no
 * owner to attribute to.
 */
export type ReferralCodeRow = {
  id: string;
  code: string;
  user_id: string;
  created_at: string;
};

export async function createReferralCode(
  db: BillingDb,
  row: Omit<ReferralCodeRow, "id" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<ReferralCodeRow> {
  return postRow(db, "clipper_referral_codes", row, fetchImpl);
}

export async function getReferralCodeOwner(
  db: BillingDb,
  code: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ReferralCodeRow | null> {
  const rows = await getRows<ReferralCodeRow>(
    db,
    "clipper_referral_codes",
    `code=eq.${encodeURIComponent(code.toUpperCase())}&limit=1`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

export async function listReferralCodesByUser(
  db: BillingDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ReferralCodeRow[]> {
  return getRows(
    db,
    "clipper_referral_codes",
    `user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
    fetchImpl,
  );
}

export type ReferralRow = {
  id: string;
  code: string;
  referrer_user_id: string;
  referred_user_id: string;
  created_at: string;
};

export async function createReferral(
  db: BillingDb,
  row: Omit<ReferralRow, "id" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<ReferralRow> {
  return postRow(db, "clipper_referrals", row, fetchImpl);
}

export async function getReferralByCode(
  db: BillingDb,
  code: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ReferralRow[]> {
  // A code belongs to one referrer but may have many referred users;
  // callers filter by referred user when checking attribution.
  return getRows(
    db,
    "clipper_referrals",
    `code=eq.${encodeURIComponent(code.toUpperCase())}&order=created_at.desc`,
    fetchImpl,
  );
}

export async function getReferralByReferredUser(
  db: BillingDb,
  referredUserId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ReferralRow | null> {
  const rows = await getRows<ReferralRow>(
    db,
    "clipper_referrals",
    `referred_user_id=eq.${encodeURIComponent(referredUserId)}&limit=1`,
    fetchImpl,
  );
  return rows[0] ?? null;
}

export async function listReferrals(
  db: BillingDb,
  fetchImpl: FetchImpl = fetch,
): Promise<ReferralRow[]> {
  return getRows(
    db,
    "clipper_referrals",
    `order=created_at.desc&limit=200`,
    fetchImpl,
  );
}

export type CommissionRow = {
  id: string;
  referral_id: string;
  user_id: string;
  amount_minor: number;
  currency: string;
  status: "pending" | "approved" | "paid";
  created_at: string;
};

export async function createCommission(
  db: BillingDb,
  row: Omit<CommissionRow, "id" | "created_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<CommissionRow> {
  return postRow(db, "clipper_commissions", row, fetchImpl);
}

export async function listCommissions(
  db: BillingDb,
  fetchImpl: FetchImpl = fetch,
): Promise<CommissionRow[]> {
  return getRows(
    db,
    "clipper_commissions",
    `order=created_at.desc&limit=200`,
    fetchImpl,
  );
}

/* ------------------------------------------------------------------ */
/* Webhook events (idempotency) + notifications                       */
/* ------------------------------------------------------------------ */

export type WebhookEventRow = {
  id: string;
  provider: string;
  event_id: string;
  type: string;
  processed: boolean;
  created_at: string;
};

export async function recordWebhookEvent(
  db: BillingDb,
  row: Omit<WebhookEventRow, "id" | "created_at" | "processed">,
  fetchImpl: FetchImpl = fetch,
): Promise<{ duplicate: boolean; row: WebhookEventRow | null }> {
  const res = await fetchImpl(`${db.url}/rest/v1/clipper_webhook_events`, {
    method: "POST",
    headers: { ...restHeaders(db), Prefer: "return=representation" },
    body: JSON.stringify({ ...row, processed: true }),
  });
  if (res.status === 409) return { duplicate: true, row: null };
  if (!res.ok) {
    throw new Error(`webhook event insert failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as WebhookEventRow[];
  return { duplicate: false, row: data[0] ?? null };
}

export type NotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export async function createNotification(
  db: BillingDb,
  row: Omit<NotificationRow, "id" | "created_at" | "read_at">,
  fetchImpl: FetchImpl = fetch,
): Promise<NotificationRow> {
  return postRow(
    db,
    "clipper_notifications",
    { ...row, read_at: null },
    fetchImpl,
  );
}

export async function listNotificationsByUser(
  db: BillingDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<NotificationRow[]> {
  return getRows(
    db,
    "clipper_notifications",
    `user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=100`,
    fetchImpl,
  );
}
