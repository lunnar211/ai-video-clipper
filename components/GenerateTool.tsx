"use client";

import { useCallback, useMemo, useState } from "react";
import {
  renderGeneratedShort,
  GENERATED_WINDOW_SEC,
  buildGeneratedCaptions,
} from "@/lib/browser/render-generated";
import {
  segmentsToSrt,
  segmentsToVtt,
  captionPresetById,
} from "@/lib/captions";
import { buildZip } from "@/lib/browser/zip";
import { combineAttributionLines } from "@/lib/rights/attribution";
import {
  canRenderToday,
  clipsUsedToday,
  recordRenderToday,
  shouldWatermark,
} from "@/lib/usage/quota";
import MusicPicker from "@/components/MusicPicker";
import {
  userTrackAttribution,
  type UserTrack,
} from "@/lib/music/tracks";
import RightsPanel from "@/components/RightsPanel";
import PostClip from "@/components/PostClip";
import type { GeneratedVisual } from "@/lib/imports/cc-types";

/**
 * AI Generate Short (ClipForge Phase 17).
 *
 * Topic in, original short out — no link anywhere in this flow:
 * 1. AI writes a short script from a topic (or the user's own
 *    custom script is split into segments).
 * 2. Each segment gets a visual: a licence-verified Wikimedia
 *    Commons video, or footage the user uploads themselves.
 * 3. The browser composer renders one vertical 9:16 captioned
 *    short (sources muted; voiceover + optional user-licensed
 *    music as the soundtrack).
 * 4. The same export pipeline (video, SRT, VTT, ZIP with
 *    ATTRIBUTION.txt) and the same Phase 13 post panel as the
 *    tool, so the finished short can go to social accounts.
 *
 * Honest by construction: a segment with no visual cannot
 * render; an unverified licence never reaches a render; voiceover
 * degrades to a notice when its key is absent; nothing here
 * promises copyright clearance or earnings.
 */

type SegmentVisualChoice =
  | { kind: "cc"; visual: GeneratedVisual }
  | { kind: "upload"; url: string; name: string };

type GenSegment = {
  text: string;
  visualKeyword: string;
  candidates: GeneratedVisual[];
  selected: SegmentVisualChoice | null;
  visualsLoading: boolean;
  visualsNote: string | null;
};

type ScriptResponse = {
  title: string;
  hashtags: string[];
  segments: Array<{ text: string; visualKeyword: string }>;
  provider: string;
};

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // The anchor must be in the document for the click to start a
  // download in every browser; a detached click is silently dropped
  // by some engines.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
const buttonClass =
  "inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors duration-200 hover:opacity-90 disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors duration-200 hover:bg-muted disabled:opacity-50";

