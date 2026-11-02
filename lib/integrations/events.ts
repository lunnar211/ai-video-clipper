/**
 * Domain event bus (ClipForge Phase 5).
 *
 * A typed, in-process publish/subscribe bus for domain events. Phase 5
 * adds this seam so integrations (webhooks, MCP, future brokers) can
 * react to what Phases 1–4 already do, without changing those flows:
 * publishers call publishIntegrationEventSafe(), which never throws
 * and never changes the caller's response.
 *
 * Adapter seam: the EventBus interface is the contract. The shipped
 * adapter is in-process (InMemoryEventBus). A later slice can swap in
 * an external broker (Redis, Inngest, SQS) by implementing the same
 * interface and calling setEventBus() once at startup — publishers
 * and subscribers never change.
 *
 * Event names reuse the Phase 4 audit vocabulary where one exists
 * (post.published, post.failed, strike.created, billing.event) plus
 * two Phase 5 names: project.created and clip.ready (a clip whose
 * render completed). Payloads are metadata only — never tokens,
 * transcripts, or video bytes.
 */

export const DOMAIN_EVENTS = [
  "project.created",
  "clip.ready",
  "post.scheduled",
  "post.published",
  "post.failed",
  "strike.created",
  "billing.event",
  "integration.enabled",
  "integration.disabled",
  "integration.webhook_created",
  "integration.webhook_replay",
  "integration.key_created",
  "integration.key_revoked",
  "integration.sso_saved",
  "gdpr.export",
  "gdpr.delete",
] as const;

export type DomainEventName = (typeof DOMAIN_EVENTS)[number];

export type DomainEvent = {
  name: DomainEventName;
  targetId: string | null;
  actor: string | null;
  /** Metadata only — callers must never put secrets or content here. */
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

export type EventBus = {
  subscribe(name: DomainEventName, handler: DomainEventHandler): () => void;
  publish(event: DomainEvent): Promise<void>;
  /** Test/observability helper: how many handlers listen to an event. */
  listenerCount(name: DomainEventName): number;
};

/** In-process bus: handlers run sequentially; one failing handler never blocks the rest. */
export class InMemoryEventBus implements EventBus {
  private handlers = new Map<DomainEventName, Set<DomainEventHandler>>();

  subscribe(name: DomainEventName, handler: DomainEventHandler): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  async publish(event: DomainEvent): Promise<void> {
    const set = this.handlers.get(event.name);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        await handler(event);
      } catch {
        // One failing subscriber must never break publishers or siblings.
      }
    }
  }

  listenerCount(name: DomainEventName): number {
    return this.handlers.get(name)?.size ?? 0;
  }
}

let currentBus: EventBus = new InMemoryEventBus();

/** Swap the bus implementation (startup only; tests reset via resetEventBus). */
export function setEventBus(bus: EventBus): void {
  currentBus = bus;
}

export function getEventBus(): EventBus {
  return currentBus;
}

/** Test helper: restore the default in-process bus. */
export function resetEventBus(): void {
  currentBus = new InMemoryEventBus();
}

/** Build a domain event with a fresh timestamp. */
export function makeDomainEvent(
  name: DomainEventName,
  opts: {
    targetId?: string | null;
    actor?: string | null;
    payload?: Record<string, unknown>;
  } = {},
): DomainEvent {
  return {
    name,
    targetId: opts.targetId ?? null,
    actor: opts.actor ?? null,
    payload: opts.payload ?? {},
    occurredAt: new Date().toISOString(),
  };
}

/**
 * Fire-and-forget publish for user flows. Never throws, never awaits
 * the caller, and silently does nothing when no subscriber exists.
 */
export function publishIntegrationEventSafe(event: DomainEvent): void {
  try {
    void currentBus.publish(event).catch(() => {
      // Publishing must never break a user flow.
    });
  } catch {
    // Never break the caller.
  }
}
