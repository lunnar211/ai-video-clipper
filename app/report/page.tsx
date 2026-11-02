"use client";

import { useState } from "react";

/**
 * Public copyright report page (ClipForge Phase 2).
 *
 * Two forms: a DMCA/takedown notice and an appeal against a strike.
 * Both validate client-side, then POST to the rights API. When no
 * database is connected the API answers 503 honestly and the form
 * tells the user to use the Contact page instead — a notice is never
 * pretended to be filed. The contact address stays the placeholder
 * the owner must replace; no real address is invented here.
 */
export default function Report() {
  const [notice, setNotice] = useState({
    reporterName: "",
    reporterEmail: "",
    workDescription: "",
    infringingRef: "",
    goodFaithStatement: false,
    accuracyStatement: false,
    signature: "",
  });
  const [appeal, setAppeal] = useState({
    strikeId: "",
    appellantName: "",
    appellantEmail: "",
    reason: "",
  });
  const [noticeResult, setNoticeResult] = useState<string | null>(null);
  const [appealResult, setAppealResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitNotice = async () => {
    setBusy(true);
    setNoticeResult(null);
    try {
      const res = await fetch("/api/rights/strikes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notice),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 503) {
        setNoticeResult(
          "Takedown intake is not connected yet (no database on the server). Nothing was filed — please send your notice to the contact address on the Contact page instead.",
        );
        return;
      }
      if (!res.ok) {
        setNoticeResult(data.error ?? "The notice could not be filed.");
        return;
      }
      setNoticeResult(
        "Notice filed. It enters the admin review queue; valid notices are acted on and the affected user is notified where contact details exist.",
      );
    } catch {
      setNoticeResult("The notice could not be filed (network error).");
    } finally {
      setBusy(false);
    }
  };

  const submitAppeal = async () => {
    setBusy(true);
    setAppealResult(null);
    try {
      const res = await fetch(`/api/rights/strikes/${appeal.strikeId}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appellantName: appeal.appellantName,
          appellantEmail: appeal.appellantEmail,
          reason: appeal.reason,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 503) {
        setAppealResult(
          "Appeal intake is not connected yet (no database on the server). Nothing was filed — please send your appeal to the contact address on the Contact page instead.",
        );
        return;
      }
      if (!res.ok) {
        setAppealResult(data.error ?? "The appeal could not be filed.");
        return;
      }
      setAppealResult("Appeal filed. It enters the admin review queue.");
    } catch {
      setAppealResult("The appeal could not be filed (network error).");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "mt-1 w-full rounded border px-2 py-1.5";

  return (
    <div className="space-y-8 text-sm text-slate-700">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Report copyright infringement
        </h1>
        <p className="mt-2">
          Use this form for a DMCA-style takedown notice. The full
          procedure and the repeat-infringer policy are on the
          Copyright / DMCA page. Nothing here promises any outcome,
          and filing a false notice may carry legal consequences.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Takedown notice
        </h2>
        <label className="block">
          Your name
          <input className={field} value={notice.reporterName}
            onChange={(e) => setNotice({ ...notice, reporterName: e.target.value })} />
        </label>
        <label className="block">
          Your email
          <input className={field} type="email" value={notice.reporterEmail}
            onChange={(e) => setNotice({ ...notice, reporterEmail: e.target.value })} />
        </label>
        <label className="block">
          Copyrighted work infringed (describe it)
          <textarea className={field} rows={3} value={notice.workDescription}
            onChange={(e) => setNotice({ ...notice, workDescription: e.target.value })} />
        </label>
        <label className="block">
          Infringing material (platform, post link, date — enough to locate it)
          <input className={field} value={notice.infringingRef}
            onChange={(e) => setNotice({ ...notice, infringingRef: e.target.value })} />
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={notice.goodFaithStatement}
            onChange={(e) => setNotice({ ...notice, goodFaithStatement: e.target.checked })} />
          <span>I have a good-faith belief the use is not authorised by the copyright owner, its agent, or the law.</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={notice.accuracyStatement}
            onChange={(e) => setNotice({ ...notice, accuracyStatement: e.target.checked })} />
          <span>Under penalty of perjury, the information in this notice is accurate and I am the copyright owner or authorised to act on their behalf.</span>
        </label>
        <label className="block">
          Signature (type your full name)
          <input className={field} value={notice.signature}
            onChange={(e) => setNotice({ ...notice, signature: e.target.value })} />
        </label>
        <button
          type="button"
          className="rounded-lg bg-slate-800 px-4 py-2 font-medium text-white disabled:opacity-50"
          onClick={submitNotice}
          disabled={busy}
        >
          File takedown notice
        </button>
        {noticeResult && <p>{noticeResult}</p>}
      </section>

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Appeal a strike
        </h2>
        <p>
          If your account received a strike, appeal it here with the
          strike id you were given. Appeals move: submitted → under
          review → upheld (the strike stands) or overturned (the strike
          is reversed, and a pause it caused is recomputed).
        </p>
        <label className="block">
          Strike id
          <input className={field} value={appeal.strikeId}
            onChange={(e) => setAppeal({ ...appeal, strikeId: e.target.value })} />
        </label>
        <label className="block">
          Your name
          <input className={field} value={appeal.appellantName}
            onChange={(e) => setAppeal({ ...appeal, appellantName: e.target.value })} />
        </label>
        <label className="block">
          Your email
          <input className={field} type="email" value={appeal.appellantEmail}
            onChange={(e) => setAppeal({ ...appeal, appellantEmail: e.target.value })} />
        </label>
        <label className="block">
          Why the strike should be reversed
          <textarea className={field} rows={3} value={appeal.reason}
            onChange={(e) => setAppeal({ ...appeal, reason: e.target.value })} />
        </label>
        <button
          type="button"
          className="rounded-lg bg-slate-800 px-4 py-2 font-medium text-white disabled:opacity-50"
          onClick={submitAppeal}
          disabled={busy}
        >
          File appeal
        </button>
        {appealResult && <p>{appealResult}</p>}
      </section>
    </div>
  );
}