export default function GenerateTool() {
  const [topic, setTopic] = useState("");
  const [customScript, setCustomScript] = useState("");
  const [title, setTitle] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [provider, setProvider] = useState("");
  const [segments, setSegments] = useState<GenSegment[]>([]);
  const [scriptBusy, setScriptBusy] = useState(false);
  const [voiceoverOn, setVoiceoverOn] = useState(false);
  const [musicTrack, setMusicTrack] = useState<UserTrack | null>(null);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rendered, setRendered] = useState<{
    url: string;
    blob: Blob;
    mimeType: string;
    clipId: string;
    totalSec: number;
  } | null>(null);
  const [usedToday, setUsedToday] = useState<number>(() => clipsUsedToday());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);

  const generateScript = useCallback(async () => {
    if (!topic.trim()) {
      setError("Type a topic first.");
      return;
    }
    setScriptBusy(true);
    setError(null);
    setNotice(null);
    setRendered(null);
    try {
      const res = await fetch("/api/generate/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          customScript: customScript.trim() || undefined,
          segmentCount: 4,
        }),
      });
      const data = (await res.json()) as ScriptResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Script generation failed.");
        return;
      }
      setTitle(data.title);
      setHashtags(data.hashtags);
      setProvider(data.provider);
      setSegments(
        data.segments.map((s) => ({
          text: s.text,
          visualKeyword: s.visualKeyword,
          candidates: [],
          selected: null,
          visualsLoading: false,
          visualsNote: null,
        })),
      );
    } catch {
      setError("Script generation failed — try again in a minute.");
    } finally {
      setScriptBusy(false);
    }
  }, [topic, customScript]);

  const findVisuals = useCallback(async (index: number) => {
    setSegments((prev) =>
      prev.map((s, i) =>
        i === index
          ? { ...s, visualsLoading: true, visualsNote: null }
          : s,
      ),
    );
    try {
      const keyword = segments[index].visualKeyword.trim();
      if (!keyword) {
        setSegments((prev) =>
          prev.map((s, i) =>
            i === index
              ? { ...s, visualsLoading: false, visualsNote: "Type a visual keyword first." }
              : s,
          ),
        );
        return;
      }
      const res = await fetch("/api/generate/visuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      const data = (await res.json()) as {
        visuals?: GeneratedVisual[];
        note?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setSegments((prev) =>
          prev.map((s, i) =>
            i === index
              ? { ...s, visualsLoading: false, visualsNote: data.error ?? "Visual search failed." }
              : s,
          ),
        );
        return;
      }
      setSegments((prev) =>
        prev.map((s, i) =>
          i === index
            ? {
                ...s,
                visualsLoading: false,
                candidates: data.visuals ?? [],
                visualsNote: data.note ?? null,
                selected:
                  s.selected ??
                  (data.visuals && data.visuals.length > 0
                    ? { kind: "cc", visual: data.visuals[0] }
                    : null),
              }
            : s,
        ),
      );
    } catch {
      setSegments((prev) =>
        prev.map((s, i) =>
          i === index
            ? { ...s, visualsLoading: false, visualsNote: "Visual search failed — try again." }
            : s,
        ),
      );
    }
  }, [segments]);

  const findAllVisuals = useCallback(async () => {
    for (let i = 0; i < segments.length; i++) {
      if (!segments[i].selected) {
        await findVisuals(i);
      }
    }
  }, [segments, findVisuals]);

  const pickCandidate = useCallback((index: number, visual: GeneratedVisual) => {
    setSegments((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, selected: { kind: "cc", visual } } : s,
      ),
    );
  }, []);

  const uploadOwnFootage = useCallback(
    (index: number, file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("video/")) {
        setNotice("That file is not a video — upload a video file as footage.");
        return;
      }
      const url = URL.createObjectURL(file);
      setSegments((prev) =>
        prev.map((s, i) =>
          i === index
            ? { ...s, selected: { kind: "upload", url, name: file.name } }
            : s,
        ),
      );
    },
    [],
  );

  const missingVisuals = segments.filter((s) => !s.selected).length;

  const render = useCallback(async () => {
    if (missingVisuals > 0) {
      setError(
        `${missingVisuals} segment${missingVisuals === 1 ? "" : "s"} still need${missingVisuals === 1 ? "s" : ""} a visual — pick a free-licence video or upload your own footage.`,
      );
      return;
    }
    if (!canRenderToday()) {
      setError(
        "Daily free render limit reached (3 clips per day). Try again tomorrow.",
      );
      return;
    }
    setError(null);
    setNotice(null);
    setRendering(true);
    setProgress(0);
    try {
      let voiceoverUrl: string | undefined;
      if (voiceoverOn) {
        const scriptText = segments.map((s) => s.text).join(" ");
        if (scriptText.length > 500) {
          setNotice(
            "Voiceover skipped — the script is over the voiceover limit of 500 characters. Rendering continues without voiceover.",
          );
        } else {
          const res = await fetch("/api/clips/voiceover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: scriptText }),
          });
          if (res.ok) {
            const blob = await res.blob();
            voiceoverUrl = URL.createObjectURL(blob);
          } else if (res.status === 503) {
            setNotice(
              "Voiceover is not connected yet (no voice key on the server) — continuing without voiceover.",
            );
          } else {
            setNotice("Voiceover failed — continuing without voiceover.");
          }
        }
      }
      const renderSegments = segments.map((s) => ({
        videoUrl: s.selected!.kind === "cc"
          ? s.selected!.visual.fileUrl
          : (s.selected as { url: string }).url,
        caption: s.text,
      }));
      const result = await renderGeneratedShort({
        segments: renderSegments,
        windowSec: GENERATED_WINDOW_SEC,
        voiceoverUrl,
        musicUrl: musicTrack?.url,
        watermark: shouldWatermark("free"),
        captionPreset: captionPresetById("pop"),
        onProgress: setProgress,
      });
      recordRenderToday();
      setUsedToday(clipsUsedToday());
      const url = URL.createObjectURL(result.blob);
      const clipId = `generated-${Date.now()}`;
      setRendered({
        url,
        blob: result.blob,
        mimeType: result.mimeType,
        clipId,
        totalSec: result.totalSec,
      });
      if (voiceoverUrl) URL.revokeObjectURL(voiceoverUrl);
      // Best-effort server project record (never blocks the render):
      // 401 = guest, ignored; 503 = no database, ignored; 403 = the
      // project-count gate, shown as a notice.
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title || topic }),
        });
        if (res.status === 403) {
          const data = (await res.json()) as { error?: string };
          setNotice(
            data.error ??
              "Project limit reached — this short stays in your browser only.",
          );
        }
      } catch {
        // Project recording is best-effort; the short itself is done.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rendering failed.");
    } finally {
      setRendering(false);
    }
  }, [segments, missingVisuals, voiceoverOn, musicTrack, title, topic]);

  const captions = useMemo(
    () =>
      rendered
        ? buildGeneratedCaptions(
            segments.map((s) => ({
              videoUrl: "",
              caption: s.text,
            })),
          )
        : [],
    [rendered, segments],
  );

  const attribution = combineAttributionLines([
    provider === "custom"
      ? "Script: supplied by the user."
      : `Script: AI-generated from the topic "${topic}" (provider: ${provider}).`,
    ...segments.map((s) =>
      s.selected && s.selected.kind === "cc"
        ? s.selected.visual.attribution
        : s.selected
          ? `Footage: "${s.selected.name}" — uploaded by you (you declare you hold the rights to use it).`
          : null,
    ),
    musicTrack ? userTrackAttribution(musicTrack) : null,
  ]);

  const downloadZip = useCallback(async () => {
    if (!rendered) return;
    setZipBusy(true);
    try {
      // The rendered bytes are kept in state on purpose: fetching
      // the blob: URL back would be blocked by the site's CSP
      // connect-src, which does not (and need not) list blob:.
      const buf = await rendered.blob.arrayBuffer();
      const ext = rendered.mimeType.includes("mp4") ? "mp4" : "webm";
      const entries: Array<{ name: string; data: Uint8Array }> = [
        { name: `${rendered.clipId}.${ext}`, data: new Uint8Array(buf) },
        {
          name: `${rendered.clipId}.srt`,
          data: new TextEncoder().encode(
            segmentsToSrt(captions, 0, rendered.totalSec),
          ),
        },
      ];
      if (attribution) {
        entries.push({
          name: "ATTRIBUTION.txt",
          data: new TextEncoder().encode(`${attribution}\n`),
        });
      }
      downloadBlob(
        new Blob([buildZip(entries).buffer as ArrayBuffer], {
          type: "application/zip",
        }),
        "generated-short.zip",
      );
    } catch {
      setError("ZIP download failed.");
    } finally {
      setZipBusy(false);
    }
  }, [rendered, captions, attribution]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Type a topic and AI writes a brand-new short script, matches
        each line with a free-licence video (or footage you upload),
        and renders a vertical captioned short — no link needed,
        nothing downloaded from any video platform. AI generation
        does not grant rights in anyone else&apos;s material: these
        visuals are CC-licensed or uploaded by you only, and nothing
        here promises copyright clearance or earnings.
      </p>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold">1. Script</h2>
        <div>
          <label htmlFor="generate-topic" className="text-sm font-medium">
            Topic
          </label>
          <input
            id="generate-topic"
            type="text"
            className={inputClass}
            placeholder="e.g. morning routines for students"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={200}
          />
        </div>
        <div>
          <label htmlFor="generate-custom" className="text-sm font-medium">
            Custom script (optional)
          </label>
          <textarea
            id="generate-custom"
            className={inputClass}
            placeholder="Or paste your own script — it will be split into segments, no AI call."
            value={customScript}
            onChange={(e) => setCustomScript(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
        <button
          type="button"
          className={buttonClass}
          onClick={() => void generateScript()}
          disabled={scriptBusy}
        >
          {scriptBusy ? "Writing script…" : "Generate script"}
        </button>
        {segments.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Script ready{provider ? ` (via ${provider})` : ""} — edit any
            line or keyword below before finding visuals.
          </p>
        )}
      </section>

      {segments.length > 0 && (
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">2. Visuals per segment</h2>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => void findAllVisuals()}
            >
              Find visuals for all segments
            </button>
          </div>
          {title && (
            <p className="text-sm">
              <span className="font-medium">{title}</span>
              {hashtags.length > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  — {hashtags.join(" ")}
                </span>
              )}
            </p>
          )}
          {segments.map((segment, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-border p-3"
            >
              <p className="text-sm font-medium">Segment {i + 1}</p>
              <label
                htmlFor={`generate-caption-${i}`}
                className="text-sm font-medium"
              >
                Caption
              </label>
              <input
                id={`generate-caption-${i}`}
                type="text"
                className={inputClass}
                value={segment.text}
                maxLength={280}
                onChange={(e) =>
                  setSegments((prev) =>
                    prev.map((s, j) =>
                      j === i ? { ...s, text: e.target.value } : s,
                    ),
                  )
                }
              />
              <label
                htmlFor={`generate-keyword-${i}`}
                className="text-sm font-medium"
              >
                Visual keyword
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id={`generate-keyword-${i}`}
                  type="text"
                  className={`${inputClass} sm:flex-1`}
                  value={segment.visualKeyword}
                  maxLength={80}
                  onChange={(e) =>
                    setSegments((prev) =>
                      prev.map((s, j) =>
                        j === i
                          ? { ...s, visualKeyword: e.target.value }
                          : s,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => void findVisuals(i)}
                  disabled={segment.visualsLoading}
                >
                  {segment.visualsLoading
                    ? "Searching…"
                    : "Find visuals"}
                </button>
              </div>
              {segment.visualsNote && (
                <p className="text-sm text-muted-foreground">
                  {segment.visualsNote}
                </p>
              )}
              {segment.candidates.length > 0 && (
                <ul className="space-y-1">
                  {segment.candidates.map((c) => (
                    <li key={c.fileUrl}>
                      <button
                        type="button"
                        className="text-left text-sm underline"
                        onClick={() => pickCandidate(i, c)}
                      >
                        {c.title} ({c.license})
                        {segment.selected?.kind === "cc" &&
                          segment.selected.visual.fileUrl === c.fileUrl &&
                          " — selected"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <label
                  htmlFor={`generate-upload-${i}`}
                  className="text-sm font-medium"
                >
                  Upload your own footage
                </label>
                <input
                  id={`generate-upload-${i}`}
                  type="file"
                  accept="video/*"
                  className={`${inputClass} mt-1`}
                  onChange={(e) =>
                    uploadOwnFootage(i, e.target.files?.[0])
                  }
                />
              </div>
              {segment.selected && (
                <p className="text-sm text-muted-foreground">
                  Selected visual:{" "}
                  {segment.selected.kind === "cc"
                    ? `${segment.selected.visual.title} (${segment.selected.visual.license})`
                    : `${segment.selected.name} (your upload)`}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {segments.length > 0 && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">3. Soundtrack + render</h2>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={voiceoverOn}
              onChange={(e) => setVoiceoverOn(e.target.checked)}
            />
            Voiceover narration (when a voice key is connected)
          </label>
          <MusicPicker selected={musicTrack} onSelect={setMusicTrack} />
          {missingVisuals > 0 && (
            <p className="text-sm text-muted-foreground">
              {missingVisuals} segment{missingVisuals === 1 ? "" : "s"}{" "}
              still need{missingVisuals === 1 ? "s" : ""} a visual
              before rendering.
            </p>
          )}
          <button
            type="button"
            className={buttonClass}
            onClick={() => void render()}
            disabled={rendering || missingVisuals > 0}
          >
            {rendering
              ? `Rendering… ${Math.round(progress * 100)}%`
              : "Render short"}
          </button>
          <p className="text-sm text-muted-foreground">
            Free renders used today: {usedToday} of 3. Renders carry
            a watermark on the free tier.
          </p>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

      {rendered && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Your generated short</h2>
          <video
            src={rendered.url}
            controls
            playsInline
            className="max-h-[480px] w-full rounded-lg bg-black"
          />
          <div className="flex flex-wrap gap-2">
            <a
              href={rendered.url}
              download={`${rendered.clipId}.${rendered.mimeType.includes("mp4") ? "mp4" : "webm"}`}
              className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors duration-200 hover:bg-muted"
            >
              Download video
            </a>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() =>
                downloadBlob(
                  new Blob(
                    [segmentsToSrt(captions, 0, rendered.totalSec)],
                    { type: "text/plain" },
                  ),
                  `${rendered.clipId}.srt`,
                )
              }
            >
              Download SRT
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() =>
                downloadBlob(
                  new Blob(
                    [segmentsToVtt(captions, 0, rendered.totalSec)],
                    { type: "text/vtt" },
                  ),
                  `${rendered.clipId}.vtt`,
                )
              }
            >
              Download VTT
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => void downloadZip()}
              disabled={zipBusy}
            >
              {zipBusy ? "Zipping…" : "Download ZIP"}
            </button>
          </div>
          <RightsPanel
            sourceLine={`AI-generated script (${provider === "custom" ? "supplied by you" : `via ${provider}`}) + ${segments.filter((s) => s.selected?.kind === "cc").length} free-licence visual(s) from Wikimedia Commons + ${segments.filter((s) => s.selected?.kind === "upload").length} own upload(s).`}
            checkLines={[
              "No music check run — generated visuals are used under their own licences, listed below.",
              "This panel is not a legal guarantee: AI generation does not grant rights in anyone else's material.",
            ]}
            treatment="muted"
            trackName={musicTrack?.name ?? null}
            trackLicence={musicTrack?.licence ?? null}
            trackCredit={musicTrack ? userTrackAttribution(musicTrack) : null}
            voiceoverOn={voiceoverOn}
            renderedTreatments={["muted"]}
            attribution={attribution}
          />
          <PostClip
            clipId={rendered.clipId}
            title={title || topic}
            hashtags={hashtags}
            mimeType={rendered.mimeType}
            getBlob={async () => rendered.blob}
          />
        </section>
      )}
    </div>
  );
}
