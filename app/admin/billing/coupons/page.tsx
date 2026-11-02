"use client";

import { useEffect, useState } from "react";

type Coupon = {
  id: string;
  code: string;
  kind: string;
  value: number;
  max_uses: number | null;
  uses_count: number;
  per_user_once: boolean;
  plan: string | null;
  expires_at: string | null;
  created_at: string;
};

/** Admin coupon list + creation (ClipForge Phase 6). */
export default function AdminBillingCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState("percent");
  const [value, setValue] = useState("20");

  const load = () => {
    fetch("/api/admin/billing/coupons")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          coupons?: Coupon[];
          error?: string;
        };
        if (!res.ok) {
          setMessage(data.error ?? "Coupons could not be loaded.");
          return;
        }
        setCoupons(data.coupons ?? []);
        setMessage(null);
      })
      .catch(() => setMessage("Coupons could not be loaded."));
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setMessage(null);
    const res = await fetch("/api/admin/billing/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        kind,
        value: Number(value),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!res.ok) {
      setMessage(data.error ?? "Coupon could not be created.");
      return;
    }
    setCode("");
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Coupons</h1>
      <p className="mt-2 text-sm text-gray-600">
        A coupon code must also exist in the MoR dashboard for the
        price cut to apply at checkout — the app validates the code,
        the MoR cuts the price. If the MoR has no such code, checkout
        with it fails honestly instead of charging full price.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CODE"
          className="border px-2 py-1"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="border px-2 py-1"
        >
          <option value="percent">percent</option>
          <option value="fixed">fixed (minor units)</option>
        </select>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="20"
          className="border px-2 py-1"
        />
        <button onClick={create} className="border px-3 py-1">
          Create
        </button>
      </div>
      {message && <p className="mt-4 text-sm text-red-700">{message}</p>}
      <ul className="mt-4 space-y-3 text-sm">
        {coupons.map((coupon) => (
          <li key={coupon.id} className="border p-3">
            <p>
              <span className="font-semibold">{coupon.code}</span> —{" "}
              {coupon.kind} {coupon.value}
              {coupon.plan ? ` · plan ${coupon.plan}` : ""}
            </p>
            <p className="text-gray-600">
              Used {coupon.uses_count}
              {coupon.max_uses !== null ? ` / ${coupon.max_uses}` : ""} ·
              per-user-once {coupon.per_user_once ? "yes" : "no"}
              {coupon.expires_at ? ` · expires ${coupon.expires_at}` : ""}
            </p>
          </li>
        ))}
        {coupons.length === 0 && !message && (
          <li className="text-gray-600">No coupons found.</li>
        )}
      </ul>
    </div>
  );
}
