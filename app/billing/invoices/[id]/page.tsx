"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

type InvoiceLineItem = {
  description: string;
  quantity: number;
  amount_minor: number;
};

type Invoice = {
  id: string;
  number: string;
  status: string;
  currency: string;
  total_minor: number;
  line_items: InvoiceLineItem[];
  provider: string;
  created_at: string;
};

/**
 * Printable invoice record (ClipForge Phase 6). This is a clean
 * HTML record, not a generated PDF — PDF generation is a later
 * slice if the library proves heavy. Amounts are integer minor
 * units; no payment-instrument data is ever shown.
 */
function InvoiceInner() {
  const params = useParams();
  const search = useSearchParams();
  const id = String(params.id ?? "");
  const userId = search.get("userId") ?? "";
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !userId) return;
    fetch(
      `/api/billing/invoices/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`,
    )
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          invoice?: Invoice;
          error?: string;
        };
        if (!res.ok) {
          setMessage(data.error ?? "Invoice could not be loaded.");
          return;
        }
        setInvoice(data.invoice ?? null);
      })
      .catch(() => setMessage("Invoice could not be loaded."));
  }, [id, userId]);

  if (!id || !userId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-sm text-red-700 dark:text-red-300">
          An invoice id and userId are required.
        </p>
      </div>
    );
  }
  if (message) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      </div>
    );
  }
  if (!invoice) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-sm text-muted-foreground">Loading invoice…</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Invoice {invoice.number}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Status: {invoice.status} · Provider: {invoice.provider} ·{" "}
        {new Date(invoice.created_at).toLocaleString()}
      </p>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Item</th>
            <th className="py-2">Qty</th>
            <th className="py-2">Amount (minor units)</th>
          </tr>
        </thead>
        <tbody>
          {invoice.line_items.map((item, i) => (
            <tr key={i} className="border-b">
              <td className="py-2">{item.description}</td>
              <td className="py-2">{item.quantity}</td>
              <td className="py-2">
                {item.quantity * item.amount_minor} {invoice.currency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-sm font-semibold">
        Total: {invoice.total_minor} {invoice.currency} (minor units)
      </p>
      <button
        onClick={() => window.print()}
        className="mt-6 border border-border px-3 py-1 text-sm"
      >
        Print
      </button>
    </div>
  );
}

export default function InvoicePage() {
  return (
    <Suspense>
      <InvoiceInner />
    </Suspense>
  );
}
