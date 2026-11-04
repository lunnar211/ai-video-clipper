"use client";

import { useEffect, useState } from "react";

type Integration = {
  id: string;
  name: string;
  description: string;
  status: string;
  enabled: boolean;
};

/**
 * Integrations page (ClipForge Phase 5). Lists the registry with
 * honest statuses: an integration is never shown as connected
 * without credentials, and interface-only entries cannot be enabled.
 */
export default function AdminIntegrations() {
  const [items, setItems] = useState<Integration[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/integrations")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.error ?? "Integrations could not be loaded.");
          return;
        }
        setItems(data.integrations ?? []);
      })
      .catch(() => setMessage("Integrations could not be loaded."));
  };

  useEffect(load, []);

  const toggle = (id: string, enabled: boolean) => {
    fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ integrationId: id, enabled }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.error ?? "Integration update failed.");
          return;
        }
        load();
      })
      .catch(() => setMessage("Integration update failed."));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Integrations</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pluggable integrations. Nothing here claims a live connection
        without credentials — see docs/PHASE5.md for what each entry
        needs. Named third-party integrations beyond this list wait on
        the backends list from the owner.
      </p>
      {message && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {message}
        </p>
      )}
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded border border-border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-foreground">{item.name}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
                <p className="mt-1 text-sm">
                  Status:{" "}
                  <span className="font-mono text-xs">{item.status}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={item.status === "interface_only"}
                onClick={() => toggle(item.id, !item.enabled)}
                className="inline-flex min-h-[44px] items-center rounded bg-primary px-3 py-1 text-sm text-on-primary disabled:opacity-40"
              >
                {item.status === "interface_only"
                  ? "No adapter yet"
                  : item.enabled
                    ? "Disable"
                    : "Enable"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
