"use client";

import { useState } from "react";
import { CHECKLIST_ITEMS } from "@/lib/rights/checklist";
import type { PrePublishVerdict } from "@/lib/rights/policy";

/**
 * Per-post compliance checklist (ClipForge Phase 2).
 *
 * Ticked PER POST, never once globally: the record is keyed by the
 * selected clip (postRef `clip-<id>`) and stored via
 * /api/rights/checklist when a database is configured. Without one,
 * saving answers 503 honestly and the ticks stay session-local.
 * The verdict comes from /api/rights/pre-publish-check; Phase 3 will
 * call the same check against real posts before publishing.
 */

type MusicStatus = "checking" | "clear" | "detected" | "unavailable";

export default function ComplianceChecklist({
  projectId,
  declarationAccepted,
  clips,
  musicCheck,
  musicLicence,
}: {
  projectId: string;
  declarationAccepted: boolean;
  clips: { id: string; title: string }[];
  musicCheck: Record<string, { status: MusicStatus }>;
  musicLicence: string | null;
}) {
  const [clipId, setClipId] = useState(clips[0]?.id ?? "");
  const [ticks, setTicks] = useState({
    declaration: declarationAccepted,
    musicLicence: musicLicence !== null,
    fingerprintReviewed: false,
    platformRules: false,
  });
  const [licenceProof, setLicenceProof] = useState("");
  const [notScannedAck, setNotScannedAck] = useState(false);
  const [verdict, setVerdict] = useState<PrePublishVerdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (clips.length === 0) return null;
  const selected = clips.find((c) => c.id === clipId) ?? clips[0];
  const status = musicCheck[selected.id]?.status;
  const fingerprintScanned = status === "clear" || status === "detected";
  const fingerprintDetected = status === "detected";

  const runCheck = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/rights/pre-publish-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          clipRef: selected.id,
          declarationAccepted: ticks.declaration,
          fingerprintScanned,
          fingerprintDetected,
          licenceProof: licenceProof.trim() || null,
          musicChoice: musicLicence ? "licensed-upload" : "original",
          platformRulesAcknowledged: ticks.platformRules,
          notScannedAcknowledged: notScannedAck,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as PrePublishVerdict & {
        error?: string;
      };
      if (!res.ok) {
        setNote(data.error ?? "Pre-publish check failed.");
        return;
      }
      setVerdict(data);
    } catch {
      setNote("Pre-publish check failed (network error).");
    } finally {
      setBusy(false);
    }
  };

  const saveRecord = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/rights/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postRef: `clip-${selected.id}`,
          projectId,
          ticks,
          policyOutcome: verdict?.policy.outcome,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 503) {
        setNote(
          "Checklist storage is not connected yet — your ticks apply in this session only, as a session-only record until database setup lands.",
        );
        return;
      }
      if (!res.ok) {
        setNote(data.error ?? "Could not save the checklist record.");
        return;
      }
      setNote("Checklist record saved for this post.");
    } catch {
      setNote("Could not save the checklist record (network error).");
    } finally {
      setBusy(false);
    }
  };

  const setTick = (key: keyof typeof ticks, value: boolean) =>
    setTicks((prev) => ({ ...prev, [key]: value }));

  return (
    <section className="rounded-xl border p-4 text-sm" aria-label="Pre-publish compliance checklist">
      <h3 className="font-semibold">Pre-publish compliance checklist</h3>
      <p className="mt-1 text-slate-600">
        Tick this list per post, not once for all posts. Publishing
        stays blocked until every item passes and the music policy
        allows it. Phase 3 will enforce this against real posts.
      </p>
      <label className="mt-3 flex flex-col">
        Post (clip)
        <select
          className="mt-1 rounded border px-2 py-1"
          value={selected.id}
          onChange={(e) => setClipId(e.target.value)}
        >
          {clips.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-slate-600">
        Fingerprint state for this clip:{" "}
        {fingerprintScanned
          ? fingerprintDetected
            ? "match found — licence proof is required below"
            : "scanned, no match found (not proof of clearance)"
          : "not scanned — unscanned does not mean clear"}
      </p>
      <div className="mt-3 space-y-2">
        {CHECKLIST_ITEMS.map((item) => (
          <label key={item.key} className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={ticks[item.key]}
              onChange={(e) => setTick(item.key, e.target.checked)}
            />
            <span>
              <strong>{item.label}</strong>
              <span className="text-slate-500"> — {item.help}</span>
            </span>
          </label>
        ))}
        {!fingerprintScanned && (
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={notScannedAck}
              onChange={(e) => setNotScannedAck(e.target.checked)}
            />
            <span>
              I understand this clip was <strong>not</strong> fingerprint-scanned,
              and I remain responsible for its music.
            </span>
          </label>
        )}
      </div>
      <label className="mt-3 flex flex-col">
        Licence proof for matched music (optional unless a match was found)
        <input
          className="mt-1 rounded border px-2 py-1"
          value={licenceProof}
          onChange={(e) => setLicenceProof(e.target.value)}
          placeholder="Licence name, order/invoice ref, or URL"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-violet-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
          onClick={runCheck}
          disabled={busy}
        >
          {busy ? "Checking…" : "Run pre-publish check"}
        </button>
        <button
          type="button"
          className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
          onClick={saveRecord}
          disabled={busy}
        >
          Save checklist record
        </button>
      </div>
      {verdict && (
        <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3">
          <p className="font-medium">
            Verdict: {verdict.ready ? "ready to publish" : "not ready"} — policy:{" "}
            {verdict.policy.outcome}
          </p>
          {verdict.items.map((item) => (
            <p key={item.key}>
              {item.passed ? "✓" : "✗"} {item.label} — {item.detail}
            </p>
          ))}
        </div>
      )}
      {note && <p className="mt-2 text-slate-700">{note}</p>}
    </section>
  );
}
