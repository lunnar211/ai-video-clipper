import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES, CONSOLE_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { createEnvTokenCrypto } from "@/lib/publish/tokens";
import {
  WEBHOOK_EVENTS,
} from "@/lib/integrations/webhooks";
import type { DomainEventName } from "@/lib/integrations/events";
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  resolveIntegrationDb,
  toWebhookEndpointPublic,
} from "@/lib/integrations/store";
import {
  makeDomainEvent,
  publishIntegrationEventSafe,
} from "@/lib/integrations/events";

const createSchema = z.object({
  url: z.string().url("Endpoint URL must be a valid URL."),
  events: z
    .array(z.string())
    .min(1, "Subscribe to at least one event.")
    .refine(
      (events) =>
        events.every((e) => (WEBHOOK_EVENTS as string[]).includes(e)),
      "Unknown event name.",
    ),
});

/**
 * GET /api/admin/webhooks — list endpoints (public shapes only: the
 * signing secret is never returned). Console roles.
 */
export async function GET(req: Request) {
  const { errorResponse } = await adminGate(req, CONSOLE_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveIntegrationDb();
  if (!db) {
    return NextResponse.json(
      { error: "The integrations database is not configured yet." },
      { status: 503 },
    );
  }
  try {
    const endpoints = await listWebhookEndpoints(db, null);
    return NextResponse.json({ endpoints });
  } catch {
    return NextResponse.json(
      { error: "Webhook list failed." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/webhooks — create an endpoint. The signing secret
 * is generated server-side, stored ENCRYPTED, and returned ONCE in
 * this response — it is never returned again. HTTPS only. Owner/admin
 * only. 503 without a database or without the token key.
 */
export async function POST(req: Request) {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const { session, errorResponse } = await adminGate(req, ACTION_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveIntegrationDb();
  if (!db) {
    return NextResponse.json(
      { error: "The integrations database is not configured yet." },
      { status: 503 },
    );
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a valid HTTPS URL and at least one known event." },
      { status: 400 },
    );
  }
  const url = new URL(parsed.data.url);
  if (url.protocol !== "https:") {
    return NextResponse.json(
      { error: "Webhook endpoints must use HTTPS." },
      { status: 400 },
    );
  }
  const crypto = createEnvTokenCrypto();
  if (!crypto) {
    return NextResponse.json(
      {
        error:
          "Signing requires PUBLISH_TOKEN_KEY in the server environment.",
      },
      { status: 503 },
    );
  }
  try {
    const signingSecret = randomBytes(32).toString("hex");
    const row = await createWebhookEndpoint(db, {
      user_id: session.userId,
      url: parsed.data.url,
      events: parsed.data.events as DomainEventName[],
      secret_enc: crypto.encrypt(signingSecret),
      key_id: crypto.keyId,
      active: true,
    });
    scheduleAudit({
      actor: session.userId,
      action: "integration.webhook_created",
      target: row.id,
      metadata: { url: parsed.data.url, events: parsed.data.events },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    publishIntegrationEventSafe(
      makeDomainEvent("integration.webhook_created", {
        targetId: row.id,
        actor: session.userId,
        payload: { url: parsed.data.url },
      }),
    );
    return NextResponse.json(
      { endpoint: toWebhookEndpointPublic(row), signingSecret },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "Webhook creation failed." },
      { status: 500 },
    );
  }
}
