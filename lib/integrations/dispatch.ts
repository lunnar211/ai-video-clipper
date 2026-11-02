/**
 * Webhook dispatch (ClipForge Phase 5).
 *
 * The bridge between the event bus and webhook endpoints: for one
 * domain event, load every ACTIVE endpoint subscribed to that event,
 * decrypt its signing secret, attempt delivery, and log the outcome
 * as a delivery row. Dispatch never throws and never blocks the
 * publisher: failures are recorded as failed deliveries (with the
 * next backoff time) for later replay, and endpoints whose secrets
 * cannot be decrypted (missing token key) are logged as failed with
 * a plain reason — the secret itself is never logged.
 *
 * Retry policy: a failed delivery stays "failed" with attempts + 1
 * and next_attempt_at set from nextBackoffMs(). Retries are driven
 * by replay (manual, admin-gated) in this slice; a scheduled sweeper
 * is a documented later-phase item.
 */

import type { FetchImpl } from "@/lib/ai/providers";
import { createEnvTokenCrypto } from "@/lib/publish/tokens";
import { attemptDelivery, nextBackoffMs } from "./webhooks";
import {
  publishIntegrationEventSafe,
  type DomainEvent,
} from "./events";
import {
  createWebhookDelivery,
  getWebhookEndpoint,
  listWebhookEndpoints,
  resolveIntegrationDb,
  updateWebhookDelivery,
  type IntegrationDb,
  type WebhookDeliveryRow,
} from "./store";

export type DispatchResult = {
  attempted: number;
  delivered: number;
  failed: number;
};

/** Dispatch one event to all subscribed active endpoints. Never throws. */
export async function dispatchEventToEndpoints(
  db: IntegrationDb,
  event: DomainEvent,
  fetchImpl: FetchImpl = fetch,
): Promise<DispatchResult> {
  const result: DispatchResult = { attempted: 0, delivered: 0, failed: 0 };
  try {
    const endpoints = (await listWebhookEndpoints(db, null, fetchImpl)).filter(
      (e) => e.active && e.events.includes(event.name),
    );
    // listWebhookEndpoints returns public shapes (no secret). Fetch
    // the full row per endpoint for the encrypted signing secret.
    for (const pub of endpoints) {
      result.attempted += 1;
      try {
        const full = await getWebhookEndpoint(db, pub.id, fetchImpl);
        if (!full) {
          result.failed += 1;
          continue;
        }
        const crypto = createEnvTokenCrypto();
        if (!crypto) {
          await createWebhookDelivery(
            db,
            {
              endpoint_id: pub.id,
              event: event.name,
              payload: { targetId: event.targetId },
              status: "failed",
              attempts: 1,
              next_attempt_at: new Date(
                Date.now() + nextBackoffMs(0),
              ).toISOString(),
              last_error: "Signing key is not configured.",
            },
            fetchImpl,
          );
          result.failed += 1;
          continue;
        }
        let secret: string;
        try {
          secret = crypto.decrypt(full.secret_enc);
        } catch {
          await createWebhookDelivery(
            db,
            {
              endpoint_id: pub.id,
              event: event.name,
              payload: { targetId: event.targetId },
              status: "failed",
              attempts: 1,
              next_attempt_at: null,
              last_error: "Signing secret could not be decrypted.",
            },
            fetchImpl,
          );
          result.failed += 1;
          continue;
        }
        const attempt = await attemptDelivery(
          full.url,
          secret,
          event.name,
          { targetId: event.targetId, ...event.payload },
          fetchImpl,
        );
        const delivery = await createWebhookDelivery(
          db,
          {
            endpoint_id: pub.id,
            event: event.name,
            payload: { targetId: event.targetId, ...event.payload },
            status: attempt.ok ? "delivered" : "failed",
            attempts: 1,
            next_attempt_at: attempt.ok
              ? null
              : new Date(Date.now() + nextBackoffMs(0)).toISOString(),
            last_error: attempt.error,
          },
          fetchImpl,
        );
        if (attempt.ok) result.delivered += 1;
        else result.failed += 1;
        void delivery;
      } catch {
        result.failed += 1;
      }
    }
  } catch {
    // Dispatch must never break the publisher.
  }
  return result;
}

/**
 * Replay one failed delivery: re-attempt immediately (admin-gated by
 * the route), then update the row with the new outcome. Returns the
 * updated status. Never throws for a missing delivery (null).
 */
export async function replayDelivery(
  db: IntegrationDb,
  delivery: WebhookDeliveryRow,
  fetchImpl: FetchImpl = fetch,
): Promise<{ status: "delivered" | "failed" } | null> {
  const endpoint = await getWebhookEndpoint(db, delivery.endpoint_id, fetchImpl);
  if (!endpoint) return null;
  const crypto = createEnvTokenCrypto();
  if (!crypto) return null;
  let secret: string;
  try {
    secret = crypto.decrypt(endpoint.secret_enc);
  } catch {
    return null;
  }
  const attempt = await attemptDelivery(
    endpoint.url,
    secret,
    delivery.event as DomainEvent["name"],
    delivery.payload,
    fetchImpl,
  );
  const attempts = delivery.attempts + 1;
  await updateWebhookDelivery(
    db,
    delivery.id,
    {
      status: attempt.ok ? "delivered" : "failed",
      attempts,
      next_attempt_at: attempt.ok
        ? null
        : new Date(Date.now() + nextBackoffMs(attempts)).toISOString(),
      last_error: attempt.error,
    },
    fetchImpl,
  );
  return { status: attempt.ok ? "delivered" : "failed" };
}

/**
 * The single bridge between domain events and webhook endpoints.
 * Publishes the event on the bus (for non-dispatching subscribers)
 * AND dispatches it to subscribed endpoints when a database is
 * configured. Never throws, never changes the caller's response.
 * The bus deliberately has NO dispatching subscriber — this function
 * is the only fan-out, so each event is delivered exactly once.
 */
export async function dispatchEventSafe(
  event: DomainEvent,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  try {
    publishIntegrationEventSafe(event);
    const db = resolveIntegrationDb();
    if (!db) return;
    await dispatchEventToEndpoints(db, event, fetchImpl);
  } catch {
    // Dispatch must never break the publisher.
  }
}
