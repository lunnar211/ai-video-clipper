"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

type Limits = {
  plan: string;
  placeholder: boolean;
  limits: {
    minutesPerMonth: number;
    projects: number;
    seats: number;
    publishTargets: number;
  } | null;
  minutesUsedThisMonth: number;
  minutesRemaining: number | null;
  minuteBalance: number;
  lowBalance: boolean;
};

type Subscription = {
  id: string;
  plan: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

type Invoice = {
  id: string;
  number: string;
  status: string;
  currency: string;
  total_minor: number;
  created_at: string;
};

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  created_at: string;
};

/**
 * User billing page (ClipForge Phase 6). The userId comes from the
 * ?userId= query param for now — the same caller-asserted pattern
 * as the billing APIs (session binding is a later hardening
 * slice). Shows plan + limits + minute balance, subscriptions,
 * invoices, and in-app notices. Never payment details: the MoR
 * holds those.
 */
function BillingInner() {
  const params = useSearchParams();
  const [userId, setUserId] = useState(params.get("userId") ?? "");
  const [limits, setLimits] = useState<Limits | null>(null);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = (id: string) => {
    if (!id) return;
    fetch(`/api/billing/limits?userId=${encodeURIComponent(id)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as Limits & {
          error?: string;
        };
        if (res.ok) setLimits(data);
        else setMessage(data.error ?? "Billing could not be loaded.");
      })
      .catch(() => setMessage("Billing could not be loaded."));
    fetch(`/api/billing/subscriptions?userId=${encodeURIComponent(id)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          subscriptions?: Subscription[];
        };
        if (res.ok) setSubs(data.subscriptions ?? []);
      })
      .catch(() => undefined);
    fetch(`/api/billing/invoices?userId=${encodeURIComponent(id)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          invoices?: Invoice[];
        };
        if (res.ok) setInvoices(data.invoices ?? []);
      })
      .catch(() => undefined);
    fetch(`/api/billing/notifications?userId=${encodeURIComponent(id)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          notifications?: Notification[];
        };
        if (res.ok) setNotifications(data.notifications ?? []);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    if (userId) load(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCode = async () => {
    const res = await fetch("/api/billing/referrals/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      code?: string;
      error?: string;
    };
    if (res.ok && data.code) setReferralCode(data.code);
    else setMessage(data.error ?? "Referral code could not be created.");
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
      <div className="mt-4 flex gap-2 text-sm">
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Your user id"
          className="border border-border px-2 py-1"
        />
        <button
          onClick={() => {
            setMessage(null);
            load(userId);
          }}
          className="border border-border px-3 py-1"
        >
          Load
        </button>
      </div>
      {message && <p className="mt-4 text-sm text-red-700 dark:text-red-300">{message}</p>}
      {limits && (
        <div className="mt-6 text-sm">
          <p>
            Plan: <span className="font-semibold">{limits.plan}</span>
            {limits.placeholder ? " (limits are placeholders the owner sets before launch)" : ""}
          </p>
          {limits.limits && (
            <p className="mt-1 text-muted-foreground">
              {limits.limits.minutesPerMonth} minutes/month ·{" "}
              {limits.limits.projects === -1
                ? "unlimited"
                : limits.limits.projects}{" "}
              projects · {limits.limits.seats} seats ·{" "}
              {limits.limits.publishTargets} publish targets
            </p>
          )}
          <p className="mt-1">
            Used this month: {limits.minutesUsedThisMonth} minutes
            {limits.minutesRemaining !== null
              ? ` · ${limits.minutesRemaining} remaining`
              : " · unlimited"}
          </p>
          <p>
            Minute balance: {limits.minuteBalance}
            {limits.lowBalance ? " — running low" : ""}
          </p>
        </div>
      )}
      <h2 className="mt-8 text-lg font-semibold">Subscriptions</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {subs.map((sub) => (
          <li key={sub.id} className="border border-border p-3">
            {sub.plan} — {sub.status}
            {sub.cancel_at_period_end ? " (ends at period end)" : ""}
            {sub.current_period_end
              ? ` · period ends ${sub.current_period_end}`
              : ""}
          </li>
        ))}
        {subs.length === 0 && (
          <li className="text-muted-foreground">No subscriptions found.</li>
        )}
      </ul>
      <h2 className="mt-8 text-lg font-semibold">Invoices</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {invoices.map((inv) => (
          <li key={inv.id} className="border border-border p-3">
            <a
              href={`/billing/invoices/${inv.id}?userId=${encodeURIComponent(userId)}`}
              className="text-primary underline"
            >
              {inv.number}
            </a>{" "}
            — {inv.status} — {inv.total_minor} {inv.currency} (minor units)
          </li>
        ))}
        {invoices.length === 0 && (
          <li className="text-muted-foreground">No invoices found.</li>
        )}
      </ul>
      <h2 className="mt-8 text-lg font-semibold">Notices</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {notifications.map((n) => (
          <li key={n.id} className="border border-border p-3">
            <span className="font-semibold">{n.title}</span> — {n.body}
          </li>
        ))}
        {notifications.length === 0 && (
          <li className="text-muted-foreground">No notices.</li>
        )}
      </ul>
      <h2 className="mt-8 text-lg font-semibold">Referrals</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Share your code; commissions are records only until the owner
        picks a payout rail — no payout date or method is promised.
      </p>
      <button onClick={getCode} className="mt-2 border border-border px-3 py-1 text-sm">
        Get my referral code
      </button>
      {referralCode && (
        <p className="mt-2 text-sm">
          Your code: <span className="font-semibold">{referralCode}</span>
        </p>
      )}
      <p className="mt-8 text-sm text-muted-foreground">
        Canceling a plan never deletes your projects or clips — cancel
        and delete are separate actions.
      </p>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingInner />
    </Suspense>
  );
}
