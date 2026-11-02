"use client";

import { useCallback, useState } from "react";
import type { TranscriptSegment } from "@/lib/captions";
import type { ClipMetadata, MetadataSource } from "@/lib/ai/metadata";

type ClipRef = { start: number; end: number; title: string };

type Tab = "titles" | "descriptions" | "tags" | "more";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "titles", label: "Titles" },
  { id: "descriptions", label: "Descriptions" },
  { id: "tags", label: "Tags" },
  { id: "more", label: "More" },
];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={copy}
      className="shrink-0 rounded border px-2 py-1 text-xs"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function Field({
  label,
  text,
  multiline,
}: {
  label: string;
  text: string;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded border p-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className={`text-slate-700 ${multiline ? "whitespace-pre-wrap" : ""}`}>
          {text}
        </p>
      </div>
      <CopyButton text={text} label={label} />
    </div>
  );
}

/**
 * Tabbed viral-metadata card for one clip. Nothing is fetched until
 * the user presses Generate; Regenerate re-fetches (server rate
 * limit: 5/min per IP — a 429 is shown honestly).
 */
export default function MetadataCard({
  transcript,
  clip,
}: {
  transcript: TranscriptSegment[];
  clip: ClipRef;
}) {
  const [tab, setTab] = useState<Tab>("titles");
  const [metadata, setMetadata] = useState<ClipMetadata | null>(null);
  const [source, setSource] = useState<MetadataSource | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/clips/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, clip }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        metadata?: ClipMetadata;
        source?: MetadataSource;
        provider?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Metadata generation failed.");
        return;
      }
      setMetadata(data.metadata ?? null);
      setSource(data.source ?? null);
      setProvider(data.provider ?? null);
    } catch {
      setError("Metadata generation failed (network error).");
    } finally {
      setLoading(false);
    }
  }, [transcript, clip]);

  if (!metadata) {
    return (
      <div className="mt-3 rounded-lg border bg-slate-50 p-3 text-sm">
        <p className="font-medium">Viral metadata</p>
        <p className="mt-1 text-slate-600">
          Titles with hook scores, platform descriptions, tags, a pinned
          comment and a virality score — generated from this clip&apos;s
          transcript. Without an AI key you get a labelled template
          instead of fake AI output.
        </p>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="mt-2 rounded-lg bg-violet-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate viral metadata"}
        </button>
        {error && <p className="mt-2 text-red-700">{error}</p>}
      </div>
    );
  }

  const allTags = [...metadata.tags.broad, ...metadata.tags.niche];
  return (
    <div className="mt-3 rounded-lg border bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Viral metadata</p>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded-lg border bg-white px-3 py-1.5 disabled:opacity-50"
        >
          {loading ? "Regenerating…" : "Regenerate"}
        </button>
      </div>
      {source === "template" ? (
        <p className="mt-2 rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">
          Template fallback — no AI key is configured, or the AI output
          failed validation. Scores shown are neutral estimates, not AI
          scores and not a promise of views.
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          Generated by AI{provider ? ` (${provider})` : ""}. Scores are
          estimates, not a promise of views.
        </p>
      )}
      {error && <p className="mt-2 text-red-700">{error}</p>}
      <div role="tablist" aria-label="Metadata sections" className="mt-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              tab === t.id
                ? "bg-violet-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-3 space-y-2">
        {tab === "titles" &&
          metadata.titles.map((t, i) => (
            <Field
              key={i}
              label={`Title ${i + 1} — hook score ${t.hookScore}/100`}
              text={`${t.text} — ${t.reason}`}
            />
          ))}
        {tab === "titles" && (
          <Field label="Hook line (first 3 seconds)" text={metadata.hookLine} />
        )}
        {tab === "descriptions" && (
          <>
            <Field
              label={`TikTok — ${metadata.descriptions.tiktok.tone}`}
              text={`${metadata.descriptions.tiktok.text}\n${metadata.descriptions.tiktok.hashtags.join(" ")}`}
              multiline
            />
            <Field
              label={`YouTube Shorts — ${metadata.descriptions.youtubeShorts.tone}`}
              text={`${metadata.descriptions.youtubeShorts.text}\n${metadata.descriptions.youtubeShorts.hashtags.join(" ")}`}
              multiline
            />
            <Field
              label={`Instagram Reels — ${metadata.descriptions.instagramReels.tone}`}
              text={`${metadata.descriptions.instagramReels.text}\n${metadata.descriptions.instagramReels.hashtags.join(" ")}`}
              multiline
            />
          </>
        )}
        {tab === "tags" && (
          <>
            <Field label="Broad tags" text={metadata.tags.broad.join(" ")} />
            <Field label="Niche tags" text={metadata.tags.niche.join(" ")} />
            <Field label="All tags" text={allTags.join(" ")} />
          </>
        )}
        {tab === "more" && (
          <>
            <Field label="Pinned comment" text={metadata.pinnedComment} />
            <Field label="Call to action" text={metadata.cta} />
            <Field
              label={`Virality score ${metadata.virality.score}/100`}
              text={`Hook ${metadata.virality.subscores.hook} · Emotion ${metadata.virality.subscores.emotion} · Pacing ${metadata.virality.subscores.pacing} · Ending ${metadata.virality.subscores.ending}`}
            />
          </>
        )}
      </div>
    </div>
  );
}
