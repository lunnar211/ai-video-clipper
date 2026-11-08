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

type QueueEntry = {
  post?: {
    id?: string;
    clip_ref?: string;
    project_id?: string;
    title?: string | null;
    schedule_at?: string | null;
    status?: string;
    created_at?: string;
  };
  targets?: Array<{
    platform?: string;
    status?: string;
    error?: string | null;
    provider_url?: string | null;
  }>;
  due?: boolean;
};

const QUEUE_GROUPS: Array<{
  key: string;
  heading: string;
  empty: string;
}> = [
  { key: "scheduled", heading: "Scheduled", empty: "Nothing scheduled." },
  { key: "due", heading: "Due now", empty: "Nothing due." },
  { key: "drafts", heading: "Drafts", empty: "No drafts." },
  { key: "published", heading: "Published", empty: "Nothing published yet." },
  { key: "partial", heading: "Partially published", empty: "None." },
  { key: "failed", heading: "Failed", empty: "No failed posts." },
];

/**
 * Queue, rendered as grouped lists instead of a raw JSON dump
 * (Phase 23). Each post shows its clip, its schedule, and each
 * target's status in plain words. An unexpected shape falls back
 * to the JSON dump rather than crashing the page.
 */
function QueueList({ queue }: { queue: Record<string, unknown[]> }) {
  const groups = QUEUE_GROUPS.map(({ key, heading, empty }) => {
    const raw = queue[key];
    const entries = (Array.isArray(raw) ? raw : []) as QueueEntry[];
    return { key, heading, empty, entries };
  });
  const shaped = groups.some((g) => g.entries.length > 0);
  if (!shaped) {
    // No posts at all — say so plainly instead of an empty dump.
    return (
      <div className="mt-3 space-y-4">
        {groups.map((g) => (
          <div key={g.key}>
            <h3 className="font-semibold text-foreground">
              {g.heading} <span className="font-normal text-muted-foreground">(0)</span>
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{g.empty}</p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-5">
      {groups.map((g) => (
        <div key={g.key}>
          <h3 className="font-semibold text-foreground">
            {g.heading}{" "}
            <span className="font-normal text-muted-foreground">
              ({g.entries.length})
            </span>
          </h3>
          {g.entries.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{g.empty}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {g.entries.map((entry, i) => {
                const post = entry.post ?? {};
                const title =
                  post.title ?? post.clip_ref ?? post.id ?? "Post";
                return (
                  <li
                    key={post.id ?? `${g.key}-${i}`}
                    className="rounded-lg border border-border bg-card p-3 text-sm"
                  >
                    <p className="font-medium text-foreground">{title}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {post.clip_ref ? `Clip: ${post.clip_ref} · ` : ""}
                      {post.schedule_at
                        ? `Scheduled: ${new Date(post.schedule_at).toLocaleString()}`
                        : "No schedule set"}
                      {entry.due ? " · Due now" : ""}
                    </p>
                    {(entry.targets ?? []).length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {(entry.targets ?? []).map((t, j) => (
                          <li key={j} className="text-muted-foreground">
                            {t.platform ?? "target"}: {t.status ?? "unknown"}
                            {t.error ? ` — ${t.error}` : ""}
                            {t.provider_url ? (
                              <>
                                {" "}
                                <a
                                  href={t.provider_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline"
                                >
                                  View post
                                </a>
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

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
  const [queueError, setQueueError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadQueue = () => {
    fetch("/api/publish/queue")
      .then(async (res) => {
        if (res.ok) {
          setQueue(await res.json().catch(() => ({})) as Record<string, unknown[]>);
          setQueueError(null);
          return;
        }
        // A 429 is the site's own rate limiter, not missing setup —
        // say so plainly instead of falling through to the
        // "needs database setup" text (Phase 20 fix).
        if (res.status === 429) {
          setQueueError("Too many requests — try again in a minute.");
          return;
        }
        // 503 is the route's own "no database" answer — only then is
        // the database-setup message true. Any other failure is a
        // load failure, not missing setup.
        if (res.status === 503) {
          setQueueError("Queue needs database setup on the server.");
          return;
        }
        setQueueError("The queue could not be loaded — try again.");
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
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Publish</h1>
      <p className="mt-2 text-muted-foreground">
        Compose a post, schedule it, and publish it to every linked
        account. Publishing re-checks the compliance checklist, the
        publishing-pause flag, the fingerprint verdict, and each
        platform&apos;s limits before any upload is attempted.
      </p>
      <section aria-label="Posting without connecting" className="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="font-semibold text-foreground">
          Posting without connecting
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A finished clip can already be posted from the tool itself,
          via your device&apos;s share sheet or the platform&apos;s own
          upload page — no account connection needed, and no login
          saved anywhere. This composer is only for the
          connected-account path, which stays off until each
          platform&apos;s app review is approved.
        </p>
      </section>
      {result && (
        <p className="mt-4 whitespace-pre-line rounded bg-muted p-3 text-sm">
          {result}
        </p>
      )}

      {/* 1. The clip — plain words, not internal field names. */}
      <section aria-labelledby="publish-clip-heading" className="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 id="publish-clip-heading" className="font-semibold text-foreground">
          1. The clip
        </h2>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Clip</span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              value={form.clipRef}
              onChange={(e) => set("clipRef", e.target.value)}
              placeholder="clip-1"
            />
            <span className="text-xs text-muted-foreground">
              Which clip is this post for? Use the clip name from the
              clipper.
            </span>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Project</span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              value={form.projectId}
              onChange={(e) => set("projectId", e.target.value)}
              placeholder="project-1"
            />
            <span className="text-xs text-muted-foreground">
              The project this clip belongs to.
            </span>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">
              Uploaded video <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              value={form.mediaKey}
              onChange={(e) => set("mediaKey", e.target.value)}
              placeholder="tmp/publish/… or uploads/…"
            />
            <span className="text-xs text-muted-foreground">
              Only if the video was uploaded to server storage first —
              leave empty for a clip made in your browser.
            </span>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">
              Compliance checklist <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              value={form.checklistPostRef}
              onChange={(e) => set("checklistPostRef", e.target.value)}
              placeholder="draft id used for the checklist"
            />
            <span className="text-xs text-muted-foreground">
              The draft id used for the per-post compliance checklist,
              if you ran one.
            </span>
          </label>
        </div>
      </section>

      {/* 2. Schedule & details */}
      <section aria-labelledby="publish-schedule-heading" className="mt-5 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 id="publish-schedule-heading" className="font-semibold text-foreground">
          2. Schedule &amp; details
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">
              Schedule at <span className="font-normal text-muted-foreground">(empty = draft)</span>
            </span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              type="datetime-local"
              value={form.scheduleAt}
              onChange={(e) => set("scheduleAt", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Timezone</span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Duration (sec)</span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              value={form.durationSec}
              onChange={(e) => set("durationSec", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Size (MB)</span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              value={form.sizeMB}
              onChange={(e) => set("sizeMB", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Aspect</span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              value={form.aspect}
              onChange={(e) => set("aspect", e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 space-y-2">
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
        </div>
      </section>

      {/* 3. Where to post */}
      <section aria-labelledby="publish-targets-heading" className="mt-5 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 id="publish-targets-heading" className="font-semibold text-foreground">
          3. Where to post
        </h2>
        {targets.map((target, i) => (
          <div key={i} className="mt-4 grid gap-3 rounded-lg border border-border bg-background p-3 sm:p-4">
            <p className="text-sm font-semibold text-foreground">
              Target {i + 1}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-foreground">Platform</span>
                <select
                  className="rounded-lg border border-border bg-background px-2 py-2"
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
                <span className="font-medium text-foreground">
                  Connected account
                </span>
                <input
                  className="rounded-lg border border-border bg-background px-2 py-2"
                  value={target.accountId}
                  onChange={(e) => {
                    const next = [...targets];
                    next[i] = { ...next[i], accountId: e.target.value };
                    setTargets(next);
                  }}
                  placeholder="Account id from Connected accounts"
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-foreground">
                Title <span className="font-normal text-muted-foreground">(YouTube)</span>
              </span>
              <input
                className="rounded-lg border border-border bg-background px-2 py-2"
                value={target.title}
                onChange={(e) => {
                  const next = [...targets];
                  next[i] = { ...next[i], title: e.target.value };
                  setTargets(next);
                }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-foreground">
                Description / caption
              </span>
              <textarea
                className="rounded-lg border border-border bg-background px-2 py-2"
                value={target.description}
                onChange={(e) => {
                  const next = [...targets];
                  next[i] = { ...next[i], description: e.target.value };
                  setTargets(next);
                }}
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-foreground">
                  Tags (comma-separated)
                </span>
                <input
                  className="rounded-lg border border-border bg-background px-2 py-2"
                  value={target.tags}
                  onChange={(e) => {
                    const next = [...targets];
                    next[i] = { ...next[i], tags: e.target.value };
                    setTargets(next);
                  }}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-foreground">Visibility</span>
                <select
                  className="rounded-lg border border-border bg-background px-2 py-2"
                  value={target.visibility}
                  onChange={(e) => {
                    const next = [...targets];
                    next[i] = {
                      ...next[i],
                      visibility: e.target.value as TargetForm["visibility"],
                    };
                    setTargets(next);
                  }}
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </label>
            </div>
          </div>
        ))}
        <button
          className="mt-3 inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 py-1 text-sm font-medium"
          onClick={() => setTargets([...targets, { ...EMPTY_TARGET }])}
        >
          Add target
        </button>
      </section>
      <div className="mt-6 flex gap-2">
        <button
          className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-50"
          disabled={busy}
          onClick={createPost}
        >
          Create post
        </button>
        <button
          className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 font-medium disabled:opacity-50"
          disabled={busy || !postId}
          onClick={publishNow}
        >
          Publish now
        </button>
      </div>
      <section className="mt-8" aria-labelledby="publish-queue-heading">
        <h2 id="publish-queue-heading" className="text-lg font-semibold">
          Queue
        </h2>
        {!queue ? (
          <p className="mt-2 text-muted-foreground">
            {queueError ?? "Loading queue…"}
          </p>
        ) : (
          <QueueList queue={queue} />
        )}
      </section>
    </div>
  );
}
