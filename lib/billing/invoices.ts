/**
 * Invoices (ClipForge Phase 6).
 *
 * An invoice is a stored record built from a billing event
 * (subscription charge, credit purchase, renewal). Line items carry
 * integer minor-unit amounts; the total is their sum, never a float.
 * PDF generation is a LATER slice if the library proves heavy: the
 * invoice page renders a clean printable HTML record today, labeled
 * honestly as such in docs/PHASE6.md.
 */

import { randomBytes } from "node:crypto";
import type { InvoiceLineItem } from "./store";

/** INV-YYYYMMDD-<8 random hex chars, uppercased>. */
export function invoiceNumber(date: Date, suffix: string): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `INV-${y}${m}${d}-${suffix.toUpperCase()}`;
}

/** Fresh invoice number for a new row (random suffix, unique). */
export function newInvoiceNumber(date = new Date()): string {
  return invoiceNumber(date, randomBytes(4).toString("hex"));
}

/** Integer-only total: sum of quantity × amount per line. */
export function invoiceTotal(items: InvoiceLineItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.quantity * item.amount_minor,
    0,
  );
}

export function buildInvoiceInput(input: {
  userId: string;
  subscriptionId: string | null;
  currency: string;
  items: InvoiceLineItem[];
  provider: string;
  providerTransactionId: string | null;
}): {
  user_id: string;
  subscription_id: string | null;
  number: string;
  status: string;
  currency: string;
  total_minor: number;
  line_items: InvoiceLineItem[];
  provider: string;
  provider_transaction_id: string | null;
} {
  return {
    user_id: input.userId,
    subscription_id: input.subscriptionId,
    number: newInvoiceNumber(),
    status: "paid",
    currency: input.currency,
    total_minor: invoiceTotal(input.items),
    line_items: input.items,
    provider: input.provider,
    provider_transaction_id: input.providerTransactionId,
  };
}
