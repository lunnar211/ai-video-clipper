"use client";

import { useEffect, useState } from "react";

type AnalyticsRow = {
  id: string;
  post_id: string;
  target_id: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  synced_at: string;
};

/**
 * Unified post-publish analytics (ClipForge Phase 3).
 *
 * One row per published target per platform, synced from the
 * platform's own API (YouTube today; other platforms honestly report
 * as unsupported until their adapters land). Empty states say
 * exactly why there is nothing to show — never invented numbers.
 */
export default function Analytics() {
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch("/api/publish/analytics")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          rows?: AnalyticsRow[];
          message?: string | null;
          error?: string;
        };
        if (!res.ok) {
          setMessage(data.error ?? "Analytics could not be loaded.");
          return;
        }
        setRows(data.rows ?? []);
        setMessage(data.message ?? null);
      })
      .catch(() => {
        setMessage("Analytics could not be loaded (network error).");
      });
  };

  useEffect(() => {
    load();
  }, []);

  const sync = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/publish/analytics/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        synced?: number;
        unsupported?: string[];
        error?: string;
      };
      if (!res.ok) {
        setMessage(data.error ?? "Sync failed.");
        return;
      }
      setMessage(
        `Synced ${data.synced ?? 0} target(s).` +
          (data.unsupported?.length
            ? ` Unsupported: ${data.unsupported.join("; ")}`
            : ""),
      );
      load();
    } catch {
      setMessage("Sync failed (network error).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
      <p className="mt-2 text-muted-foreground">
        Views, likes, and comments synced from each platform&apos;s own
        API for your published posts. Numbers are only ever what the
        platform reported — nothing here is estimated or invented.
      </p>
      {message && (
        <p className="mt-4 rounded bg-muted p-3 text-sm">{message}</p>
      )}
      <button
        className="mt-4 rounded bg-primary px-4 py-2 text-on-primary disabled:opacity-50"
        disabled={busy}
        onClick={sync}
      >
        Sync now
      </button>
      {rows.length > 0 && (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Platform</th>
              <th className="py-2">Views</th>
              <th className="py-2">Likes</th>
              <th className="py-2">Comments</th>
              <th className="py-2">Synced</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="py-2">{row.platform}</td>
                <td className="py-2">{row.views}</td>
                <td className="py-2">{row.likes}</td>
                <td className="py-2">{row.comments}</td>
                <td className="py-2">
                  {new Date(row.synced_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
