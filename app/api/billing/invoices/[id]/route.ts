import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { fetchInvoiceForUser } from "@/app/api/billing/invoices/route";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET /api/billing/invoices/[id]?userId=… — one invoice record. */
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
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json(
      { error: "userId is required." },
      { status: 400 },
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
