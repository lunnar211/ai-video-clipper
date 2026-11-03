"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type PlatformInfo = {
  id: string;
  label: string;
  status: "disabled" | "pending_approval" | "live";
  scopes: string[];
};

type AccountInfo = {
  id: string;
  platform: string;
  account_label: string;
  scopes: string[];
  token_expires_at: string | null;
  status: string;
};

/**
 * Connected social accounts (ClipForge Phase 3).
 *
 * Per-platform cards show the feature-flag status honestly: disabled,
 * pending platform approval, or live. Connect navigates to the
 * provider's OAuth page; disconnect revokes at the provider first.
 * Only status-only account fields are ever displayed — tokens are
 * never in API responses and never rendered here.
 */
export default function Accounts() {
  return (
    <Suspense>
      <AccountsInner />
    </Suspense>
  );
}

function AccountsInner() {
  const searchParams = useSearchParams();
  const connectedParam = searchParams.get("connected");
  const errorParam = searchParams.get("error");
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch("/api/accounts")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          accounts?: AccountInfo[];
          platforms?: PlatformInfo[];
          error?: string;
        };
        if (res.status === 503) {
          setNotice(
            "Accounts need database setup on the server. Nothing is connected yet.",
          );
          return;
        }
        if (!res.ok) {
          setNotice(data.error ?? "Accounts could not be loaded.");
          return;
        }
        setPlatforms(data.platforms ?? []);
        setAccounts(data.accounts ?? []);
      })
      .catch(() => {
        setNotice("Accounts could not be loaded (network error).");
      });
  };

  useEffect(() => {
    load();
  }, []);

  const connect = async (platform: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/accounts/${platform}/connect`);
      const data = (await res.json().catch(() => ({}))) as {
        authUrl?: string | null;
        reason?: string;
        error?: string;
      };
      if (!res.ok) {
        setNotice(data.error ?? "Connect failed.");
        return;
      }
      if (!data.authUrl) {
        setNotice(
          data.reason ?? "This platform is not available to connect yet.",
        );
        return;
      }
      window.location.assign(data.authUrl);
    } catch {
      setNotice("Connect failed (network error).");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/accounts/${id}/disconnect`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        revoked?: boolean;
      };
      if (!res.ok) {
        setNotice(data.error ?? "Disconnect failed.");
        return;
      }
      setNotice(
        data.revoked
          ? "Disconnected and revoked at the provider."
          : "Disconnected (the provider has no revoke endpoint, so the stored token was deleted).",
      );
      load();
    } catch {
      setNotice("Disconnect failed (network error).");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/accounts/${id}/refresh`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setNotice(data.error ?? "Refresh failed.");
        return;
      }
      setNotice("Tokens refreshed.");
      load();
    } catch {
      setNotice("Refresh failed (network error).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">Connected accounts</h1>
      <p className="mt-2 text-muted-foreground">
        Connect the social accounts you own. Each platform stays off
        until its feature flag is on and its app review is approved —
        the status below says exactly where each one stands. Tokens
        are encrypted on the server and never shown here.
      </p>
      {notice && (
        <p className="mt-4 rounded bg-muted p-3 text-sm">{notice}</p>
      )}
      {connectedParam && (
        <p className="mt-4 rounded bg-muted p-3 text-sm">
          Connected to {connectedParam}.
        </p>
      )}
      {errorParam && (
        <p className="mt-4 rounded bg-muted p-3 text-sm">
          Connection failed: {errorParam}.
        </p>
      )}
      <section className="mt-6 grid gap-4">
        {platforms.map((platform) => (
          <article key={platform.id} className="rounded border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{platform.label}</h2>
              <span className="rounded bg-muted px-2 py-1 text-xs">
                {platform.status === "live"
                  ? "Live"
                  : platform.status === "pending_approval"
                    ? "Pending platform approval"
                    : "Disabled"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Scopes requested: {platform.scopes.join(", ")}
            </p>
            <button
              className="mt-3 rounded bg-primary px-4 py-2 text-on-primary disabled:opacity-50"
              disabled={busy || platform.status === "disabled"}
              onClick={() => connect(platform.id)}
            >
              {platform.status === "disabled"
                ? "Not enabled"
                : "Connect"}
            </button>
          </article>
        ))}
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Your accounts</h2>
        {accounts.length === 0 ? (
          <p className="mt-2 text-muted-foreground">
            No accounts connected yet.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {accounts.map((account) => (
              <li key={account.id} className="rounded border border-border p-4">
                <p className="font-medium">{account.account_label}</p>
                <p className="text-sm text-muted-foreground">
                  {account.platform} · {account.status}
                  {account.token_expires_at
                    ? ` · token expires ${new Date(account.token_expires_at).toLocaleString()}`
                    : ""}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded border border-border px-3 py-1 text-sm disabled:opacity-50"
                    disabled={busy}
                    onClick={() => refresh(account.id)}
                  >
                    Refresh tokens
                  </button>
                  <button
                    className="rounded border border-border px-3 py-1 text-sm disabled:opacity-50"
                    disabled={busy}
                    onClick={() => disconnect(account.id)}
                  >
                    Disconnect
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
