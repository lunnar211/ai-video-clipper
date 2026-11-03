"use client";

import { useEffect, useState } from "react";

type Overview = {
  subscriptionsByStatus: Record<string, number>;
  subscriptionCount: number;
  dunningQueue: number;
  invoiceCount: number;
  invoiceTotalMinor: number;
  couponCount: number;
  referralCount: number;
  commissionCount: number;
  commissionTotalMinor: number;
};

type FraudFlag = {
  kind: string;
  key: string;
  count: number;
  windowMinutes: number;
};

/**
 * Admin billing overview (ClipForge Phase 6). Counts and integer
 * minor-unit totals only — no payment-instrument data exists in
 * these tables (the MoR holds it). Fraud flags are signals, not
 * verdicts: nothing is auto-blocked on a flag alone.
 */
export default function AdminBilling() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [flags, setFlags] = useState<FraudFlag[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/billing/overview")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        } & Partial<Overview>;
        if (!res.ok) {
          setMessage(data.error ?? "Billing overview could not be loaded.");
          return;
        }
        setOverview(data as Overview);
        setMessage(null);
      })
      .catch(() => setMessage("Billing overview could not be loaded."));
    fetch("/api/admin/billing/fraud-signals")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          flags?: FraudFlag[];
        };
        if (res.ok) setFlags(data.flags ?? []);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Billing</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Plans, subscriptions, invoices, coupons, affiliates, and dunning.
        Prices live in the merchant-of-record dashboard — this console
        never invents a price and never shows payment details.
      </p>
      {message && <p className="mt-4 text-sm text-red-700 dark:text-red-300">{message}</p>}
      {overview && (
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Subscriptions</dt>
            <dd className="font-semibold">{overview.subscriptionCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Dunning queue (past due)</dt>
            <dd className="font-semibold">{overview.dunningQueue}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Invoices</dt>
            <dd className="font-semibold">{overview.invoiceCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Invoiced total (minor units)</dt>
            <dd className="font-semibold">{overview.invoiceTotalMinor}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Coupons</dt>
            <dd className="font-semibold">{overview.couponCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Referrals / commissions</dt>
            <dd className="font-semibold">
              {overview.referralCount} / {overview.commissionCount} (
              {overview.commissionTotalMinor} minor units)
            </dd>
          </div>
        </dl>
      )}
      {overview && (
        <p className="mt-4 text-sm text-muted-foreground">
          By status:{" "}
          {Object.entries(overview.subscriptionsByStatus)
            .map(([status, count]) => `${status}: ${count}`)
            .join(", ") || "none"}
        </p>
      )}
      <h2 className="mt-8 text-lg font-semibold">Fraud signals</h2>
      {flags.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No velocity flags in the recent window.
        </p>
      ) : (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {flags.map((flag, i) => (
            <li key={i}>
              {flag.kind} — {flag.key}: {flag.count} checkouts in{" "}
              {flag.windowMinutes} minutes. Signal only — review before
              acting.
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-sm">
        <a href="/admin/billing/subscriptions" className="text-primary underline">
          Subscriptions
        </a>{" "}
        ·{" "}
        <a href="/admin/billing/invoices" className="text-primary underline">
          Invoices
        </a>{" "}
        ·{" "}
        <a href="/admin/billing/coupons" className="text-primary underline">
          Coupons
        </a>{" "}
        ·{" "}
        <a href="/admin/billing/affiliates" className="text-primary underline">
          Affiliates
        </a>{" "}
        ·{" "}
        <a href="/admin/billing/dunning" className="text-primary underline">
          Dunning
        </a>
      </p>
    </div>
  );
}
