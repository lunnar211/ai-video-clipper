import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { CONSOLE_ROLES } from "@/lib/admin/roles";
import {
  listWebhookDeliveries,
  resolveIntegrationDb,
} from "@/lib/integrations/store";

/**
 * GET /api/admin/webhooks/[id]/deliveries — delivery log for one
 * endpoint (payloads are sanitized at write time; no secrets ever
 * appear here). Console roles. 503 without a database.
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
    const deliveries = await listWebhookDeliveries(db, id);
    return NextResponse.json({ deliveries });
  } catch {
    return NextResponse.json(
      { error: "Delivery log failed." },
      { status: 500 },
    );
  }
}
