"use client";

import { useEffect, useState } from "react";

type TargetForm = {
  platform: string;
  accountId: string;
  title: string;
  description: string;
  tags: string;
  visibility: "public" | "unlisted" | "private";
};

/**
 * Publisher: composer + queue (ClipForge Phase 3).
 *
 * The composer builds a post (clip ref, staged media key, checklist
 * ref, schedule, per-platform metadata) and the queue lists scheduled
 * and published posts with per-target status. Publish re-enforces
 * every Phase 2 gate server-side; this page only surfaces the
 * verdicts. Nothing here publishes without a connected account and
 * an approved platform flag.
 */
const EMPTY_TARGET: TargetForm = {
  platform: "youtube",
  accountId: "",
  title: "",
  description: "",
  tags: "",
  visibility: "unlisted",
};

export default function Publish() {
  const [form, setForm] = useState({
    clipRef: "",
    projectId: "",
    mediaKey: "",
    checklistPostRef: "",
    scheduleAt: "",
    timezone: "UTC",
    durationSec: "45",
    sizeMB: "50",
    aspect: "9:16",
    declarationAccepted: true,
    fingerprintScanned: false,
    fingerprintDetected: false,
    licenceProof: "",
    platformRulesAcknowledged: true,
    notScannedAcknowledged: false,
  });
  const [targets, setTargets] = useState<TargetForm[]>([
    { ...EMPTY_TARGET },
  ]);
  const [result, setResult] = useState<string | null>(null);
  const [postId, setPostId] = useState<string | null>(null);
  const [queue, setQueue] = useState<Record<string, unknown[]> | null>(null);
  const [busy, setBusy] = useState(false);

  const loadQueue = () => {
    fetch("/api/publish/queue")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown[]
        >;
        if (res.ok) setQueue(data);
      })
      .catch(() => {
        // Queue is best-effort here; the composer still works.
      });
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const set = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const createPost = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/publish/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipRef: form.clipRef,
          projectId: form.projectId,
          mediaKey: form.mediaKey || null,
          checklistPostRef: form.checklistPostRef,
          scheduleAt: form.scheduleAt || null,
          timezone: form.timezone || null,
          clipFacts: {
            durationSec: Number(form.durationSec),
            sizeBytes: Math.round(Number(form.sizeMB) * 1024 * 1024),
            aspect: form.aspect,
          },
          prePublish: {
            projectId: form.projectId,
            declarationAccepted: form.declarationAccepted,
            fingerprintScanned: form.fingerprintScanned,
            fingerprintDetected: form.fingerprintDetected,
            licenceProof: form.licenceProof || null,
            platformRulesAcknowledged: form.platformRulesAcknowledged,
            notScannedAcknowledged: form.notScannedAcknowledged,
          },
          targets: targets.map((t) => ({
            platform: t.platform,
            accountId: t.accountId,
            title: t.title || null,
            description: t.description,
            tags: t.tags
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            visibility: t.visibility,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        platform?: string;
        post?: { id: string };
      };
      if (!res.ok) {
        setResult(
          data.error
            ? `${data.error}${data.platform ? ` (${data.platform})` : ""}`
            : "The post could not be created.",
        );
        return;
      }
      setPostId(data.post?.id ?? null);
      setResult("Post created. Publish it from below when ready.");
      loadQueue();
    } catch {
      setResult("The post could not be created (network error).");
    } finally {
      setBusy(false);
    }
  };

  const publishNow = async () => {
    if (!postId) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/publish/posts/${postId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipFacts: {
            durationSec: Number(form.durationSec),
            sizeBytes: Math.round(Number(form.sizeMB) * 1024 * 1024),
            aspect: form.aspect,
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
        targets?: Array<{
          platform: string;
          status: string;
          error?: string | null;
        }>;
      };
      if (!res.ok) {
        setResult(data.error ?? "Publish failed.");
        return;
      }
      const lines = (data.targets ?? []).map(
        (t) =>
          `${t.platform}: ${t.status}${t.error ? ` — ${t.error}` : ""}`,
      );
      setResult(`Post status: ${data.status}\n${lines.join("\n")}`);
      loadQueue();
    } catch {
      setResult("Publish failed (network error).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">Publish</h1>
      <p className="mt-2 text-slate-600">
        Compose a post, schedule it, and publish it to every linked
        account. Publishing re-checks the compliance checklist, the
        publishing-pause flag, the fingerprint verdict, and each
        platform&apos;s limits before any upload is attempted.
      </p>
      {result && (
        <p className="mt-4 whitespace-pre-line rounded bg-slate-100 p-3 text-sm">
          {result}
        </p>
      )}
      <section className="mt-6 grid gap-3">
        <label className="grid gap-1 text-sm">
          Clip ref
          <input
            className="rounded border px-3 py-2"
            value={form.clipRef}
            onChange={(e) => set("clipRef", e.target.value)}
            placeholder="clip-1"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Project id
          <input
            className="rounded border px-3 py-2"
            value={form.projectId}
            onChange={(e) => set("projectId", e.target.value)}
            placeholder="project-1"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Staged media key (from resumable upload; empty = browser clip)
          <input
            className="rounded border px-3 py-2"
            value={form.mediaKey}
            onChange={(e) => set("mediaKey", e.target.value)}
            placeholder="tmp/publish/… or uploads/…"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Checklist post ref (from the per-post compliance checklist)
          <input
            className="rounded border px-3 py-2"
            value={form.checklistPostRef}
            onChange={(e) => set("checklistPostRef", e.target.value)}
            placeholder="draft id used for the checklist"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            Schedule at (empty = draft)
            <input
              className="rounded border px-3 py-2"
              type="datetime-local"
              value={form.scheduleAt}
              onChange={(e) => set("scheduleAt", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Timezone
            <input
              className="rounded border px-3 py-2"
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
            />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1 text-sm">
            Duration (sec)
            <input
              className="rounded border px-3 py-2"
              value={form.durationSec}
              onChange={(e) => set("durationSec", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Size (MB)
            <input
              className="rounded border px-3 py-2"
              value={form.sizeMB}
              onChange={(e) => set("sizeMB", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Aspect
            <input
              className="rounded border px-3 py-2"
              value={form.aspect}
              onChange={(e) => set("aspect", e.target.value)}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.fingerprintScanned}
            onChange={(e) => set("fingerprintScanned", e.target.checked)}
          />
          Fingerprint scan ran for this clip
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.notScannedAcknowledged}
            onChange={(e) => set("notScannedAcknowledged", e.target.checked)}
          />
          I acknowledge this clip was not scanned (I remain responsible)
        </label>
      </section>
      <section className="mt-6">
        <h2 className="font-semibold">Targets</h2>
        {targets.map((target, i) => (
          <div key={i} className="mt-3 grid gap-2 rounded border p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-sm">
                Platform
                <select
                  className="rounded border px-2 py-2"
                  value={target.platform}
                  onChange={(e) => {
                    const next = [...targets];
                    next[i] = { ...next[i], platform: e.target.value };
                    setTargets(next);
                  }}
                >
                  {[
                    "youtube",
                    "tiktok",
                    "instagram",
                    "facebook",
                    "x",
                    "linkedin",
                  ].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Account id (from Connected accounts)
                <input
                  className="rounded border px-2 py-2"
                  value={target.accountId}
                  onChange={(e) => {
                    const next = [...targets];
                    next[i] = { ...next[i], accountId: e.target.value };
                    setTargets(next);
                  }}
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              Title (YouTube)
              <input
                className="rounded border px-2 py-2"
                value={target.title}
                onChange={(e) => {
                  const next = [...targets];
                  next[i] = { ...next[i], title: e.target.value };
                  setTargets(next);
                }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Description / caption
              <textarea
                className="rounded border px-2 py-2"
                value={target.description}
                onChange={(e) => {
                  const next = [...targets];
                  next[i] = { ...next[i], description: e.target.value };
                  setTargets(next);
                }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Tags (comma-separated)
              <input
                className="rounded border px-2 py-2"
                value={target.tags}
                onChange={(e) => {
                  const next = [...targets];
                  next[i] = { ...next[i], tags: e.target.value };
                  setTargets(next);
                }}
              />
            </label>
          </div>
        ))}
        <button
          className="mt-3 rounded border px-3 py-1 text-sm"
          onClick={() => setTargets([...targets, { ...EMPTY_TARGET }])}
        >
          Add target
        </button>
      </section>
      <div className="mt-6 flex gap-2">
        <button
          className="rounded bg-violet-700 px-4 py-2 text-white disabled:opacity-50"
          disabled={busy}
          onClick={createPost}
        >
          Create post
        </button>
        <button
          className="rounded border px-4 py-2 disabled:opacity-50"
          disabled={busy || !postId}
          onClick={publishNow}
        >
          Publish now
        </button>
      </div>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Queue</h2>
        {!queue ? (
          <p className="mt-2 text-slate-600">
            Queue needs database setup on the server.
          </p>
        ) : (
          <pre className="mt-2 overflow-auto rounded bg-slate-100 p-3 text-xs">
            {JSON.stringify(queue, null, 2)}
          </pre>
        )}
      </section>
    </main>
  );
}
