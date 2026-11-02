import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  getInvoice,
  listInvoicesByUser,
  resolveBillingDb,
} from "@/lib/billing/store";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/billing/invoices — the caller's invoice records,
 * session-bound since Phase 8 (the user id comes from the
 * Supabase session, never from a query parameter). Records carry
 * line items and integer minor-unit totals only — never
 * payment-instrument data.
 */
export async function GET(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to list your invoices." },
      { status: 401 },
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
