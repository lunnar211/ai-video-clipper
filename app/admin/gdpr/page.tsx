"use client";

import { useState } from "react";

/**
 * GDPR page (ClipForge Phase 5). Admins execute export/delete for a
 * target user (end users without a console role request it through
 * support). Export downloads a JSON archive of safe columns only.
 * Delete requires typing the user id AND checking confirm — and the
 * response states plainly what is retained (audit rows, strike
 * records). There is no undo.
 */
export default function AdminGdpr() {
  const [userId, setUserId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const runExport = () => {
    fetch("/api/admin/gdpr/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setMessage(data.error ?? "Export failed.");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `clipforge-export-${userId}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setMessage("Export downloaded.");
      })
      .catch(() => setMessage("Export failed."));
  };

  const runDelete = () => {
    if (!confirm) {
      setMessage("Check the confirm box to delete.");
      return;
    }
    fetch("/api/admin/gdpr/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, confirm: true }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.error ?? "Deletion failed.");
          return;
        }
        setResult(JSON.stringify(data, null, 2));
        setMessage("Deletion complete — see retained items below.");
      })
      .catch(() => setMessage("Deletion failed."));
  };

  return (
    <main>
      <h1 className="text-xl font-bold text-foreground">GDPR export &amp; deletion</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Export downloads everything held about a user (safe columns
        only — never tokens, hashes, secrets, transcripts, or video).
        Deletion is permanent and cannot be undone. Audit rows and
        strike records are deliberately retained — see docs/PHASE5.md.
      </p>
      {message && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {message}
        </p>
      )}
      <div className="mt-4 rounded border border-border p-4">
        <label className="block text-sm font-semibold" htmlFor="gdpr-user">
          User ID
        </label>
        <input
          id="gdpr-user"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
        />
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={runExport}
            className="rounded bg-primary px-3 py-1 text-sm text-on-primary"
          >
            Export archive
          </button>
          <label className="text-sm">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />{" "}
            I understand deletion is permanent
          </label>
          <button
            type="button"
            onClick={runDelete}
            className="rounded bg-red-700 px-3 py-1 text-sm text-white"
          >
            Delete user data
          </button>
        </div>
      </div>
      {result && (
        <pre className="mt-4 overflow-auto rounded border border-border p-4 text-xs">
          {result}
        </pre>
      )}
    </main>
  );
}
