import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import { replayDelivery } from "@/lib/integrations/dispatch";
import {
  getWebhookDeliveryById,
  resolveIntegrationDb,
} from "@/lib/integrations/store";

/**
 * POST /api/admin/webhooks/deliveries/[deliveryId]/replay — re-attempt
 * one failed delivery immediately and update its row. Only failed
 * deliveries replay; delivered ones return 400. Owner/admin only.
 * 503 without a database.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ deliveryId: string }> },
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
  const { deliveryId } = await params;
  try {
    const delivery = await getWebhookDeliveryById(db, deliveryId);
    if (!delivery) {
      return NextResponse.json(
        { error: "Delivery not found." },
        { status: 404 },
      );
    }
    if (delivery.status === "delivered") {
      return NextResponse.json(
        { error: "Only failed deliveries can be replayed." },
        { status: 400 },
      );
    }
    const result = await replayDelivery(db, delivery);
    if (!result) {
      return NextResponse.json(
        { error: "Replay failed: endpoint or signing key unavailable." },
        { status: 500 },
      );
    }
    scheduleAudit({
      actor: session.userId,
      action: "integration.webhook_replay",
      target: deliveryId,
      metadata: { status: result.status },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ replayed: true, status: result.status });
  } catch {
    return NextResponse.json(
      { error: "Replay failed." },
      { status: 500 },
    );
  }
}
