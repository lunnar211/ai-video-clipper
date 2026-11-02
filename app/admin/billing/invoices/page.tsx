"use client";

import { useEffect, useState } from "react";

type Invoice = {
  id: string;
  user_id: string;
  number: string;
  status: string;
  currency: string;
  total_minor: number;
  provider: string;
  created_at: string;
};

/** Admin invoice list (ClipForge Phase 6). Records only. */
export default function AdminBillingInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/billing/invoices")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          invoices?: Invoice[];
          error?: string;
        };
        if (!res.ok) {
          setMessage(data.error ?? "Invoices could not be loaded.");
          return;
        }
        setInvoices(data.invoices ?? []);
        setMessage(null);
      })
      .catch(() => setMessage("Invoices could not be loaded."));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Invoices</h1>
      {message && <p className="mt-4 text-sm text-red-700">{message}</p>}
      <ul className="mt-4 space-y-3 text-sm">
        {invoices.map((inv) => (
          <li key={inv.id} className="border p-3">
            <p>
              <span className="font-semibold">{inv.number}</span> —{" "}
              {inv.status} — {inv.total_minor} {inv.currency} (minor units)
            </p>
            <p className="text-gray-600">
              User {inv.user_id} · {inv.provider} ·{" "}
              {new Date(inv.created_at).toLocaleString()}
            </p>
          </li>
        ))}
        {invoices.length === 0 && !message && (
          <li className="text-gray-600">No invoices found.</li>
        )}
      </ul>
      <p className="mt-4 text-sm text-gray-600">
        PDF download is a later slice — today each invoice is a stored
        record with line items, viewable on the user billing page.
      </p>
    </div>
  );
}
