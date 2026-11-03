"use client";

import { useEffect, useState } from "react";

type Referral = {
  id: string;
  code: string;
  referrer_user_id: string;
  referred_user_id: string;
  created_at: string;
};

type Commission = {
  id: string;
  referral_id: string;
  user_id: string;
  amount_minor: number;
  currency: string;
  status: string;
  created_at: string;
};

/** Admin affiliates (ClipForge Phase 6). Records only — payouts manual. */
export default function AdminBillingAffiliates() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/billing/affiliates")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          referrals?: Referral[];
          commissions?: Commission[];
          error?: string;
        };
        if (!res.ok) {
          setMessage(data.error ?? "Affiliates could not be loaded.");
          return;
        }
        setReferrals(data.referrals ?? []);
        setCommissions(data.commissions ?? []);
        setMessage(null);
      })
      .catch(() => setMessage("Affiliates could not be loaded."));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Affiliates</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Commissions are records of what a referrer earned. Payouts are
        manual — no payout rail is wired, and nothing here promises a
        payout date or method.
      </p>
      {message && <p className="mt-4 text-sm text-red-700 dark:text-red-300">{message}</p>}
      <h2 className="mt-6 text-lg font-semibold">Referrals</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {referrals.map((r) => (
          <li key={r.id} className="border p-3">
            Code {r.code}: {r.referrer_user_id} referred {r.referred_user_id}
          </li>
        ))}
        {referrals.length === 0 && !message && (
          <li className="text-muted-foreground">No referrals found.</li>
        )}
      </ul>
      <h2 className="mt-6 text-lg font-semibold">Commissions</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {commissions.map((c) => (
          <li key={c.id} className="border p-3">
            {c.amount_minor} {c.currency} (minor units) — {c.status} — user{" "}
            {c.user_id}
          </li>
        ))}
        {commissions.length === 0 && !message && (
          <li className="text-muted-foreground">No commissions found.</li>
        )}
      </ul>
    </div>
  );
}
