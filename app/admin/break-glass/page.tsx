"use client";

import { useState } from "react";

/**
 * Break-glass access (ClipForge Phase 4). Admins never see video
 * content, transcripts, or tokens by default. This page requests a
 * time-boxed (15 minute), single-use grant for ONE project or clip,
 * then fetches that item's safe metadata only (id/title/dates —
 * never media keys, transcripts, or content). Both the grant and the
 * fetch are audited with the reason.
 */
export default function AdminBreakGlass() {
  const [itemType, setItemType] = useState("project");
  const [itemId, setItemId] = useState("");
  const [reason, setReason] = useState("");
  const [grantId, setGrantId] = useState("");
  const [fetchId, setFetchId] = useState("");
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestGrant = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/break-glass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType, itemId, reason }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      grantId?: string;
      expiresAt?: string;
      error?: string;
    };
    if (!res.ok) {
      setMessage(body.error ?? "Grant request failed.");
    } else {
      setGrantId(body.grantId ?? "");
      setFetchId(body.grantId ?? "");
      setMessage(
        `Grant created, expires ${body.expiresAt}. Fetch it once below — a second fetch returns 410.`,
      );
    }
    setBusy(false);
  };

  const fetchItem = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/admin/break-glass/${fetchId}`);
    const body = (await res.json().catch(() => ({}))) as {
      item?: Record<string, unknown>;
      error?: string;
    };
    if (!res.ok) {
      setMessage(body.error ?? "Fetch failed.");
      setItem(null);
    } else {
      setItem(body.item ?? null);
      setMessage("Grant consumed. Only safe metadata is shown — never content.");
    }
    setBusy(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Break-glass access</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Admins never see video content, transcripts, or tokens by
        default. Break-glass is the only exception: one item, one
        reason, 15 minutes, single use, fully audited.
      </p>
      {message && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {message}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={itemType}
          onChange={(e) => setItemType(e.target.value)}
          className="rounded border border-border px-2 py-1 text-sm"
        >
          <option value="project">Project</option>
          <option value="clip">Clip</option>
        </select>
        <input
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          placeholder="Item id"
          className="flex-1 rounded border border-border px-2 py-1 text-sm"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (at least 10 characters)"
          className="flex-1 rounded border border-border px-2 py-1 text-sm"
        />
        <button
          type="button"
          disabled={busy || !itemId.trim() || reason.trim().length < 10}
          onClick={requestGrant}
          className="inline-flex min-h-[44px] items-center rounded bg-primary px-3 py-1 text-sm text-on-primary disabled:opacity-50"
        >
          Request grant
        </button>
      </div>
      {grantId && (
        <div className="mt-4 flex gap-2">
          <input
            value={fetchId}
            onChange={(e) => setFetchId(e.target.value)}
            placeholder="Grant id"
            className="flex-1 rounded border border-border px-2 py-1 text-sm"
          />
          <button
            type="button"
            disabled={busy || !fetchId.trim()}
            onClick={fetchItem}
            className="inline-flex min-h-[44px] items-center rounded bg-amber-600 px-3 py-1 text-sm text-black disabled:opacity-50"
          >
            Fetch item (consumes grant)
          </button>
        </div>
      )}
      {item && (
        <pre className="mt-4 overflow-auto rounded border border-border p-4 text-sm">
          {JSON.stringify(item, null, 2)}
        </pre>
      )}
    </div>
  );
}
