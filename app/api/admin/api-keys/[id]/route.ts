import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import {
  resolveIntegrationDb,
  revokeApiKeyRow,
} from "@/lib/integrations/store";
import {
  makeDomainEvent,
  publishIntegrationEventSafe,
} from "@/lib/integrations/events";

/**
 * DELETE /api/admin/api-keys/[id] — revoke a key (sets revoked_at;
 * keys are never hard-deleted, so revocation stays auditable).
 * Owner/admin only. 503 without a database.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { id } = await params;
  try {
    await revokeApiKeyRow(db, id);
    scheduleAudit({
      actor: session.userId,
      action: "integration.key_revoked",
      target: id,
      metadata: null,
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    publishIntegrationEventSafe(
      makeDomainEvent("integration.key_revoked", {
        targetId: id,
        actor: session.userId,
      }),
    );
    return NextResponse.json({ revoked: true });
  } catch {
    return NextResponse.json(
      { error: "API key revocation failed." },
      { status: 500 },
    );
  }
}
