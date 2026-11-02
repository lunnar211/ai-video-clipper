import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES, CONSOLE_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import {
  deleteWebhookEndpoint,
  getWebhookEndpoint,
  resolveIntegrationDb,
  toWebhookEndpointPublic,
} from "@/lib/integrations/store";

/**
 * GET /api/admin/webhooks/[id] — one endpoint (public shape only).
 * DELETE /api/admin/webhooks/[id] — remove an endpoint (owner/admin).
 * Both 404 for unknown ids, 503 without a database.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await adminGate(req, CONSOLE_ROLES);
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
    const row = await getWebhookEndpoint(db, id);
    if (!row) {
      return NextResponse.json(
        { error: "Webhook endpoint not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ endpoint: toWebhookEndpointPublic(row) });
  } catch {
    return NextResponse.json(
      { error: "Webhook lookup failed." },
      { status: 500 },
    );
  }
}

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
    const row = await getWebhookEndpoint(db, id);
    if (!row) {
      return NextResponse.json(
        { error: "Webhook endpoint not found." },
        { status: 404 },
      );
    }
    await deleteWebhookEndpoint(db, id);
    scheduleAudit({
      actor: session.userId,
      action: "integration.webhook_deleted",
      target: id,
      metadata: { url: row.url },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json(
      { error: "Webhook deletion failed." },
      { status: 500 },
    );
  }
}
