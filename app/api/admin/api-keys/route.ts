import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES, CONSOLE_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import {
  apiKeyPrefixFor,
  generateApiKeySecret,
  hashApiKeySecret,
  API_KEY_SCOPES,
} from "@/lib/integrations/apikeys";
import {
  createApiKeyRow,
  listApiKeys,
  resolveIntegrationDb,
  toApiKeyPublic,
} from "@/lib/integrations/store";
import {
  makeDomainEvent,
  publishIntegrationEventSafe,
} from "@/lib/integrations/events";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z
    .array(z.enum(API_KEY_SCOPES))
    .min(1, "Grant at least one scope."),
});

/**
 * GET /api/admin/api-keys — the calling admin's keys (public shapes
 * only: prefix, scopes, revocation, last-used — never the hash).
 * POST — create a key; the secret is returned ONCE here and never
 * again. Owner/admin only for creation; console roles may list.
 * 503 without a database.
 */
export async function GET(req: Request) {
  const { session, errorResponse } = await adminGate(req, CONSOLE_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveIntegrationDb();
  if (!db) {
    return NextResponse.json(
      { error: "The integrations database is not configured yet." },
      { status: 503 },
    );
  }
  try {
    const keys = await listApiKeys(db, session.userId);
    return NextResponse.json({ keys });
  } catch {
    return NextResponse.json(
      { error: "API key list failed." },
      { status: 500 },
    );
  }
}

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
      { error: "Provide a name and at least one valid scope." },
      { status: 400 },
    );
  }
  try {
    const secret = generateApiKeySecret();
    const row = await createApiKeyRow(db, {
      user_id: session.userId,
      name: parsed.data.name,
      key_prefix: apiKeyPrefixFor(secret),
      key_hash: hashApiKeySecret(secret),
      scopes: parsed.data.scopes,
    });
    scheduleAudit({
      actor: session.userId,
      action: "integration.key_created",
      target: row.id,
      metadata: { name: parsed.data.name, scopes: parsed.data.scopes },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    publishIntegrationEventSafe(
      makeDomainEvent("integration.key_created", {
        targetId: row.id,
        actor: session.userId,
        payload: { name: parsed.data.name },
      }),
    );
    return NextResponse.json(
      { key: toApiKeyPublic(row), secret },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "API key creation failed." },
      { status: 500 },
    );
  }
}
