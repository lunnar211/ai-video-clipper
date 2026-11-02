import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES, CONSOLE_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import {
  INTEGRATION_REGISTRY,
  findIntegrationDefinition,
  integrationStatus,
} from "@/lib/integrations/registry";
import {
  listIntegrationInstances,
  resolveIntegrationDb,
  upsertIntegrationInstance,
} from "@/lib/integrations/store";
import {
  makeDomainEvent,
  publishIntegrationEventSafe,
} from "@/lib/integrations/events";

const toggleSchema = z.object({
  integrationId: z.string().min(1),
  enabled: z.boolean(),
  configPublic: z.record(z.string(), z.unknown()).optional(),
});

/**
 * GET /api/admin/integrations — registry + instance statuses.
 * Console roles. Without a database, instances are empty so every
 * entry honestly reports not_configured / interface_only.
 */
export async function GET(req: Request) {
  const { session, errorResponse } = await adminGate(req, CONSOLE_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveIntegrationDb();
  const instances = db
    ? await listIntegrationInstances(db, null).catch(() => [])
    : [];
  const integrations = INTEGRATION_REGISTRY.map((definition) => {
    const instance = instances.find(
      (i) => i.integration_id === definition.id,
    );
    return {
      ...definition,
      status: integrationStatus(
        definition,
        instance
          ? { integrationId: instance.integration_id, enabled: instance.enabled }
          : null,
      ),
      enabled: instance?.enabled ?? false,
      configPublic: instance?.config_public ?? {},
    };
  });
  void session;
  return NextResponse.json({ integrations });
}

/**
 * POST /api/admin/integrations — enable/disable one integration for
 * the calling admin's account. Interface-only entries refuse enabling.
 * Owner/admin only. 503 without a database.
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
  const parsed = toggleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide integrationId and enabled." },
      { status: 400 },
    );
  }
  const definition = findIntegrationDefinition(parsed.data.integrationId);
  if (!definition) {
    return NextResponse.json(
      { error: "Unknown integration." },
      { status: 404 },
    );
  }
  if (parsed.data.enabled && definition.interfaceOnly) {
    return NextResponse.json(
      {
        error:
          "This integration has no adapter yet and cannot be enabled. See docs/PHASE5.md.",
      },
      { status: 400 },
    );
  }
  try {
    const row = await upsertIntegrationInstance(db, {
      user_id: session.userId,
      integration_id: definition.id,
      enabled: parsed.data.enabled,
      config_public: parsed.data.configPublic ?? {},
      // No secret config fields exist for the built-ins; secret-bearing
      // integrations must encrypt here before storing (see docs).
      config_enc: null,
      key_id: null,
    });
    const action = parsed.data.enabled
      ? "integration.enabled"
      : "integration.disabled";
    scheduleAudit({
      actor: session.userId,
      action,
      target: row.id,
      metadata: { integrationId: definition.id },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    publishIntegrationEventSafe(
      makeDomainEvent(
        parsed.data.enabled ? "integration.enabled" : "integration.disabled",
        { targetId: row.id, actor: session.userId, payload: { integrationId: definition.id } },
      ),
    );
    return NextResponse.json({
      integration: {
        ...definition,
        enabled: row.enabled,
        configPublic: row.config_public,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Integration update failed." },
      { status: 500 },
    );
  }
}
