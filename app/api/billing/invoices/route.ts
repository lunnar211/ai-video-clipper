import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  getInvoice,
  listInvoicesByUser,
  resolveBillingDb,
} from "@/lib/billing/store";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/billing/invoices?userId=… — the caller's invoice records.
 * Records carry line items and integer minor-unit totals only —
 * never payment-instrument data.
 */
export async function GET(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json(
      { error: "userId is required." },
      { status: 400 },
    );
  }
  const db = resolveBillingDb();
  if (!db) {
    return NextResponse.json(
      { error: "Billing needs database setup." },
      { status: 503 },
    );
  }
  try {
    const invoices = await listInvoicesByUser(db, userId);
    return NextResponse.json({ invoices });
  } catch {
    return NextResponse.json(
      { error: "Invoice list failed." },
      { status: 500 },
    );
  }
}

/** Shared single-invoice fetch with an ownership check. */
export async function fetchInvoiceForUser(
  id: string,
  userId: string,
): Promise<
  | { invoice: Awaited<ReturnType<typeof getInvoice>>; error: null }
  | { invoice: null; error: string; status: number }
> {
  const db = resolveBillingDb();
  if (!db) {
    return { invoice: null, error: "Billing needs database setup.", status: 503 };
  }
  const invoice = await getInvoice(db, id).catch(() => null);
  if (!invoice) {
    return { invoice: null, error: "Invoice not found.", status: 404 };
  }
  if (invoice.user_id !== userId) {
    return { invoice: null, error: "Invoice not found.", status: 404 };
  }
  return { invoice, error: null };
}
