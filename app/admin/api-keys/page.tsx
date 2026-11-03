"use client";

import { useEffect, useState } from "react";

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

/**
 * API keys page (ClipForge Phase 5). Create scoped keys for the v1
 * API and MCP; the secret is shown ONCE at creation and never again.
 * Revocation sets revoked_at — keys are never hard-deleted, so
 * revocation stays auditable.
 */
export default function AdminApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/api-keys")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.error ?? "API keys could not be loaded.");
          return;
        }
        setKeys(data.keys ?? []);
      })
      .catch(() => setMessage("API keys could not be loaded."));
  };

  useEffect(load, []);

  const create = () => {
    fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, scopes }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.error ?? "API key creation failed.");
          return;
        }
        setSecret(data.secret);
        setMessage(
          "Key created. Copy the secret now — it is never shown again.",
        );
        load();
      })
      .catch(() => setMessage("API key creation failed."));
  };

  const revoke = (id: string) => {
    fetch(`/api/admin/api-keys/${id}`, { method: "DELETE" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.error ?? "Revocation failed.");
          return;
        }
        load();
      })
      .catch(() => setMessage("Revocation failed."));
  };

  return (
    <main>
      <h1 className="text-xl font-bold text-foreground">API keys</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Keys for the public v1 API and MCP. Send the key as
        X-ClipForge-Key or Authorization: Bearer. Scopes: read (lists),
        write (MCP write tools, flag-gated), admin (implies both).
      </p>
      {message && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {message}
        </p>
      )}
      {secret && (
        <p className="mt-4 rounded border border-red-300 bg-red-50 p-4 font-mono text-sm break-all dark:border-red-800 dark:bg-red-950">
          Secret (copy now): {secret}
        </p>
      )}
      <div className="mt-4 rounded border border-border p-4">
        <label className="block text-sm font-semibold" htmlFor="key-name">
          Name
        </label>
        <input
          id="key-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="CI runner"
          className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
        />
        <p className="mt-3 text-sm font-semibold">Scopes</p>
        <div className="mt-1 flex gap-3">
          {["read", "write", "admin"].map((scope) => (
            <label key={scope} className="text-sm">
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={(e) =>
                  setScopes(
                    e.target.checked
                      ? [...scopes, scope]
                      : scopes.filter((x) => x !== scope),
                  )
                }
              />{" "}
              {scope}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={create}
          className="mt-3 rounded bg-primary px-3 py-1 text-sm text-on-primary"
        >
          Create key
        </button>
      </div>
      <ul className="mt-4 space-y-3">
        {keys.map((key) => (
          <li key={key.id} className="rounded border border-border p-4">
            <p className="font-semibold">{key.name}</p>
            <p className="font-mono text-sm">{key.key_prefix}…</p>
            <p className="text-sm text-muted-foreground">
              {key.scopes.join(", ")} ·{" "}
              {key.revoked_at ? "revoked" : "active"}
              {key.last_used_at ? ` · last used ${key.last_used_at}` : ""}
            </p>
            {!key.revoked_at && (
              <button
                type="button"
                onClick={() => revoke(key.id)}
                className="mt-2 text-sm text-red-700 underline dark:text-red-300"
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
