"use client";

import { useEffect, useState } from "react";

type Sso = {
  configured: boolean;
  provider: string | null;
  enabled: boolean;
  state: string;
  setupSteps: string[];
};

/**
 * SSO page (ClipForge Phase 5). Shows the honest setup state and
 * saves an OIDC or SAML config. Secrets are stored encrypted and
 * never shown back. Until an IdP is configured there is NO SSO
 * login path — this page only stores configuration; the test login
 * with the IdP is an owner tap.
 */
export default function AdminSso() {
  const [sso, setSso] = useState<Sso | null>(null);
  const [provider, setProvider] = useState("oidc");
  const [issuer, setIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [entityId, setEntityId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");
  const [certificate, setCertificate] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/sso")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.error ?? "SSO status could not be loaded.");
          return;
        }
        setSso(data.sso);
      })
      .catch(() => setMessage("SSO status could not be loaded."));
  };

  useEffect(load, []);

  const save = () => {
    const body =
      provider === "oidc"
        ? {
            provider,
            config: { issuer, clientId, clientSecret },
          }
        : {
            provider,
            config: { entityId, ssoUrl, certificate },
          };
    fetch("/api/admin/sso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.error ?? "SSO save failed.");
          return;
        }
        setSso(data.sso);
        setMessage("SSO config saved (login itself is still an owner tap — see docs).");
      })
      .catch(() => setMessage("SSO save failed."));
  };

  return (
    <main>
      <h1 className="text-xl font-bold text-foreground">Admin SSO</h1>
      {message && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {message}
        </p>
      )}
      {sso && (
        <>
          <p className="mt-2 text-sm">
            State: <span className="font-mono text-xs">{sso.state}</span>
            {sso.provider ? ` · provider: ${sso.provider}` : ""}
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
            {sso.setupSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 rounded border border-border p-4">
        <label className="block text-sm font-semibold" htmlFor="sso-provider">
          Provider
        </label>
        <select
          id="sso-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="mt-1 rounded border border-border px-2 py-1 text-sm"
        >
          <option value="oidc">OIDC</option>
          <option value="saml">SAML</option>
        </select>
        {provider === "oidc" ? (
          <div className="mt-3 space-y-2">
            <input
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder="Issuer URL"
              className="w-full rounded border border-border px-2 py-1 text-sm"
            />
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Client ID"
              className="w-full rounded border border-border px-2 py-1 text-sm"
            />
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Client secret (stored encrypted)"
              className="w-full rounded border border-border px-2 py-1 text-sm"
            />
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <input
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="Entity ID"
              className="w-full rounded border border-border px-2 py-1 text-sm"
            />
            <input
              value={ssoUrl}
              onChange={(e) => setSsoUrl(e.target.value)}
              placeholder="SSO URL"
              className="w-full rounded border border-border px-2 py-1 text-sm"
            />
            <textarea
              value={certificate}
              onChange={(e) => setCertificate(e.target.value)}
              placeholder="IdP certificate (stored encrypted)"
              className="w-full rounded border border-border px-2 py-1 text-sm"
            />
          </div>
        )}
        <button
          type="button"
          onClick={save}
          className="mt-3 rounded bg-primary px-3 py-1 text-sm text-on-primary"
        >
          Save SSO config
        </button>
      </div>
    </main>
  );
}
