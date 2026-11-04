"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  renderGeneratedShort,
  GENERATED_WINDOW_SEC,
  buildGeneratedCaptions,
} from "@/lib/browser/render-generated";
import { segmentsToSrt, segmentsToVtt } from "@/lib/captions";
import { buildZip } from "@/lib/browser/zip";
import { combineAttributionLines } from "@/lib/rights/attribution";
import {
  canRenderToday,
  clipsUsedToday,
  recordRenderToday,
  shouldWatermark,
} from "@/lib/usage/quota";
import {
  TRANSLATION_LANGUAGES,
  languageName,
} from "@/lib/ai/languages";
import {
  FORMAT_DIMENSIONS,
  GENERATED_FORMATS,
  SUBTITLE_FONTS,
  SUBTITLE_COLORS,
  SUBTITLE_BACKGROUNDS,
  DEFAULT_SUBTITLE_STYLE,
  resolveSubtitleStyle,
  type GeneratedFormat,
  type SubtitleStyle,
} from "@/lib/browser/subtitles";
import {
  loadHistory,
  recordGeneration,
  type GenerationHistoryEntry,
} from "@/lib/browser/generation-history";
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
  language?: string;
};

type ScriptSnapshot = {
  title: string;
  hashtags: string[];
  segments: Array<{ text: string; visualKeyword: string }>;
};

