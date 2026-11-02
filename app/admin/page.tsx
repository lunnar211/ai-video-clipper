"use client";

import { useEffect, useState } from "react";

type Metrics = {
  dauMau: { dau: number; mau: number };
  funnel: { signups: number; firstClip: number; firstPublish: number; paid: number };
  queueHealth: Record<string, number>;
  costByUser: Record<string, number>;
  costByFeature: Record<string, number>;
  revenue: { planCounts: Record<string, number>; mrrAvailable: boolean; mrrUsd: number | null };
  publishSuccessByPlatform: Record<string, { attempted: number; published: number; rate: number }>;
  topErrors: { error: string; count: number }[];
  strikeStats: Record<string, number>;
  anomalies: { rule: string; severity: string; detail: string }[];
};

/**
 * Admin dashboard (ClipForge Phase 4). Every number comes from the
 * metrics API, which aggregates real database rows. Without a
 * configured database the page shows setup instructions, never
 * invented numbers. MRR is reported as unavailable until
 * subscription data exists.
 */
export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as Metrics & {
          error?: string;
        };
        if (!res.ok) {
          setMessage(data.error ?? "Metrics could not be loaded.");
          return;
        }
        setMetrics(data);
      })
      .catch(() => setMessage("Metrics could not be loaded."));
  }, []);

  if (message) {
    return (
      <main>
        <h1 className="text-xl font-bold text-slate-900">Admin dashboard</h1>
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {message} To set up the admin console: apply
          supabase/clipper-schema.sql, then migrations 001, 002, 003 and
          004 in the Supabase SQL editor, set NEXT_PUBLIC_SUPABASE_URL
          and SUPABASE_SERVICE_ROLE_KEY, and assign owner/admin roles
          in the Table Editor.
        </p>
      </main>
    );
  }
  if (!metrics) {
    return (
      <main>
        <h1 className="text-xl font-bold text-slate-900">Admin dashboard</h1>
        <p className="mt-4 text-sm text-slate-600">Loading…</p>
      </main>
    );
  }

  return (
    <main>
      <h1 className="text-xl font-bold text-slate-900">Admin dashboard</h1>
      <section className="mt-4">
        <h2 className="font-semibold">Activity</h2>
        <p className="text-sm text-slate-700">
          Daily active users: {metrics.dauMau.dau} · Monthly active
          users: {metrics.dauMau.mau}
        </p>
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">Funnel</h2>
        <p className="text-sm text-slate-700">
          Signups: {metrics.funnel.signups} · First clip:{" "}
          {metrics.funnel.firstClip} · First publish:{" "}
          {metrics.funnel.firstPublish} · Paid: {metrics.funnel.paid}
        </p>
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">Queue health</h2>
        <ul className="text-sm text-slate-700">
          {Object.entries(metrics.queueHealth).map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
          {Object.keys(metrics.queueHealth).length === 0 && (
            <li>No queued jobs or posts.</li>
          )}
        </ul>
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">AI cost (recorded only)</h2>
        <p className="text-sm text-slate-700">
          {Object.keys(metrics.costByFeature).length === 0
            ? "No AI cost recorded yet (costs are recorded only when a provider reports them; nothing is estimated)."
            : Object.entries(metrics.costByFeature).map(([k, v]) => (
                <span key={k}>
                  {k}: ${v.toFixed(4)}{" "}
                </span>
              ))}
        </p>
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">Revenue</h2>
        <p className="text-sm text-slate-700">
          {Object.entries(metrics.revenue.planCounts).map(([k, v]) => (
            <span key={k}>
              {k}: {v}{" "}
            </span>
          ))}
          {metrics.revenue.mrrAvailable
            ? `MRR: $${metrics.revenue.mrrUsd}`
            : "MRR: not available until subscription data exists (never estimated)."}
        </p>
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">Publish success by platform</h2>
        <ul className="text-sm text-slate-700">
          {Object.entries(metrics.publishSuccessByPlatform).map(
            ([platform, s]) => (
              <li key={platform}>
                {platform}: {s.published}/{s.attempted} (
                {Math.round(s.rate * 100)}%)
              </li>
            ),
          )}
          {Object.keys(metrics.publishSuccessByPlatform).length === 0 && (
            <li>No publish attempts recorded.</li>
          )}
        </ul>
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">Top errors</h2>
        <ul className="text-sm text-slate-700">
          {metrics.topErrors.map((e) => (
            <li key={e.error}>
              {e.error} ×{e.count}
            </li>
          ))}
          {metrics.topErrors.length === 0 && <li>No errors recorded.</li>}
        </ul>
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">Strikes</h2>
        <p className="text-sm text-slate-700">
          {Object.entries(metrics.strikeStats).map(([k, v]) => (
            <span key={k}>
              {k}: {v}{" "}
            </span>
          ))}
          {Object.keys(metrics.strikeStats).length === 0 &&
            "No strikes recorded."}
        </p>
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">Anomaly alerts</h2>
        <ul className="text-sm text-slate-700">
          {metrics.anomalies.map((a, i) => (
            <li key={i}>
              [{a.severity}] {a.rule}: {a.detail}
            </li>
          ))}
          {metrics.anomalies.length === 0 && <li>No anomalies detected.</li>}
        </ul>
      </section>
    </main>
  );
}
