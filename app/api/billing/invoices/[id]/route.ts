import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { fetchInvoiceForUser } from "@/app/api/billing/invoices/route";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET /api/billing/invoices/[id] — one invoice record, session-bound. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to see this invoice." },
      { status: 401 },
    );
  }
  const result = await fetchInvoiceForUser(id, userId);
  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({ invoice: result.invoice });
}
