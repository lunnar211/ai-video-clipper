/**
 * Outbound webhooks (ClipForge Phase 5).
 *
 * Signed payloads, per-event subscriptions, delivery retries with
 * exponential backoff, a delivery log, and manual replay. Signing
 * secrets are stored ENCRYPTED (Phase 3 envelope) and are never
 * returned to clients, never logged, and never echoed in delivery
 * rows — delivery rows carry the event + a sanitized payload only.
 *
 * Signature scheme (documented for receivers in docs/PHASE5.md):
 * - Header X-ClipForge-Timestamp: unix seconds when the payload was signed.
 * - Header X-ClipForge-Signature: "sha256=<hex HMAC-SHA256(secret, timestamp + '.' + rawBody)>".
 * - Receivers verify within the tolerance window (default 300s) and
 *   reject replays outside it.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { FetchImpl } from "@/lib/ai/providers";
import type { DomainEventName } from "./events";

export const WEBHOOK_EVENTS: DomainEventName[] = [
  "project.created",
  "clip.ready",
  "post.scheduled",
  "post.published",
  "post.failed",
  "strike.created",
  "billing.event",
];

export const SIGNATURE_HEADER = "X-ClipForge-Signature";
export const TIMESTAMP_HEADER = "X-ClipForge-Timestamp";

/** Signature tolerance in seconds (default 300). */
export function webhookSignatureToleranceSeconds(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number.parseInt(
    env.WEBHOOK_SIGNATURE_TOLERANCE_SECONDS ?? "",
    10,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : 300;
}

/** Sign a raw body: "sha256=<hex>". */
export function signWebhookPayload(
  secret: string,
  timestampSeconds: number,
  rawBody: string,
): string {
  const hmac = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
  return `sha256=${hmac}`;
}

/**
 * Verify a received signature. Returns false for malformed headers,
 * stale timestamps (outside the tolerance window), and mismatches.
 * Comparison is timing-safe.
 */
export function verifyWebhookSignature(
  secret: string,
  timestampSeconds: number,
  rawBody: string,
  signatureHeader: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = webhookSignatureToleranceSeconds(),
): boolean {
  if (!signatureHeader) return false;
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    return false;
  }
  const expected = signWebhookPayload(secret, timestampSeconds, rawBody);
  if (signatureHeader.length !== expected.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

/**
 * Backoff before delivery attempt N (0-based): 1s base, ×2 each
 * attempt, 60s cap, plus jitter. `random` is injectable so tests are
 * deterministic (pass () => 0 for zero jitter).
 */
export function nextBackoffMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const base = Math.min(60_000, 1000 * 2 ** Math.max(0, attempt));
  return base + Math.floor(random() * 250);
}

/** Keys that must never appear in a delivery-log payload, at any depth. */
const FORBIDDEN_PAYLOAD_KEYS = [
  "token",
  "secret",
  "password",
  "ciphertext",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "transcript",
  "video",
];

/** Recursively strip dangerous keys from a webhook payload. */
export function sanitizeWebhookPayload(
  value: unknown,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const lower = key.toLowerCase();
    if (
      FORBIDDEN_PAYLOAD_KEYS.some(
        (bad) => lower === bad || lower.includes(bad),
      )
    ) {
      continue;
    }
    if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
      out[key] = sanitizeWebhookPayload(entry);
    } else if (typeof entry === "string" && entry.length > 5000) {
      out[key] = entry.slice(0, 5000);
    } else {
      out[key] = entry;
    }
  }
  return out;
}

export type WebhookEndpointPublic = {
  id: string;
  url: string;
  events: DomainEventName[];
  active: boolean;
  created_at: string;
};

export type DeliveryAttempt = {
  ok: boolean;
  status: number | null;
  error: string | null;
};

/**
 * Attempt one delivery: POST the signed payload to the endpoint.
 * Any 2xx counts as delivered; anything else (including network
 * failure) counts as failed with the reason recorded. Never throws.
 */
export async function attemptDelivery(
  endpointUrl: string,
  signingSecret: string,
  event: DomainEventName,
  payload: Record<string, unknown>,
  fetchImpl: FetchImpl = fetch,
): Promise<DeliveryAttempt> {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    event,
    occurred_at: new Date(timestamp * 1000).toISOString(),
    data: sanitizeWebhookPayload(payload),
  });
  try {
    const res = await fetchImpl(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: signWebhookPayload(signingSecret, timestamp, body),
        "User-Agent": "ClipForge-Webhooks/1.0",
      },
      body,
    });
    if (res.ok) return { ok: true, status: res.status, error: null };
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : "Delivery failed.",
    };
  }
}
