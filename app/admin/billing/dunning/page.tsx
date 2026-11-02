"use client";

import { useEffect, useState } from "react";

type Subscription = {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  dunning_attempts: number;
  dunning_next_retry_at: string | null;
  dunning_started_at: string | null;
};

/** Admin dunning queue (ClipForge Phase 6). */
export default function AdminBillingDunning() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/billing/subscriptions?status=past_due")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          subscriptions?: Subscription[];
          error?: string;
        };
        if (!res.ok) {
          setMessage(data.error ?? "Dunning queue could not be loaded.");
          return;
        }
        setSubs(data.subscriptions ?? []);
        setMessage(null);
      })
      .catch(() => setMessage("Dunning queue could not be loaded."));
  };

  useEffect(() => {
    load();
  }, []);

  const run = async () => {
    setResult(null);
    const res = await fetch("/api/admin/billing/dunning/run", {
      method: "POST",
    });
    const data = (await res.json().catch(() => ({}))) as {
      retried?: number;
      canceled?: number;
      waiting?: number;
      error?: string;
    };
    if (!res.ok) {
      setMessage(data.error ?? "Dunning run failed.");
      return;
    }
    setResult(
      `Retried ${data.retried ?? 0}, canceled ${data.canceled ?? 0}, waiting ${data.waiting ?? 0}.`,
    );
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Dunning queue</h1>
      <p className="mt-2 text-sm text-gray-600">
        Failed payments retry on the configured schedule (default days
        1, 3, 7) and cancel after the grace period (default 14 days).
        Notifications go in-app; email stays inert until a working
        mail provider lands.
      </p>
      <button onClick={run} className="mt-4 border px-3 py-1 text-sm">
        Run dunning step
      </button>
      {result && <p className="mt-2 text-sm">{result}</p>}
      {message && <p className="mt-4 text-sm text-red-700">{message}</p>}
      <ul className="mt-4 space-y-3 text-sm">
        {subs.map((sub) => (
          <li key={sub.id} className="border p-3">
            <p>
              <span className="font-semibold">{sub.plan}</span> —{" "}
              {sub.status} — user {sub.user_id}
            </p>
            <p className="text-gray-600">
              Attempts {sub.dunning_attempts} · started{" "}
              {sub.dunning_started_at ?? "unknown"} · next retry{" "}
              {sub.dunning_next_retry_at ?? "none scheduled"}
            </p>
          </li>
        ))}
        {subs.length === 0 && !message && (
          <li className="text-gray-600">Dunning queue is empty.</li>
        )}
      </ul>
    </div>
  );
}
