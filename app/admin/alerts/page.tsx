"use client";

import { useEffect, useState } from "react";

type AlertsData = {
  anomalies: { rule: string; severity: string; detail: string }[];
  storedAlerts: { id: string; rule: string; severity: string; detail: string; created_at: string }[];
  thresholds: { volumeThresholdPerHour: number; ipUsersThreshold: number };
  channelsConfigured: { slack: boolean; discord: boolean; email: boolean };
};

/**
 * Admin alerts (ClipForge Phase 4). Shows the current anomaly
 * evaluation, stored alerts, and which webhook channels are
 * configured (booleans only — webhook URLs are never shown).
 * Dispatch sends the current anomalies to every configured channel;
 * without any channel it honestly reports "not configured" and the
 * in-console alerts still work.
 */
export default function AdminAlerts() {
  const [data, setData] = useState<AlertsData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch("/api/admin/alerts")
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as AlertsData & {
          error?: string;
        };
        if (!res.ok) {
          setMessage(body.error ?? "Alerts could not be loaded.");
          return;
        }
        setData(body);
        setMessage(null);
      })
      .catch(() => setMessage("Alerts could not be loaded."));
  };

  useEffect(load, []);

  const dispatch = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/alerts", { method: "POST" });
    const out = (await res.json().catch(() => ({}))) as {
      dispatched?: { rule: string; channel: string; sent: boolean; reason?: string }[];
      error?: string;
    };
    if (!res.ok) {
      setMessage(out.error ?? "Dispatch failed.");
    } else {
      const summary = (out.dispatched ?? [])
        .map((d) => `${d.channel}: ${d.sent ? "sent" : d.reason ?? "not sent"}`)
        .join("; ");
      setMessage(summary || "No anomalies to dispatch.");
    }
    setBusy(false);
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Alerts</h1>
      {message && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {message}
        </p>
      )}
      {!data && !message && (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      )}
      {data && (
        <>
          <section className="mt-4">
            <h2 className="font-semibold">Current anomalies</h2>
            <ul className="text-sm text-muted-foreground">
              {data.anomalies.map((a, i) => (
                <li key={i}>
                  [{a.severity}] {a.rule}: {a.detail}
                </li>
              ))}
              {data.anomalies.length === 0 && <li>No anomalies detected.</li>}
            </ul>
          </section>
          <section className="mt-4">
            <h2 className="font-semibold">Thresholds</h2>
            <p className="text-sm text-muted-foreground">
              Unusual volume: {data.thresholds.volumeThresholdPerHour}{" "}
              events/hour · Many accounts per IP:{" "}
              {data.thresholds.ipUsersThreshold} users
            </p>
            <p className="text-sm text-muted-foreground">
              Channels configured — Slack:{" "}
              {data.channelsConfigured.slack ? "yes" : "no"} · Discord:{" "}
              {data.channelsConfigured.discord ? "yes" : "no"} · Email:{" "}
              {data.channelsConfigured.email ? "yes" : "no"}
            </p>
          </section>
          <button
            type="button"
            disabled={busy}
            onClick={dispatch}
            className="mt-4 inline-flex min-h-[44px] items-center rounded bg-primary px-3 py-1 text-sm text-on-primary disabled:opacity-50"
          >
            {busy ? "Dispatching…" : "Evaluate + dispatch now"}
          </button>
          <section className="mt-4">
            <h2 className="font-semibold">Stored alerts</h2>
            <ul className="text-sm text-muted-foreground">
              {data.storedAlerts.map((a) => (
                <li key={a.id}>
                  [{a.severity}] {a.rule}: {a.detail} (
                  {new Date(a.created_at).toLocaleString()})
                </li>
              ))}
              {data.storedAlerts.length === 0 && <li>No stored alerts.</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
