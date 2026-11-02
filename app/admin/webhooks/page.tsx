"use client";

import { useEffect, useState } from "react";

const EVENTS = [
  "project.created",
  "clip.ready",
  "post.scheduled",
  "post.published",
  "post.failed",
  "strike.created",
  "billing.event",
];

type Endpoint = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
};

type Delivery = {
  id: string;
  event: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
};

/**
 * Webhooks page (ClipForge Phase 5). Create HTTPS endpoints with
 * per-event subscriptions, view delivery logs, and replay failed
 * deliveries. Signing secrets are shown ONCE at creation and never
 * again — copy them immediately.
 */
export default function AdminWebhooks() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["post.published"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/webhooks")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.error ?? "Webhooks could not be loaded.");
          return;
        }
        setEndpoints(data.endpoints ?? []);
      })
      .catch(() => setMessage("Webhooks could not be loaded."));
  };

  useEffect(load, []);

  const loadDeliveries = (id: string) => {
    setSelected(id);
    fetch(`/api/admin/webhooks/${id}/deliveries`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) setDeliveries(data.deliveries ?? []);
      })
      .catch(() => undefined);
  };

  const create = () => {
    fetch("/api/admin/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, events }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.error ?? "Webhook creation failed.");
          return;
        }
        setSecret(data.signingSecret);
        setMessage(
          "Endpoint created. Copy the signing secret now — it is never shown again.",
        );
        load();
      })
      .catch(() => setMessage("Webhook creation failed."));
  };

  const replay = (deliveryId: string) => {
    fetch(`/api/admin/webhooks/deliveries/${deliveryId}/replay`, {
      method: "POST",
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.error ?? "Replay failed.");
          return;
        }
        setMessage(`Replayed: ${data.status}.`);
        if (selected) loadDeliveries(selected);
      })
      .catch(() => setMessage("Replay failed."));
  };

  return (
    <main>
      <h1 className="text-xl font-bold text-slate-900">Webhooks</h1>
      <p className="mt-2 text-sm text-slate-600">
        HMAC-signed event payloads (X-ClipForge-Signature +
        X-ClipForge-Timestamp). Verification steps for receivers are in
        docs/PHASE5.md. Endpoints must use HTTPS.
      </p>
      {message && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {message}
        </p>
      )}
      {secret && (
        <p className="mt-4 rounded border border-red-300 bg-red-50 p-4 font-mono text-sm break-all">
          Signing secret (copy now): {secret}
        </p>
      )}
      <div className="mt-4 rounded border p-4">
        <label className="block text-sm font-semibold" htmlFor="wh-url">
          Endpoint URL
        </label>
        <input
          id="wh-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/clipforge-hook"
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
        />
        <p className="mt-3 text-sm font-semibold">Events</p>
        <div className="mt-1 flex flex-wrap gap-3">
          {EVENTS.map((event) => (
            <label key={event} className="text-sm">
              <input
                type="checkbox"
                checked={events.includes(event)}
                onChange={(e) =>
                  setEvents(
                    e.target.checked
                      ? [...events, event]
                      : events.filter((x) => x !== event),
                  )
                }
              />{" "}
              {event}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={create}
          className="mt-3 rounded bg-violet-700 px-3 py-1 text-sm text-white"
        >
          Create endpoint
        </button>
      </div>
      <ul className="mt-4 space-y-3">
        {endpoints.map((endpoint) => (
          <li key={endpoint.id} className="rounded border p-4">
            <p className="font-mono text-sm break-all">{endpoint.url}</p>
            <p className="text-sm text-slate-600">
              {endpoint.events.join(", ")} ·{" "}
              {endpoint.active ? "active" : "inactive"}
            </p>
            <button
              type="button"
              onClick={() => loadDeliveries(endpoint.id)}
              className="mt-2 text-sm text-violet-700 underline"
            >
              View deliveries
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="mt-4">
          <h2 className="font-bold">Deliveries</h2>
          <ul className="mt-2 space-y-2">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="rounded border p-3 text-sm">
                {delivery.event} · {delivery.status} · attempts{" "}
                {delivery.attempts}
                {delivery.last_error ? ` · ${delivery.last_error}` : ""}
                {delivery.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => replay(delivery.id)}
                    className="ml-3 text-violet-700 underline"
                  >
                    Replay
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
