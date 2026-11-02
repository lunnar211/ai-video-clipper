"use client";

import { useEffect, useState } from "react";

type Subscription = {
  id: string;
  user_id: string;
  provider: string;
  provider_subscription_id: string | null;
  plan: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  dunning_attempts: number;
  created_at: string;
};

/** Admin subscription list (ClipForge Phase 6). Status-only rows. */
export default function AdminBillingSubscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = (filter: string) => {
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    fetch(`/api/admin/billing/subscriptions?${params.toString()}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          subscriptions?: Subscription[];
          error?: string;
        };
        if (!res.ok) {
          setMessage(data.error ?? "Subscriptions could not be loaded.");
          return;
        }
        setSubs(data.subscriptions ?? []);
        setMessage(null);
      })
      .catch(() => setMessage("Subscriptions could not be loaded."));
  };

  useEffect(() => {
    load("");
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Subscriptions</h1>
      <div className="mt-4 flex gap-2 text-sm">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border px-2 py-1"
        >
          <option value="">All statuses</option>
          <option value="pending">pending</option>
          <option value="trialing">trialing</option>
          <option value="active">active</option>
          <option value="past_due">past_due</option>
          <option value="canceled">canceled</option>
        </select>
        <button
          onClick={() => load(status)}
          className="border px-3 py-1"
        >
          Filter
        </button>
      </div>
      {message && <p className="mt-4 text-sm text-red-700">{message}</p>}
      <ul className="mt-4 space-y-3 text-sm">
        {subs.map((sub) => (
          <li key={sub.id} className="border p-3">
            <p>
              <span className="font-semibold">{sub.plan}</span> —{" "}
              {sub.status}
              {sub.cancel_at_period_end ? " (cancel at period end)" : ""}
            </p>
            <p className="text-gray-600">
              User {sub.user_id} · {sub.provider}
              {sub.provider_subscription_id
                ? ` · ${sub.provider_subscription_id}`
                : " · no MoR id yet (pending checkout)"}
            </p>
            <p className="text-gray-600">
              Period ends {sub.current_period_end ?? "unknown"} ·
              dunning attempts {sub.dunning_attempts}
            </p>
          </li>
        ))}
        {subs.length === 0 && !message && (
          <li className="text-gray-600">No subscriptions found.</li>
        )}
      </ul>
    </div>
  );
}