type ServerProject = {
  id: string;
  title: string;
  created_at: string;
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
  const [language, setLanguage] = useState("en");
  const [title, setTitle] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [provider, setProvider] = useState("");
  const [segments, setSegments] = useState<GenSegment[]>([]);
  const [scriptBusy, setScriptBusy] = useState(false);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [originalVersion, setOriginalVersion] =
    useState<ScriptSnapshot | null>(null);
  const [rewriteVersion, setRewriteVersion] =
    useState<ScriptSnapshot | null>(null);
  const [activeVersion, setActiveVersion] = useState<"original" | "rewrite">(
    "original",
  );
  const [format, setFormat] = useState<GeneratedFormat>("9:16");
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(
    DEFAULT_SUBTITLE_STYLE,
  );
  const [history, setHistory] = useState<GenerationHistoryEntry[]>([]);
  const [serverProjects, setServerProjects] = useState<ServerProject[]>([]);
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
    format: GeneratedFormat;
    width: number;
    height: number;
    subtitleStyle: SubtitleStyle;
  } | null>(null);
  const [usedToday, setUsedToday] = useState<number>(() => clipsUsedToday());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);

  useEffect(() => {
    // Client-only read: localStorage does not exist during SSR, so
    // the history is loaded after mount. Deferred past commit so the
    // mount sync does not cascade renders during the commit phase.
    queueMicrotask(() => setHistory(loadHistory()));
    // Server project records (signed-in only): titles + dates, shown
    // in history. 401 = guest and 503 = no database are both normal
    // here — the browser-local history below still works.
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.projects)) {
          setServerProjects(data.projects as ServerProject[]);
        }
      })
      .catch(() => undefined);
  }, []);

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
          language,
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
      if (data.language) setLanguage(data.language);
      const snapshot: ScriptSnapshot = {
        title: data.title,
        hashtags: data.hashtags,
        segments: data.segments,
      };
      setOriginalVersion(snapshot);
      setRewriteVersion(null);
      setActiveVersion("original");
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
  }, [topic, customScript, language]);

  const snapshotOfCurrent = useCallback(
    (): ScriptSnapshot => ({
      title,
      hashtags,
      segments: segments.map((s) => ({
        text: s.text,
        visualKeyword: s.visualKeyword,
      })),
    }),
    [title, hashtags, segments],
  );

  const loadSnapshot = useCallback((snapshot: ScriptSnapshot) => {
    setTitle(snapshot.title);
    setHashtags(snapshot.hashtags);
    // Visuals belong to a version's keywords, so switching versions
    // resets them — the user finds visuals again for the new lines.
    setSegments(
      snapshot.segments.map((s) => ({
        text: s.text,
        visualKeyword: s.visualKeyword,
        candidates: [],
        selected: null,
        visualsLoading: false,
        visualsNote: null,
      })),
    );
    setRendered(null);
  }, []);

  const rewriteScript = useCallback(async () => {
    if (segments.length === 0) return;
    setRewriteBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/generate/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: snapshotOfCurrent(),
          language,
        }),
      });
      const data = (await res.json()) as ScriptResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Script rewrite failed.");
        return;
      }
      // Keep the version being rewritten from, then switch to the
      // rewrite — both stay visible and pickable below.
      if (activeVersion === "original") {
        setOriginalVersion(snapshotOfCurrent());
      } else {
        setRewriteVersion(snapshotOfCurrent());
      }
      const snapshot: ScriptSnapshot = {
        title: data.title,
        hashtags: data.hashtags,
        segments: data.segments,
      };
      setRewriteVersion(snapshot);
      setActiveVersion("rewrite");
      if (data.language) setLanguage(data.language);
      setProvider(data.provider);
      loadSnapshot(snapshot);
      setNotice(
        "Rewritten script ready — the original is still below. Pick the version you want to render.",
      );
    } catch {
      setError("Script rewrite failed — try again in a minute.");
    } finally {
      setRewriteBusy(false);
    }
  }, [segments, snapshotOfCurrent, language, activeVersion, loadSnapshot]);

  const switchVersion = useCallback(
    (version: "original" | "rewrite") => {
      if (version === activeVersion) return;
      const current = snapshotOfCurrent();
      if (activeVersion === "original") {
        setOriginalVersion(current);
      } else {
        setRewriteVersion(current);
      }
      const target =
        version === "original" ? originalVersion : rewriteVersion;
      if (!target) return;
      setActiveVersion(version);
      loadSnapshot(target);
    },
    [
      activeVersion,
      snapshotOfCurrent,
      originalVersion,
      rewriteVersion,
      loadSnapshot,
    ],
  );

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

  const attribution = combineAttributionLines([
    provider === "custom"
      ? "Script: supplied by the user."
      : activeVersion === "rewrite"
        ? `Script: AI-generated from the topic "${topic}", then rewritten (provider: ${provider}).`
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
        format,
        subtitleStyle: resolveSubtitleStyle(subtitleStyle),
        onProgress: setProgress,
      });
      recordRenderToday();
      setUsedToday(clipsUsedToday());
      const url = URL.createObjectURL(result.blob);
      const clipId = `generated-${Date.now()}`;
      const resolvedStyle = resolveSubtitleStyle(subtitleStyle);
      setRendered({
        url,
        blob: result.blob,
        mimeType: result.mimeType,
        clipId,
        totalSec: result.totalSec,
        format: result.format,
        width: result.width,
        height: result.height,
        subtitleStyle: resolvedStyle,
      });
      // History record (browser-local, newest first): the short can
      // be reopened later from the history section below.
      const entry = {
        id: clipId,
        createdAt: new Date().toISOString(),
        topic,
        title: title || topic,
        hashtags,
        language,
        format: result.format,
        subtitleStyle: resolvedStyle,
        segments: segments.map((s) => ({
          text: s.text,
          visualKeyword: s.visualKeyword,
          visual:
            s.selected?.kind === "cc"
              ? {
                  kind: "cc" as const,
                  fileUrl: s.selected.visual.fileUrl,
                  title: s.selected.visual.title,
                  license: s.selected.visual.license,
                  attribution: s.selected.visual.attribution,
                  sourceUrl: s.selected.visual.sourceUrl,
                }
              : s.selected
                ? { kind: "upload" as const, name: s.selected.name }
                : null,
        })),
        attribution: attribution ?? "",
      };
      recordGeneration(entry);
      setHistory(loadHistory());
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
  }, [segments, missingVisuals, voiceoverOn, musicTrack, title, topic, format, subtitleStyle, language, hashtags, attribution]);

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

  const reopenHistory = useCallback((entry: GenerationHistoryEntry) => {
    setTopic(entry.topic);
    setTitle(entry.title);
    setHashtags(entry.hashtags);
    setLanguage(entry.language);
    setFormat(entry.format);
    setSubtitleStyle(resolveSubtitleStyle(entry.subtitleStyle));
    const snapshot: ScriptSnapshot = {
      title: entry.title,
      hashtags: entry.hashtags,
      segments: entry.segments.map((s) => ({
        text: s.text,
        visualKeyword: s.visualKeyword,
      })),
    };
    setOriginalVersion(snapshot);
    setRewriteVersion(null);
    setActiveVersion("original");
    setProvider("history");
    setRendered(null);
    setError(null);
    setSegments(
      entry.segments.map((s) => ({
        text: s.text,
        visualKeyword: s.visualKeyword,
        candidates:
          s.visual?.kind === "cc"
            ? [
                {
                  title: s.visual.title,
                  author: "",
                  license: s.visual.license,
                  sourceUrl: s.visual.sourceUrl,
                  attribution: s.visual.attribution,
                  fileUrl: s.visual.fileUrl,
                  fileName: s.visual.title,
                },
              ]
            : [],
        selected:
          s.visual?.kind === "cc"
            ? {
                kind: "cc",
                visual: {
                  title: s.visual.title,
                  author: "",
                  license: s.visual.license,
                  sourceUrl: s.visual.sourceUrl,
                  attribution: s.visual.attribution,
                  fileUrl: s.visual.fileUrl,
                  fileName: s.visual.title,
                },
              }
            : null,
        visualsLoading: false,
        visualsNote:
          s.visual?.kind === "upload"
            ? `Upload "${s.visual.name}" again — browser uploads are not saved in history.`
            : null,
      })),
    );
    setNotice(
      `Reopened "${entry.title}" — free-licence visuals are restored; your own uploads need uploading again.`,
    );
  }, []);

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
        <div>
          <label htmlFor="generate-language" className="text-sm font-medium">
            Script language
          </label>
          <select
            id="generate-language"
            className={inputClass}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {TRANSLATION_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-written scripts are written in this language. Quality
            varies by language and is not guaranteed.
            {customScript.trim() && language !== "en" && (
              <>
                {" "}
                Your custom script is used as written — language
                applies to AI-written scripts only.
              </>
            )}
          </p>
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
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Script versions</h2>
          <p className="text-sm text-muted-foreground">
            Rewrite keeps the same lines and meaning with fresh
            wording, in the language picked above. Both versions stay
            here — pick the one you want to render. Switching
            versions resets visuals, since the keywords change.
          </p>
          <div className="space-y-3">
            {originalVersion && (
              <div className="space-y-1 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">
                  Original{activeVersion === "original" && " — in use"}
                </p>
                <p className="text-sm">{originalVersion.title}</p>
                {originalVersion.segments.map((s, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    {i + 1}. {s.text}
                  </p>
                ))}
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => switchVersion("original")}
                  disabled={activeVersion === "original"}
                >
                  Use original version
                </button>
              </div>
            )}
            {rewriteVersion ? (
              <div className="space-y-1 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">
                  Rewritten{activeVersion === "rewrite" && " — in use"}
                </p>
                <p className="text-sm">{rewriteVersion.title}</p>
                {rewriteVersion.segments.map((s, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    {i + 1}. {s.text}
                  </p>
                ))}
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => switchVersion("rewrite")}
                  disabled={activeVersion === "rewrite"}
                >
                  Use rewritten version
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => void rewriteScript()}
                disabled={rewriteBusy}
              >
                {rewriteBusy ? "Rewriting…" : "Rewrite script"}
              </button>
            )}
          </div>
          {rewriteVersion && (
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => void rewriteScript()}
              disabled={rewriteBusy}
            >
              {rewriteBusy ? "Rewriting…" : "Rewrite again"}
            </button>
          )}
        </section>
      )}

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
          <div className="space-y-2">
            <p className="text-sm font-medium">Format</p>
            <div className="flex flex-wrap gap-2">
              {GENERATED_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={format === f}
                  className={
                    format === f ? buttonClass : secondaryButtonClass
                  }
                  onClick={() => setFormat(f)}
                >
                  {FORMAT_DIMENSIONS[f].label}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Real output size: {FORMAT_DIMENSIONS[format].width}×
              {FORMAT_DIMENSIONS[format].height} — not a letterbox.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Subtitle style</p>
            <div className="flex flex-wrap gap-2">
              <label className="text-sm">
                Font{" "}
                <select
                  aria-label="Subtitle font"
                  className={inputClass}
                  value={subtitleStyle.font}
                  onChange={(e) =>
                    setSubtitleStyle((prev) => ({
                      ...prev,
                      font: e.target.value,
                    }))
                  }
                >
                  {SUBTITLE_FONTS.map((f) => (
                    <option key={f.stack} value={f.stack}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Position{" "}
                <select
                  aria-label="Subtitle position"
                  className={inputClass}
                  value={subtitleStyle.position}
                  onChange={(e) =>
                    setSubtitleStyle((prev) => ({
                      ...prev,
                      position: e.target.value as SubtitleStyle["position"],
                    }))
                  }
                >
                  <option value="top">Top</option>
                  <option value="middle">Middle</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
              <label className="text-sm">
                Background{" "}
                <select
                  aria-label="Subtitle background"
                  className={inputClass}
                  value={subtitleStyle.background}
                  onChange={(e) =>
                    setSubtitleStyle((prev) => ({
                      ...prev,
                      background: e.target.value as SubtitleStyle["background"],
                    }))
                  }
                >
                  {SUBTITLE_BACKGROUNDS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Color</span>
              {SUBTITLE_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  aria-label={`Subtitle color ${c.label}`}
                  aria-pressed={subtitleStyle.color === c.hex}
                  className={`h-[44px] w-[44px] rounded-lg border-2 ${
                    subtitleStyle.color === c.hex
                      ? "border-primary"
                      : "border-border"
                  }`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() =>
                    setSubtitleStyle((prev) => ({ ...prev, color: c.hex }))
                  }
                />
              ))}
            </div>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
              <input
                type="range"
                aria-label="Subtitle size"
                min={28}
                max={72}
                step={2}
                value={subtitleStyle.size}
                onChange={(e) =>
                  setSubtitleStyle((prev) => ({
                    ...prev,
                    size: Number(e.target.value),
                  }))
                }
              />
              Size: {subtitleStyle.size}px
            </label>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={subtitleStyle.stroke}
                onChange={(e) =>
                  setSubtitleStyle((prev) => ({
                    ...prev,
                    stroke: e.target.checked,
                  }))
                }
              />
              Outlined letters (stroke)
            </label>
            <p
              className="rounded-lg px-3 py-2 text-center text-sm font-bold"
              style={{
                fontFamily: subtitleStyle.font,
                color: subtitleStyle.color,
                backgroundColor:
                  subtitleStyle.background === "dark"
                    ? "rgba(0,0,0,0.68)"
                    : subtitleStyle.background === "light"
                      ? "rgba(255,255,255,0.85)"
                      : "transparent",
                textShadow: subtitleStyle.stroke
                  ? "1px 0 0 rgba(0,0,0,0.9), -1px 0 0 rgba(0,0,0,0.9), 0 1px 0 rgba(0,0,0,0.9), 0 -1px 0 rgba(0,0,0,0.9)"
                  : undefined,
              }}
            >
              Your subtitle style preview
            </p>
            <p className="text-sm text-muted-foreground">
              Preview is approximate — the burned-in caption may
              differ slightly.
            </p>
          </div>
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
          <p className="text-sm text-muted-foreground">
            Rendered in {FORMAT_DIMENSIONS[rendered.format].label} (
            {rendered.width}×{rendered.height}).
          </p>
          <p className="text-sm text-muted-foreground">
            Captions:{" "}
            {SUBTITLE_FONTS.find(
              (f) => f.stack === rendered.subtitleStyle.font,
            )?.label ?? "Sans"}
            , {rendered.subtitleStyle.position},{" "}
            {SUBTITLE_COLORS.find(
              (c) => c.hex === rendered.subtitleStyle.color,
            )?.label ?? rendered.subtitleStyle.color}
            , {rendered.subtitleStyle.size}px
            {rendered.subtitleStyle.stroke ? ", outlined" : ""},{" "}
            {SUBTITLE_BACKGROUNDS.find(
              (b) => b.id === rendered.subtitleStyle.background,
            )?.label ?? rendered.subtitleStyle.background}
            .
          </p>
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
            sourceLine={`AI-generated script (${provider === "custom" ? "supplied by you" : provider === "history" ? "reopened from your generation history" : `via ${provider}`}) + ${segments.filter((s) => s.selected?.kind === "cc").length} free-licence visual(s) from Wikimedia Commons + ${segments.filter((s) => s.selected?.kind === "upload").length} own upload(s).`}
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

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold">Generation history</h2>
        <p className="text-sm text-muted-foreground">
          Saved on this device only — clearing browser data removes
          them. Reopening restores the script, format, language, and
          subtitle style; free-licence visuals come back, but your
          own uploads need uploading again.
        </p>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No generations yet — render a short and it will appear
            here.
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="space-y-1 rounded-lg border border-border p-3"
              >
                <p className="text-sm font-medium">{entry.title}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()} —{" "}
                  {FORMAT_DIMENSIONS[entry.format].label},{" "}
                  {languageName(entry.language)}, {entry.segments.length}{" "}
                  segment{entry.segments.length === 1 ? "" : "s"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Sources:{" "}
                  {entry.segments
                    .map((s) =>
                      s.visual?.kind === "cc"
                        ? `${s.visual.title} (${s.visual.license})`
                        : s.visual
                          ? `${s.visual.name} (your upload)`
                          : "no visual",
                    )
                    .join("; ")}
                </p>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => reopenHistory(entry)}
                >
                  Reopen
                </button>
              </li>
            ))}
          </ul>
        )}
        {serverProjects.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">
              Your saved projects on the server
            </h3>
            <p className="text-sm text-muted-foreground">
              Titles only — segment details are not stored
              server-side, so these entries cannot be reopened here.
            </p>
            <ul className="space-y-1">
              {serverProjects.map((p) => (
                <li key={p.id} className="text-sm text-muted-foreground">
                  {p.title} — {new Date(p.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
