"use client";

import { useEffect, useState } from "react";
import type { StrikeRow } from "@/lib/rights/strikes";

/**
 * Admin strike review queue (ClipForge Phase 2).
 *
 * Role-gated server-side (owner/admin rows only); this page only
 * renders what the API returns. 401 means "sign in with an admin
 * account"; 503 means the database is not connected yet. Review
 * actions move a strike submitted → under_review → upheld/overturned
 * and recompute the account's publishing-pause flag.
 */
export default function AdminStrikes() {
  const [strikes, setStrikes] = useState<StrikeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Pure fetch helper (no setState): the effect below subscribes to
  // its promise, which keeps the react-hooks/set-state-in-effect
  // rule happy and avoids cascading renders.
  const fetchQueue = async (): Promise<
    { strikes: StrikeRow[] } | { error: string }
  > => {
    try {
      const res = await fetch("/api/rights/strikes");
      const data = (await res.json().catch(() => ({}))) as {
        strikes?: StrikeRow[];
        error?: string;
      };
      if (!res.ok) return { error: data.error ?? "Could not load the review queue." };
      return { strikes: data.strikes ?? [] };
    } catch {
      return { error: "Could not load the review queue (network error)." };
    }
  };

  const load = () => {
    fetchQueue().then((result) => {
      if ("error" in result) setError(result.error);
      else setStrikes(result.strikes);
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const review = async (id: string, to: "under_review" | "upheld" | "overturned") => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/rights/strikes/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, adminNote: null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Review action failed.");
        return;
      }
      await load();
    } catch {
      setError("Review action failed (network error).");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 text-sm text-slate-700">
      <h1 className="text-2xl font-bold text-slate-900">
        Admin: strike review queue
      </h1>
      <p>
        Only owner/admin accounts can see this page. Upholding a
        strike counts toward the repeat-infringer policy: 2 upheld
        strikes flag an account for review, 3 auto-pause its
        publishing. Overturning recomputes the pause.
      </p>
      {error && <p className="text-red-700">{error}</p>}
      {strikes === null && !error && <p>Loading…</p>}
      {strikes !== null && strikes.length === 0 && <p>No strikes filed yet.</p>}
      <ul className="space-y-3">
        {(strikes ?? []).map((s) => (
          <li key={s.id} className="rounded-lg border p-4">
            <p className="font-medium">
              {s.status} — {s.work_description.slice(0, 120)}
            </p>
            <p className="text-slate-500">
              From {s.reporter_name} ({s.reporter_email}) · ref: {s.infringing_ref} ·
              id: {s.id}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {s.status === "submitted" && (
                <button
                  type="button"
                  className="rounded border px-3 py-1.5 disabled:opacity-50"
                  disabled={busyId === s.id}
                  onClick={() => review(s.id, "under_review")}
                >
                  Mark under review
                </button>
              )}
              {s.status === "under_review" && (
                <>
                  <button
                    type="button"
                    className="rounded border px-3 py-1.5 disabled:opacity-50"
                    disabled={busyId === s.id}
                    onClick={() => review(s.id, "upheld")}
                  >
                    Uphold strike
                  </button>
                  <button
                    type="button"
                    className="rounded border px-3 py-1.5 disabled:opacity-50"
                    disabled={busyId === s.id}
                    onClick={() => review(s.id, "overturned")}
                  >
                    Overturn strike
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
