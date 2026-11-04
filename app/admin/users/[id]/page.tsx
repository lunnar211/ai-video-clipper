"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Drilldown = {
  user: {
    id: string;
    email: string;
    plan: string;
    role: string;
    status: string;
  };
  usageMinutes: number;
  clipCount: number;
  projects: { id: string; title: string; created_at: string }[];
  clips: { id: string; title: string; start_seconds: number; end_seconds: number; created_at: string }[];
  posts: { id: string; clip_ref: string; status: string; schedule_at: string | null; created_at: string }[];
  accounts: { id: string; platform: string; account_label: string; status: string; created_at: string }[];
  compliance: {
    declarationCount: number;
    fingerprintScanCount: number;
    strikeCount: number;
    upheldStrikeCount: number;
    publishingPaused: boolean;
  };
  supportNotes: { id: string; admin_id: string; note: string; created_at: string }[];
  creditAdjustments: { id: string; admin_id: string; delta_clips: number; reason: string; created_at: string }[];
  creditBalanceClips: number;
};

/**
 * Admin user drill-down (ClipForge Phase 4). Connected accounts show
 * STATUS ONLY — never tokens. Admin actions (suspend/restore, credit
 * adjust, notes, view-as) each write an audit entry. View-as is
 * view-only: it never lets the admin publish or bill as the user.
 */
export default function AdminUserDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<Drilldown | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [viewAsReason, setViewAsReason] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const load = () => {
    if (!id) return;
    fetch(`/api/admin/users/${id}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          user?: Drilldown;
          error?: string;
        };
        if (!res.ok) {
          setMessage(body.error ?? "User could not be loaded.");
          return;
        }
        setData(body.user ?? null);
      })
      .catch(() => setMessage("User could not be loaded."));
  };

  useEffect(load, [id]);

  const act = async (path: string, body: unknown) => {
    if (!id) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/admin/users/${id}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) setMessage(out.error ?? "Action failed.");
    setBusy(false);
    load();
  };

  if (!data) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">User</h1>
        {message ? (
          <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {message}
          </p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{data.user.email}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Plan: {data.user.plan} · Role: {data.user.role} · Status:{" "}
        {data.user.status} · Usage: {data.usageMinutes} min · Clips:{" "}
        {data.clipCount} · Credit balance: {data.creditBalanceClips} clips
      </p>
      {message && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {message}
        </p>
      )}
      <section className="mt-4">
        <h2 className="font-semibold">Connected accounts (status only)</h2>
        <ul className="text-sm text-muted-foreground">
          {data.accounts.map((a) => (
            <li key={a.id}>
              {a.platform}: {a.account_label} — {a.status}
            </li>
          ))}
          {data.accounts.length === 0 && <li>No connected accounts.</li>}
        </ul>
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">Posts timeline</h2>
        <ul className="text-sm text-muted-foreground">
          {data.posts.map((p) => (
            <li key={p.id}>
              {p.clip_ref} — {p.status}
              {p.schedule_at ? ` (scheduled ${p.schedule_at})` : ""}
            </li>
          ))}
          {data.posts.length === 0 && <li>No posts.</li>}
        </ul>
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">Compliance</h2>
        <p className="text-sm text-muted-foreground">
          Declarations: {data.compliance.declarationCount} · Fingerprint
          scans: {data.compliance.fingerprintScanCount} · Strikes:{" "}
          {data.compliance.strikeCount} (upheld:{" "}
          {data.compliance.upheldStrikeCount}) · Publishing paused:{" "}
          {data.compliance.publishingPaused ? "yes" : "no"}
        </p>
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">Support notes</h2>
        <ul className="text-sm text-muted-foreground">
          {data.supportNotes.map((n) => (
            <li key={n.id}>
              {n.note} <span className="text-muted-foreground">({n.admin_id})</span>
            </li>
          ))}
          {data.supportNotes.length === 0 && <li>No notes.</li>}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Support note"
            className="flex-1 rounded border border-border px-2 py-1 text-sm"
          />
          <button
            type="button"
            disabled={busy || !note.trim()}
            onClick={() => act("/notes", { note })}
            className="inline-flex min-h-[44px] items-center rounded bg-primary px-3 py-1 text-sm text-on-primary disabled:opacity-50"
          >
            Add note
          </button>
        </div>
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">Credit adjustments</h2>
        <ul className="text-sm text-muted-foreground">
          {data.creditAdjustments.map((a) => (
            <li key={a.id}>
              {a.delta_clips > 0 ? "+" : ""}
              {a.delta_clips} — {a.reason}
            </li>
          ))}
          {data.creditAdjustments.length === 0 && <li>No adjustments.</li>}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="Delta clips (e.g. 5 or -2)"
            className="w-48 rounded border border-border px-2 py-1 text-sm"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            className="flex-1 rounded border border-border px-2 py-1 text-sm"
          />
          <button
            type="button"
            disabled={busy || !delta.trim() || !reason.trim()}
            onClick={() =>
              act("/credits", { deltaClips: Number(delta), reason })
            }
            className="inline-flex min-h-[44px] items-center rounded bg-primary px-3 py-1 text-sm text-on-primary disabled:opacity-50"
          >
            Adjust
          </button>
        </div>
      </section>
      <section className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => act("/suspend", { reason: "Suspended from admin console" })}
          className="inline-flex min-h-[44px] items-center rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Suspend
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act("/restore", {})}
          className="inline-flex min-h-[44px] items-center rounded bg-green-600 px-3 py-1 text-sm text-black disabled:opacity-50"
        >
          Restore
        </button>
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">View as this user (read-only)</h2>
        <p className="text-xs text-muted-foreground">
          Requires a reason. View-as never exposes tokens and never lets
          you publish or bill as this user. A banner shows during the
          session and the start/end are audited.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={viewAsReason}
            onChange={(e) => setViewAsReason(e.target.value)}
            placeholder="Reason (at least 10 characters)"
            className="flex-1 rounded border border-border px-2 py-1 text-sm"
          />
          <button
            type="button"
            disabled={busy || viewAsReason.trim().length < 10}
            onClick={async () => {
              setBusy(true);
              setMessage(null);
              const res = await fetch("/api/admin/impersonate/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  targetUserId: id,
                  reason: viewAsReason,
                }),
              });
              const out = (await res.json().catch(() => ({}))) as {
                error?: string;
              };
              if (!res.ok) setMessage(out.error ?? "View-as failed.");
              else router.push("/admin");
              setBusy(false);
            }}
            className="inline-flex min-h-[44px] items-center rounded bg-amber-600 px-3 py-1 text-sm text-black disabled:opacity-50"
          >
            View as
          </button>
        </div>
      </section>
    </div>
  );
}
