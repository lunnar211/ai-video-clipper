import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES, CONSOLE_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { createEnvTokenCrypto } from "@/lib/publish/tokens";
import {
  ssoConfigSchema,
  ssoStatusFromRow,
} from "@/lib/integrations/sso";
import {
  getSsoConfig,
  resolveIntegrationDb,
  upsertSsoConfig,
} from "@/lib/integrations/store";
import {
  makeDomainEvent,
  publishIntegrationEventSafe,
} from "@/lib/integrations/events";

/**
 * GET /api/admin/sso — the calling admin's SSO status (never
 * includes secrets or certificates). Until a config is saved the
 * state is honestly "setup_needed" — there is no fake SSO login.
 * POST — save an OIDC or SAML config. Secret fields (client secret,
 * certificate) are stored ENCRYPTED and never returned. Owner/admin
 * only. 503 without a database or without the token key.
 */
export async function GET(req: Request) {
  const { session, errorResponse } = await adminGate(req, CONSOLE_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveIntegrationDb();
  if (!db) {
    return NextResponse.json({
      sso: ssoStatusFromRow(null),
      databaseConfigured: false,
    });
  }
  try {
    const row = await getSsoConfig(db, session.userId);
    return NextResponse.json({
      sso: ssoStatusFromRow(
        row ? { provider: row.provider, enabled: row.enabled } : null,
      ),
      databaseConfigured: true,
    });
  } catch {
    return NextResponse.json(
      { error: "SSO status failed." },
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
  const parsed = ssoConfigSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid SSO configuration." },
      { status: 400 },
    );
  }
  const crypto = createEnvTokenCrypto();
  if (!crypto) {
    return NextResponse.json(
      {
        error:
          "SSO secrets require PUBLISH_TOKEN_KEY in the server environment.",
      },
      { status: 503 },
    );
  }
  try {
    const input = parsed.data;
    const secretValue =
      input.provider === "oidc"
        ? input.config.clientSecret
        : input.config.certificate;
    const publicConfig =
      input.provider === "oidc"
        ? {
            issuer: input.config.issuer,
            clientId: input.config.clientId,
            scopes: input.config.scopes,
          }
        : {
            entityId: input.config.entityId,
            ssoUrl: input.config.ssoUrl,
          };
    const row = await upsertSsoConfig(db, {
      user_id: session.userId,
      provider: input.provider,
      config_public: publicConfig,
      secret_enc: crypto.encrypt(secretValue),
      key_id: crypto.keyId,
      enabled: false,
    });
    scheduleAudit({
      actor: session.userId,
      action: "integration.sso_saved",
      target: row.id,
      metadata: { provider: input.provider },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    publishIntegrationEventSafe(
      makeDomainEvent("integration.sso_saved", {
        targetId: row.id,
        actor: session.userId,
        payload: { provider: input.provider },
      }),
    );
    return NextResponse.json({
      sso: ssoStatusFromRow({ provider: row.provider, enabled: row.enabled }),
    });
  } catch {
    return NextResponse.json(
      { error: "SSO save failed." },
      { status: 500 },
    );
  }
}
