import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { fetchInvoiceForUser } from "@/app/api/billing/invoices/route";
import { buildInvoicePdf } from "@/lib/billing/pdf";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/billing/invoices/[id]/pdf — the invoice as a real PDF
 * (ClipForge Phase 8). Session-bound like the JSON record: the
 * caller must own the invoice. The printable HTML record stays
 * available as a fallback; this route adds the file download.
 */
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
      { error: "Sign in to download this invoice." },
      { status: 401 },
    );
  }
  const result = await fetchInvoiceForUser(id, userId);
  if (result.error || !result.invoice) {
    return NextResponse.json(
      { error: result.error ?? "Invoice not found." },
      { status: "status" in result ? result.status : 404 },
    );
  }
  const pdf = buildInvoicePdf(result.invoice);
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.invoice.number}.pdf"`,
      "Content-Length": String(pdf.length),
    },
  });
}
