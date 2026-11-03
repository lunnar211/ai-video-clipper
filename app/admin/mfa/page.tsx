"use client";

import { useEffect, useState } from "react";

/**
 * Admin MFA setup (ClipForge Phase 4). Owner/admin accounts enrol
 * TOTP: setup returns the secret + authenticator URL ONCE — it is
 * shown here and never returned again — then the admin verifies a
 * live code to start a verified MFA session (12 hours). Without MFA
 * configured, admin pages honestly report that setup is needed.
 */
export default function AdminMfa() {
  const [status, setStatus] = useState<{
    enrolled: boolean;
    verified: boolean;
  } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch("/api/admin/mfa/status")
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          enrolled?: boolean;
          verified?: boolean;
          error?: string;
        };
        if (!res.ok) {
          setMessage(body.error ?? "MFA status could not be loaded.");
          return;
        }
        setStatus({
          enrolled: body.enrolled ?? false,
          verified: body.verified ?? false,
        });
      })
      .catch(() => setMessage("MFA status could not be loaded."));
  };

  useEffect(load, []);

  const setup = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/mfa/setup", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as {
      secret?: string;
      otpauthUrl?: string;
      error?: string;
    };
    if (!res.ok) {
      setMessage(body.error ?? "MFA setup failed.");
    } else {
      setSecret(body.secret ?? null);
      setOtpauthUrl(body.otpauthUrl ?? null);
      setMessage(
        "Scan this secret into your authenticator app now — it is shown only once.",
      );
    }
    setBusy(false);
    load();
  };

  const verify = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      verified?: boolean;
      error?: string;
    };
    if (!res.ok) {
      setMessage(body.error ?? "Verification failed.");
    } else {
      setMessage("MFA verified — your admin session is now verified for 12 hours.");
      setSecret(null);
      setOtpauthUrl(null);
    }
    setBusy(false);
    load();
  };

  return (
    <main>
      <h1 className="text-xl font-bold text-foreground">MFA setup</h1>
      {message && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {message}
        </p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        Enrolled: {status ? (status.enrolled ? "yes" : "no") : "…"} ·
        Verified: {status ? (status.verified ? "yes" : "no") : "…"}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={setup}
        className="mt-4 rounded bg-primary px-3 py-1 text-sm text-on-primary disabled:opacity-50"
      >
        {status?.enrolled ? "Re-enrol (replaces the old secret)" : "Enrol TOTP"}
      </button>
      {secret && (
        <div className="mt-4 rounded border border-border p-4">
          <p className="text-sm font-semibold">Your secret (shown once):</p>
          <p className="mt-1 break-all font-mono text-sm">{secret}</p>
          {otpauthUrl && (
            <p className="mt-2 break-all text-xs text-muted-foreground">
              Authenticator URL: {otpauthUrl}
            </p>
          )}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="6-digit code"
          inputMode="numeric"
          className="w-48 rounded border border-border px-2 py-1 text-sm"
        />
        <button
          type="button"
          disabled={busy || !/^\d{6}$/.test(code)}
          onClick={verify}
          className="rounded bg-primary px-3 py-1 text-sm text-on-primary disabled:opacity-50"
        >
          Verify code
        </button>
      </div>
    </main>
  );
}
