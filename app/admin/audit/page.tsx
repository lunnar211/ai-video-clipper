"use client";

import { useEffect, useState } from "react";

type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

/**
 * Admin audit log viewer (ClipForge Phase 4). Filters by actor and
 * action; export downloads the same entries as CSV or JSON. The purge
 * button deletes only rows older than the configured retention window
 * and writes its own audit entry — it is the only deletion path.
 */
export default function AdminAudit() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");

  const fetchEntries = (actorFilter: string, actionFilter: string) => {
    const params = new URLSearchParams();
    if (actorFilter) params.set("actor", actorFilter);
    if (actionFilter) params.set("action", actionFilter);
    fetch(`/api/admin/audit?${params.toString()}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          entries?: AuditEntry[];
          error?: string;
        };
        if (!res.ok) {
          setMessage(data.error ?? "Audit log could not be loaded.");
          return;
        }
        setEntries(data.entries ?? []);
        setMessage(null);
      })
      .catch(() => setMessage("Audit log could not be loaded."));
  };

  const load = () => fetchEntries(actor, action);

  // Mount only: filters apply through the Filter button, not on
  // every keystroke.
  useEffect(() => {
    fetchEntries("", "");
  }, []);

  const purge = async () => {
    if (!window.confirm("Delete audit entries older than the retention window? This writes a purge audit entry and cannot be undone.")) {
      return;
    }
    const res = await fetch("/api/admin/audit/purge", { method: "POST" });
    const out = (await res.json().catch(() => ({}))) as {
      deleted?: number;
      error?: string;
    };
    if (!res.ok) {
      setMessage(out.error ?? "Purge failed.");
      return;
    }
    setMessage(`Purged ${out.deleted ?? 0} old entries.`);
    load();
  };

  return (
    <main>
      <h1 className="text-xl font-bold text-slate-900">Audit log</h1>
      {message && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {message}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="Filter by actor"
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Filter by action"
          className="rounded border px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={load}
          className="rounded bg-violet-600 px-3 py-1 text-sm text-white"
        >
          Filter
        </button>
        <a
          href="/api/admin/audit/export?format=csv"
          className="rounded bg-slate-200 px-3 py-1 text-sm text-slate-800"
        >
          Export CSV
        </a>
        <a
          href="/api/admin/audit/export?format=json"
          className="rounded bg-slate-200 px-3 py-1 text-sm text-slate-800"
        >
          Export JSON
        </a>
        <button
          type="button"
          onClick={purge}
          className="rounded bg-red-600 px-3 py-1 text-sm text-white"
        >
          Purge old entries
        </button>
      </div>
      <ul className="mt-4 space-y-2">
        {entries.map((e) => (
          <li key={e.id} className="rounded border p-3 text-sm">
            <span className="font-semibold">{e.action}</span> · actor{" "}
            {e.actor}
            {e.target ? ` · target ${e.target}` : ""} ·{" "}
            {new Date(e.created_at).toLocaleString()}
            {e.metadata ? (
              <pre className="mt-1 overflow-auto text-xs text-slate-600">
                {JSON.stringify(e.metadata)}
              </pre>
            ) : null}
          </li>
        ))}
        {entries.length === 0 && (
          <li className="text-sm text-slate-600">No audit entries yet.</li>
        )}
      </ul>
    </main>
  );
}
