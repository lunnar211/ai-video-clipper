"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptSegment, WordTimestamp } from "@/lib/captions";
import { segmentsToSrt, segmentsToVtt, captionPresetById } from "@/lib/captions";
import type { CropMode } from "@/lib/crop";
import { extractAudioWav, extractAudioSampleWav } from "@/lib/browser/audio";
import { renderClip } from "@/lib/browser/render";
import { sniffVideoFile } from "@/lib/browser/filetype";
import { pickThumbnail } from "@/lib/browser/thumbnails";
import { buildZip } from "@/lib/browser/zip";
import MetadataCard from "@/components/MetadataCard";
import RightsConsent from "@/components/RightsConsent";
import ComplianceChecklist from "@/components/ComplianceChecklist";
import MusicPicker from "@/components/MusicPicker";
import ClipEditor from "@/components/ClipEditor";
import BrandKitPanel from "@/components/BrandKitPanel";
import type { BrandKit } from "@/lib/brandkit";
import { loadBrandKit, saveBrandKit } from "@/lib/brandkit";
import { TRANSLATION_LANGUAGES } from "@/lib/ai/languages";
import type { MomentLike } from "@/lib/pipeline/search";
import type { UserTrack } from "@/lib/music/tracks";
import { userTrackAttribution } from "@/lib/music/tracks";
import { DECLARATION_TEXT_VERSION } from "@/lib/rights/declarations";
import type { MusicMatch } from "@/lib/music/audd";
import {
  FREE_CLIPS_PER_DAY,
  canRenderToday,
  clipsUsedToday,
  recordRenderToday,
  shouldWatermark,
} from "@/lib/usage/quota";
import { takePendingUpload, takePendingCcUrl, takePendingYtUrl } from "@/lib/upload-pending";
import { stageServerCopy } from "@/lib/storage/stage-upload";
import CcPasteImport from "@/components/CcPasteImport";
import YoutubeOwnedImport from "@/components/YoutubeOwnedImport";
import YoutubeJourneySteps from "@/components/YoutubeJourneySteps";
import type { YoutubeOwnedMeta } from "@/lib/imports/youtube-owned-client";
import PostClip from "@/components/PostClip";
import type { CcImportMeta } from "@/lib/imports/cc-types";
import { combineAttributionLines } from "@/lib/rights/attribution";
import type { Moment } from "@/lib/ai/highlights";
import type { AudioTreatment } from "@/lib/browser/audio-plan";
import RightsPanel from "@/components/RightsPanel";
import {
  sourceLicenceLine,
  summarizeMusicChecks,
  buildPanelAttribution,
} from "@/lib/rights/panel";

const MAX_FILE_BYTES = 500 * 1024 * 1024;
const MAX_DURATION_SEC = 600;
const MAX_CLIP_SEC = 180;

type Clip = {
  id: string;
  start: number;
  end: number;
  title: string;
  hashtags: string[];
  source: "ai" | "manual";
  manualCaption?: string;
};

type Rendered = {
  url: string;
  mimeType: string;
  voiceoverOk: boolean;
  /** The clean-audio treatment actually applied at render time. */
  audioTreatment: AudioTreatment;
};

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function downloadBlob(blob: Blob, filename: string): string {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  return url;
}

export default function ClipperTool() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [finding, setFinding] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [renderingId, setRenderingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [rendered, setRendered] = useState<Record<string, Rendered>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState<CropMode>("face");
  const [voiceoverOn, setVoiceoverOn] = useState(false);
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualCaption, setManualCaption] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Lazy initializer (no effect): sessionStorage is read once on the
  // client; on the server it safely defaults to unchecked.
  const [rightsOk, setRightsOk] = useState<boolean>(() => {
    try {
      return (
        typeof window !== "undefined" &&
        sessionStorage.getItem("clipper-rights-consent") === "1"
      );
    } catch {
      return false;
    }
  });
  const [musicTrack, setMusicTrack] = useState<UserTrack | null>(null);
  // ClipForge Phase 15: clean-audio choice for renders from now on.
  // Default "original" keeps today's behaviour exactly; "muted"
  // leaves the video's own audio out; "replaced" is only offered
  // while a licensed track is picked (see the section below).
  const [audioTreatment, setAudioTreatment] =
    useState<AudioTreatment>("original");
  // ClipForge Phase 2: per-project declaration record. The project id
  // is one UUID per browser session; when a database is configured,
  // accepting the checkbox also stores an immutable server record
  // (see /api/rights/declarations). Without one, the record stays
  // session-only and the UI says so — never claimed otherwise.
  const [projectId] = useState<string>(() => {
    try {
      const existing = sessionStorage.getItem("clipper-project-id");
      if (existing) return existing;
      const id = crypto.randomUUID();
      sessionStorage.setItem("clipper-project-id", id);
      return id;
    } catch {
      return crypto.randomUUID();
    }
  });
  const [declarationState, setDeclarationState] = useState<
    "unknown" | "session" | "server"
  >("unknown");
  const [musicCheck, setMusicCheck] = useState<
    Record<string, { status: "checking" | "clear" | "detected" | "unavailable"; match?: MusicMatch }>
  >({});
  const [musicAck, setMusicAck] = useState<Record<string, boolean>>({});
  const [usedToday, setUsedToday] = useState<number>(() => clipsUsedToday());
  // ClipForge Phase 1 state (all additive; existing flow unchanged).
  const [words, setWords] = useState<WordTimestamp[] | null>(null);
  const [targetSeconds, setTargetSeconds] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MomentLike[]>([]);
  const [translateLang, setTranslateLang] = useState("es");
  const [translating, setTranslating] = useState(false);
  const [translatedTranscript, setTranslatedTranscript] = useState<TranscriptSegment[] | null>(null);
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  // ClipForge Phase 11: verified CC-import licence facts for the
  // loaded video (null for direct uploads). Recorded as the
  // project's licence metadata; the attribution line travels with
  // the clips in the ZIP export.
  const [ccImport, setCcImport] = useState<CcImportMeta | null>(null);
  // ClipForge Phase 14: verified own-YouTube facts for the project
  // (null until a link verifies). This is the project's source
  // record for the YouTube flow — it does NOT load a file: the
  // verified video's file still arrives via direct upload. A CC
  // load switches source and clears it; a direct upload keeps it,
  // because that upload is expected to be the Studio download of
  // the verified video.
  const [ytImport, setYtImport] = useState<YoutubeOwnedMeta | null>(null);
  // A CC link handed over from the homepage hero paste tab; the
  // paste panel auto-verifies it once on arrival.
  const [ccInitialUrl, setCcInitialUrl] = useState<string | null>(null);
  // ClipForge Phase 16: a YouTube link handed over from the
  // homepage hero paste tab; the YouTube flow auto-verifies it
  // once on arrival, the same way the CC panel does.
  const [ytInitialUrl, setYtInitialUrl] = useState<string | null>(null);
  const [presetByClip, setPresetByClip] = useState<Record<string, string>>({});
  const [splitBgByClip, setSplitBgByClip] = useState<Record<string, string>>({});
  const [brandKit, setBrandKit] = useState<BrandKit>(() => loadBrandKit());
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});
  const [zipBusy, setZipBusy] = useState(false);
  // ClipForge Phase 10: optional server staging (opt-in only — the
  // video never leaves the browser unless the user presses the button).
  const [stageStatus, setStageStatus] = useState<
    "idle" | "staging" | "staged" | "not-configured" | "error"
  >("idle");
  const [stageError, setStageError] = useState<string | null>(null);
  const [stageProgress, setStageProgress] = useState(0);
  const previewRef = useRef<HTMLVideoElement | null>(null);

  const toggleRights = useCallback(
    (checked: boolean) => {
      setRightsOk(checked);
      try {
        if (checked) {
          sessionStorage.setItem("clipper-rights-consent", "1");
          // Best-effort immutable server record; a 503 (no database)
          // leaves the session record, which the UI labels as such.
          fetch("/api/rights/declarations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              declarationTextVersion: DECLARATION_TEXT_VERSION,
            }),
          })
            .then((res) => setDeclarationState(res.ok ? "server" : "session"))
            .catch(() => setDeclarationState("session"));
        } else {
          sessionStorage.removeItem("clipper-rights-consent");
          setDeclarationState("unknown");
        }
      } catch {
        // ignore storage failures; the in-memory state still gates.
      }
    },
    [projectId],
  );

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const resetForFile = useCallback((f: File) => {
    setError(null);
    setNotice(null);
    setTranscript(null);
    setClips([]);
    setRendered({});
    setDuration(0);
    setWords(null);
    setTranslatedTranscript(null);
    setSearchResults([]);
    setEditingClipId(null);
    setThumbnails({});
    setShareLinks({});
    setStageStatus("idle");
    setStageError(null);
    setStageProgress(0);
    if (f.size > MAX_FILE_BYTES) {
      setError(
        "That file is over 500 MB. The browser cannot hold larger videos — use a shorter or more compressed recording.",
      );
      return;
    }
    if (!f.type.startsWith("video/")) {
      setError("Please choose a video file.");
      return;
    }
    // Magic-byte sniff: a file whose header is readable and not a video
    // container is rejected even if its extension/MIME claims video.
    // "unknown" (unreadable header) is allowed — the decoder is the gate.
    void sniffVideoFile(f).then((sniffed) => {
      if (sniffed === "not-video") {
        setError("That file does not look like a video (header check failed).");
        setFile(null);
        setVideoUrl(null);
      }
    });
    setFile(f);
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  }, []);

  // ClipForge Phase 16: the single direct-upload path, shared by
  // the main upload box and the journey's step-3 picker. A direct
  // upload switches source away from CC (clears ccImport) but
  // KEEPS a verified YouTube record: that upload is expected to
  // be the Studio download of the verified video, and the record
  // attaches to the project automatically. An upload with no
  // verified record stays honestly unverified in the rights panel.
  const handleDirectFile = useCallback(
    (f: File) => {
      setCcImport(null);
      resetForFile(f);
    },
    [resetForFile],
  );

  // Hero upload handoff (Phase 7): a file chosen in the homepage hero
  // is carried in memory to this tool exactly once (take clears it, so
  // StrictMode's double effect invocation cannot consume it twice).
  // Deferred past commit (queueMicrotask) so the mount handoff does
  // not cascade renders during the commit phase. A hero-pasted CC
  // link (Phase 11) travels the same way and auto-verifies below.
  useEffect(() => {
    queueMicrotask(() => {
      const pending = takePendingUpload();
      if (pending) {
        setCcImport(null);
        resetForFile(pending);
      }
      const pendingUrl = takePendingCcUrl();
      if (pendingUrl) setCcInitialUrl(pendingUrl);
      const pendingYt = takePendingYtUrl();
      if (pendingYt) setYtInitialUrl(pendingYt);
    });
  }, [resetForFile]);

  // ClipForge Phase 11: a CC-verified file loads through the same
  // reset path as a direct upload (same size/type/header/duration
  // gates), with its licence facts recorded alongside.
  const loadCcFile = useCallback(
    (f: File, meta: CcImportMeta) => {
      setCcImport(meta);
      setYtImport(null);
      resetForFile(f);
    },
    [resetForFile],
  );

  const onMetadata = useCallback(() => {
    const v = previewRef.current;
    if (!v) return;
    if (Number.isFinite(v.duration)) {
      if (v.duration > MAX_DURATION_SEC) {
        setError(
          `That video is ${fmtTime(v.duration)} long. This tool handles videos up to 10 minutes — trim it first, then upload again.`,
        );
        setFile(null);
        setVideoUrl(null);
        return;
      }
      setDuration(v.duration);
    }
  }, []);

  // ClipForge Phase 10: optional server staging. Never runs on file
  // pick — only when the user presses the button, because staging
  // sends the full video to server storage (unlike the default
  // browser flow, where only the audio track leaves for transcription).
  const stageToServer = useCallback(async () => {
    if (!file || stageStatus === "staging") return;
    setStageError(null);
    setStageProgress(0);
    setStageStatus("staging");
    try {
      const result = await stageServerCopy(file, {
        onProgress: (uploaded, total) =>
          setStageProgress(total > 0 ? Math.round((uploaded / total) * 100) : 0),
      });
      if (result.staged) {
        setStageProgress(100);
        setStageStatus("staged");
      } else {
        setStageStatus("not-configured");
      }
    } catch (error) {
      setStageError(
        error instanceof Error ? error.message : "Server staging failed.",
      );
      setStageStatus("error");
    }
  }, [file, stageStatus]);

  const transcribe = useCallback(async () => {
    if (!file) return;
    if (!rightsOk) {
      setError(
        "Confirm that you own or have licensed this video and its music before transcription runs.",
      );
      return;
    }
    setError(null);
    setNotice(null);
    setTranscribing(true);
    try {
      const wav = await extractAudioWav(file);
      const form = new FormData();
      form.append("audio", wav, "audio.wav");
      form.append("words", "1");
      const res = await fetch("/api/clips/transcribe", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        segments?: TranscriptSegment[];
        words?: WordTimestamp[];
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 503) {
          setNotice(
            "AI is not connected yet (no transcription key on the server). You can still cut clips by hand below — nothing is blocked.",
          );
        } else {
          setError(data.error ?? "Transcription failed.");
        }
        return;
      }
      setTranscript(data.segments ?? []);
      setWords(data.words ?? null);
      setNotice(
        `Transcript ready: ${(data.segments ?? []).length} segments. Now find highlights, or cut clips by hand.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not read the audio: ${err.message}`
          : "Could not read the audio.",
      );
    } finally {
      setTranscribing(false);
    }
  }, [file, rightsOk]);

  const findHighlights = useCallback(async () => {
    if (!transcript || duration <= 0) return;
    setError(null);
    setNotice(null);
    setFinding(true);
    try {
      const res = await fetch("/api/clips/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          duration,
          maxClips: 5,
          targetSeconds: targetSeconds ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        moments?: Moment[];
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 503) {
          setNotice(
            "AI is not connected yet (no highlight key on the server). You can still cut clips by hand below.",
          );
        } else {
          setError(data.error ?? "Highlight selection failed.");
        }
        return;
      }
      const moments = data.moments ?? [];
      if (moments.length === 0) {
        setNotice(
          "The AI found no moments worth clipping in this transcript. Try cutting clips by hand below.",
        );
        return;
      }
      setClips(
        moments.map((m) => ({
          id: crypto.randomUUID(),
          start: m.start,
          end: m.end,
          title: m.title,
          hashtags: m.hashtags,
          source: "ai" as const,
        })),
      );
      setNotice(`${moments.length} highlight clips ready. Render any of them below.`);
    } catch {
      setError("Highlight selection failed (network error).");
    } finally {
      setFinding(false);
    }
  }, [transcript, duration, targetSeconds]);

  const addManualClip = useCallback(() => {
    setError(null);
    const start = Number(manualStart);
    const end = Number(manualEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      setError("Enter start and end times in seconds.");
      return;
    }
    if (start < 0 || end <= start || end > duration) {
      setError(`Times must satisfy 0 ≤ start < end ≤ ${fmtTime(duration)}.`);
      return;
    }
    if (end - start > MAX_CLIP_SEC) {
      setError("Clips are capped at 3 minutes — pick a shorter range.");
      return;
    }
    setClips((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        start,
        end,
        title: manualTitle.trim() || `Clip ${fmtTime(start)}–${fmtTime(end)}`,
        hashtags: [],
        source: "manual",
        manualCaption: manualCaption.trim() || undefined,
      },
    ]);
    setManualStart("");
    setManualEnd("");
    setManualTitle("");
    setManualCaption("");
  }, [manualStart, manualEnd, manualTitle, manualCaption, duration]);

  const renderOne = useCallback(
    async (clip: Clip) => {
      if (!videoUrl) return;
      if (!rightsOk) {
        setError(
          "Confirm that you own or have licensed this video and its music before rendering runs.",
        );
        return;
      }
      if (!canRenderToday()) {
        setError(
          `Free tier limit reached: ${FREE_CLIPS_PER_DAY} clips per day. Paid tiers are not configured yet — try again tomorrow.`,
        );
        return;
      }
      setError(null);
      setNotice(null);
      setRenderingId(clip.id);
      setProgress(0);
      try {
        let voiceoverUrl: string | undefined;
        if (voiceoverOn) {
          const res = await fetch("/api/clips/voiceover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: clip.title }),
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
        const result = await renderClip({
          videoUrl,
          start: clip.start,
          end: clip.end,
          cropMode,
          captions: translatedTranscript ?? transcript ?? [],
          manualCaption: clip.manualCaption,
          voiceoverUrl,
          musicUrl: musicTrack?.url,
          audioTreatment,
          watermark: shouldWatermark("free"),
          captionPreset: {
            ...captionPresetById(presetByClip[clip.id] ?? "pop"),
            fontFamily: brandKit.fontFamily,
          },
          words: words
            ? words
                .filter((w) => w.end > clip.start && w.start < clip.end)
                .map((w) => ({
                  word: w.word,
                  start: Math.max(0, w.start - clip.start),
                  end: Math.min(clip.end - clip.start, w.end - clip.start),
                }))
            : undefined,
          brandLogoUrl: brandKit.logoUrl,
          brandWatermarkText: brandKit.watermarkEnabled
            ? brandKit.watermarkText
            : undefined,
          splitBackgroundUrl: splitBgByClip[clip.id],
          onProgress: setProgress,
        });
        recordRenderToday();
        setUsedToday(clipsUsedToday());
        const url = URL.createObjectURL(result.blob);
        setRendered((prev) => ({
          ...prev,
          [clip.id]: {
            url,
            mimeType: result.mimeType,
            voiceoverOk: voiceoverUrl ? result.voiceoverOk : true,
            audioTreatment: result.audioTreatment,
          },
        }));
        if (voiceoverUrl) URL.revokeObjectURL(voiceoverUrl);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Rendering failed.",
        );
      } finally {
        setRenderingId(null);
      }
    },
    [videoUrl, cropMode, transcript, translatedTranscript, voiceoverOn, rightsOk, musicTrack, audioTreatment, presetByClip, brandKit, splitBgByClip, words],
  );

  const checkMusic = useCallback(
    async (clip: Clip) => {
      if (!file) return;
      setMusicCheck((prev) => ({
        ...prev,
        [clip.id]: { status: "checking" },
      }));
      try {
        const sample = await extractAudioSampleWav(file, clip.start, 15);
        const form = new FormData();
        form.append("audio", sample, "sample.wav");
        const res = await fetch("/api/clips/music", {
          method: "POST",
          body: form,
        });
        const data = (await res.json().catch(() => ({}))) as {
          detected?: boolean;
          match?: MusicMatch;
          error?: string;
        };
        if (res.status === 503) {
          setMusicCheck((prev) => ({
            ...prev,
            [clip.id]: { status: "unavailable" },
          }));
          setNotice(
            "Music detection is not connected yet (no recognition key on the server). No warning can be given for this clip.",
          );
          return;
        }
        if (!res.ok) {
          setError(data.error ?? "Music detection failed.");
          setMusicCheck((prev) => {
            const next = { ...prev };
            delete next[clip.id];
            return next;
          });
          return;
        }
        setMusicCheck((prev) => ({
          ...prev,
          [clip.id]: data.detected
            ? { status: "detected", match: data.match }
            : { status: "clear" },
        }));
      } catch (err) {
        setError(
          err instanceof Error
            ? `Could not check the music: ${err.message}`
            : "Could not check the music.",
        );
      }
    },
    [file],
  );

  const downloadSrt = useCallback(
    (clip: Clip) => {
      if (!transcript) return;
      const srt = segmentsToSrt(transcript, clip.start, clip.end);
      downloadBlob(new Blob([srt], { type: "text/plain" }), `${clip.id}.srt`);
    },
    [transcript],
  );

  // ClipForge Phase 1 callbacks (additive).
  const runSearch = useCallback(async () => {
    if (!transcript || !searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/clips/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, query: searchQuery, duration }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        windows?: MomentLike[];
        source?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Search failed.");
        return;
      }
      setSearchResults(data.windows ?? []);
      setNotice(
        `Found ${data.windows?.length ?? 0} clip windows (${data.source === "llm" ? "AI reranked" : "keyword match"}).`,
      );
    } catch {
      setError("Search failed (network error).");
    } finally {
      setSearching(false);
    }
  }, [transcript, searchQuery, duration]);

  const runTranslate = useCallback(async () => {
    if (!transcript) return;
    setTranslating(true);
    setError(null);
    try {
      const res = await fetch("/api/clips/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: transcript, targetLanguage: translateLang }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        segments?: TranscriptSegment[];
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 503) {
          setNotice("Translation needs an AI key on the server — captions stay in the original language.");
        } else {
          setError(data.error ?? "Translation failed.");
        }
        return;
      }
      setTranslatedTranscript(data.segments ?? []);
      setNotice("Captions translated. Rendered clips now use the translated captions.");
    } catch {
      setError("Translation failed (network error).");
    } finally {
      setTranslating(false);
    }
  }, [transcript, translateLang]);

  const downloadVtt = useCallback(
    (clip: Clip) => {
      const src = translatedTranscript ?? transcript;
      if (!src) return;
      const vtt = segmentsToVtt(src, clip.start, clip.end);
      downloadBlob(new Blob([vtt], { type: "text/vtt" }), `${clip.id}.vtt`);
    },
    [transcript, translatedTranscript],
  );

  const downloadAllZip = useCallback(async () => {
    const outs = clips.filter((c) => rendered[c.id]);
    if (outs.length === 0) return;
    setZipBusy(true);
    try {
      const entries: Array<{ name: string; data: Uint8Array }> = [];
      const src = translatedTranscript ?? transcript;
      for (const clip of outs) {
        const out = rendered[clip.id];
        const buf = await (await fetch(out.url)).arrayBuffer();
        const ext = out.mimeType.includes("mp4") ? "mp4" : "webm";
        entries.push({ name: `${clip.id}.${ext}`, data: new Uint8Array(buf) });
        if (src) {
          entries.push({
            name: `${clip.id}.srt`,
            data: new TextEncoder().encode(segmentsToSrt(src, clip.start, clip.end)),
          });
        }
      }
      // The music credit travels with the clips when attribution is
      // required (ClipForge Phase 2); a CC-import credit joins it in
      // the same file (ClipForge Phase 11).
      const attribution = combineAttributionLines([
        musicTrack ? userTrackAttribution(musicTrack) : null,
        ccImport ? ccImport.attribution : null,
      ]);
      if (attribution) {
        entries.push({
          name: "ATTRIBUTION.txt",
          data: new TextEncoder().encode(`${attribution}\n`),
        });
      }
      const zip = buildZip(entries);
      downloadBlob(
        new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }),
        "clips.zip",
      );
    } catch {
      setError("ZIP download failed.");
    } finally {
      setZipBusy(false);
    }
  }, [clips, rendered, transcript, translatedTranscript, musicTrack, ccImport]);

  const makeThumbnail = useCallback(
    async (clip: Clip) => {
      const v = previewRef.current;
      if (!v) return;
      const thumb = await pickThumbnail(v, clip.start, clip.end, clip.title);
      if (thumb) {
        setThumbnails((prev) => ({ ...prev, [clip.id]: thumb.dataUrl }));
      } else {
        setNotice("Thumbnail could not be picked from this video.");
      }
    },
    [],
  );

  const makeShare = useCallback(
    async (clip: Clip) => {
      setError(null);
      try {
        const res = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: clip.title,
            clipStart: clip.start,
            clipEnd: clip.end,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "Share link failed.");
          return;
        }
        if (data.url) {
          setShareLinks((prev) => ({ ...prev, [clip.id]: data.url as string }));
        }
      } catch {
        setError("Share link failed (network error).");
      }
    },
    [],
  );

  const saveClipEdit = useCallback((clipId: string, start: number, end: number) => {
    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, start, end } : c)),
    );
  }, []);

  const splitClip = useCallback(
    (clipId: string, parts: Array<{ start: number; end: number; title: string }>) => {
      setClips((prev) => {
        const rest = prev.filter((c) => c.id !== clipId);
        const added: Clip[] = parts.map((p) => ({
          id: crypto.randomUUID(),
          start: p.start,
          end: p.end,
          title: p.title,
          hashtags: [],
          source: "manual" as const,
        }));
        return [...rest, ...added];
      });
      setEditingClipId(null);
      setNotice(`${parts.length} clips created from the split.`);
    },
    [],
  );

  const handleBrandKitChange = useCallback((kit: BrandKit) => {
    setBrandKit(kit);
    // Logo object URLs do not survive a reload — persist everything else.
    const { logoUrl: _logo, ...persisted } = kit;
    void _logo;
    saveBrandKit({ ...persisted, logoUrl: undefined });
  }, []);

  const copyText = useCallback(async (clip: Clip) => {
    const text = [clip.title, clip.hashtags.join(" ")]
      .filter(Boolean)
      .join("\n");
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
    setCopiedId(clip.id);
    setTimeout(() => setCopiedId((v) => (v === clip.id ? null : v)), 2000);
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <strong>Clip your own videos only</strong> — you must own the rights
        to the video you clip, or use a link to a video with a verified
        free licence. This tool never downloads videos from YouTube,
        TikTok, or Instagram, and your video never leaves this browser
        except for the audio sent for transcription (see FAQ).
      </div>

      <RightsConsent checked={rightsOk} onChange={toggleRights} />
      {rightsOk && declarationState === "server" && (
        <p className="text-sm text-emerald-800 dark:text-emerald-300">
          Declaration stored server-side as an immutable record for
          this project.
        </p>
      )}
      {rightsOk && declarationState !== "server" && (
        <p className="text-sm text-muted-foreground">
          Session-only record: the immutable server record activates
          once database setup lands — until then this confirmation
          lives only in this browser session.
        </p>
      )}
      {!rightsOk && (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Transcription and rendering are blocked until you confirm the
          rights checkbox above.
        </p>
      )}

      <div
        id="upload-dropzone"
        className="scroll-mt-24 rounded-xl border-2 border-dashed border-border bg-card p-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleDirectFile(f);
        }}
      >
        <p className="font-medium">Drop your video here, or choose a file</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Up to 10 minutes, up to 500 MB. MP4, MOV, WebM and other browser
          formats. The video stays in this browser.
        </p>
        <input
          className="mt-4 block w-full max-w-full"
          type="file"
          accept="video/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleDirectFile(f);
          }}
        />
        {file && (
          <p className="mt-3 text-sm text-muted-foreground">
            {file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB
            {duration > 0 && ` — ${fmtTime(duration)}`}
          </p>
        )}
        {ytImport && !file && (
          <p className="mt-3 text-sm text-muted-foreground">
            Verified video: “{ytImport.videoTitle}” — upload its
            Studio download here.
          </p>
        )}
        {ytImport && file && (
          <p className="mt-3 text-sm text-muted-foreground">
            Your verified source record is attached to this project.
          </p>
        )}
      </div>

      {/* Paste a video link (Phase 11): CC-verified import only —
          Wikimedia Commons or Internet Archive, licence checked
          before anything loads. Any other host is refused. */}
      <div className="rounded-xl bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Paste a video link</h2>
        <div className="mt-3">
          <CcPasteImport
            onLoad={loadCcFile}
            initialUrl={ccInitialUrl}
            autoVerify={ccInitialUrl !== null}
          />
        </div>
        {ccImport && (
          <p className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            Loaded from a verified free licence: “{ccImport.title}” by{" "}
            {ccImport.author}, {ccImport.license}. This attribution
            travels with your clips in the ZIP export.
          </p>
        )}
      </div>

      {/* Your YouTube video (Phase 14 + Phase 16 guided journey):
          the UI for the Phase 8 own-YouTube ownership check.
          Signed-in users with a connected channel paste their own
          link; the server proves the video sits on their channel.
          This verifies ownership ONLY — the video itself is never
          downloaded from YouTube. The file still arrives via direct
          upload: the owner downloads their own video from YouTube
          Studio and uploads it in the box above (or in step 3
          below). Phase 16 turns the flow into numbered steps that
          stay visible, so verification, Studio download, and upload
          read as one journey instead of three separate boxes. */}
      <div
        id="your-youtube-video"
        className="scroll-mt-24 rounded-xl bg-card p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold">Your YouTube video</h2>
        <div className="mt-3">
          <YoutubeJourneySteps
            verified={ytImport}
            fileName={file?.name ?? null}
            onUploadFile={handleDirectFile}
          />
        </div>
        <div className="mt-3">
          <YoutubeOwnedImport
            onVerified={setYtImport}
            initialUrl={ytInitialUrl}
            autoVerify={ytInitialUrl !== null}
          />
        </div>
        {ytImport && (
          <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <p className="font-semibold">Ownership verified.</p>
            <p className="mt-1">
              “{ytImport.videoTitle}” is on your connected channel “
              {ytImport.channelTitle}”.
            </p>
            <p className="mt-2">
              Next step — get the file: in{" "}
              <a
                href="https://studio.youtube.com"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                YouTube Studio
              </a>
              , open Content, use the ⋮ menu on this video, and
              choose Download. Then{" "}
              <a href="#upload-dropzone" className="underline">
                upload that file above
              </a>{" "}
              — the tool never pulls the video from YouTube itself.
            </p>
            <button
              type="button"
              className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors duration-200 hover:opacity-90"
              onClick={() => setYtImport(null)}
            >
              Verify a different video
            </button>
          </div>
        )}
      </div>

      {/* Clean audio + rights check (Phase 15): the audio treatment
          applies to every render from now on (default keeps today's
          behaviour). "Replace" is offered only while a licensed
          track is picked — the site ships no built-in tracks, so
          without one the choice is hidden, not faked. The panel
          below states exactly what the tool knows before export. */}
      <div className="rounded-xl bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Clean audio</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose what happens to the video&apos;s own audio when a
          clip renders. This applies to renders from now on — clips
          already rendered keep the treatment they were made with.
        </p>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="audio-treatment"
              value="original"
              checked={audioTreatment === "original"}
              onChange={() => setAudioTreatment("original")}
            />
            Keep original audio
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="audio-treatment"
              value="muted"
              checked={audioTreatment === "muted"}
              onChange={() => setAudioTreatment("muted")}
            />
            Mute original audio
          </label>
          {musicTrack && (
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="audio-treatment"
                value="replaced"
                checked={audioTreatment === "replaced"}
                onChange={() => setAudioTreatment("replaced")}
              />
              Replace original audio with my licensed track (
              {musicTrack.name})
            </label>
          )}
        </div>
        {audioTreatment === "muted" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Muted renders carry no original audio track. Voiceover
            narration, if enabled, still plays.
          </p>
        )}
        {audioTreatment === "replaced" && musicTrack && (
          <p className="mt-2 text-sm text-muted-foreground">
            The licensed track plays at full volume as the soundtrack,
            and its credit ships in the export.
          </p>
        )}
        {!musicTrack && (
          <p className="mt-2 text-sm text-muted-foreground">
            To replace the audio instead of muting it, pick a licensed
            track in the music picker (it appears once clips are
            ready).
          </p>
        )}
        <div className="mt-4">
          <RightsPanel
            sourceLine={sourceLicenceLine({
              ccImport,
              ytImport,
              rightsOk,
            })}
            checkLines={summarizeMusicChecks(musicCheck)}
            treatment={audioTreatment}
            trackName={musicTrack?.name ?? null}
            trackLicence={musicTrack?.licence ?? null}
            trackCredit={
              musicTrack ? userTrackAttribution(musicTrack) : null
            }
            voiceoverOn={voiceoverOn}
            renderedTreatments={Object.values(rendered).map(
              (r) => r.audioTreatment,
            )}
            attribution={buildPanelAttribution({ musicTrack, ccImport })}
          />
        </div>
      </div>

      {/* Optional server copy (Phase 10): the first UI caller of the
          chunked-upload client. Opt-in only — without it, the video
          never leaves this browser. */}
      {file && (
        <div className="rounded-xl bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Server copy (optional)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Save a server copy of this video for future publishing. This
            uploads the full video to server storage in 8 MB chunks.
            Without it, your video never leaves this browser.
          </p>
          <button
            className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors duration-200 hover:opacity-90 active:opacity-80 disabled:opacity-50"
            onClick={stageToServer}
            disabled={stageStatus === "staging" || stageStatus === "staged"}
          >
            {stageStatus === "staging"
              ? `Staging… ${stageProgress}%`
              : stageStatus === "staged"
                ? "Server copy saved"
                : "Stage a server copy"}
          </button>
          {stageStatus === "staged" && (
            <p className="mt-2 text-sm text-muted-foreground">
              Server copy saved. Publishing and sharing can use it later;
              clipping itself still runs in this browser.
            </p>
          )}
          {stageStatus === "not-configured" && (
            <p className="mt-2 text-sm text-muted-foreground">
              Server storage is not set up yet — your video stays in this
              browser, and everything still works.
            </p>
          )}
          {stageStatus === "error" && stageError && (
            <p className="mt-2 text-sm text-red-800 dark:text-red-200">
              Staging failed: {stageError} Nothing was reported as saved.
            </p>
          )}
        </div>
      )}

      {videoUrl && (
        <video
          ref={previewRef}
          src={videoUrl}
          controls
          onLoadedMetadata={onMetadata}
          className="max-h-80 w-full rounded-xl bg-black"
        />
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
          {notice}
        </div>
      )}

      {file && duration > 0 && (
        <section
          id="transcribe"
          className="scroll-mt-24 space-y-3 rounded-xl bg-card p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold">1. AI transcript &amp; highlights</h2>
          <p className="text-sm text-muted-foreground">
            Transcription sends only the audio track to the server (Groq
            Whisper). Highlight picking sends only transcript text. If no AI
            key is configured, both steps say so honestly — step 2 below
            always works.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors duration-200 hover:opacity-90 active:opacity-80 disabled:opacity-50"
              onClick={transcribe}
              disabled={transcribing || !rightsOk}
            >
              {transcribing ? "Transcribing…" : "Transcribe with AI"}
            </button>
            <button
              className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors duration-200 hover:opacity-90 active:opacity-80 disabled:opacity-50"
              onClick={findHighlights}
              disabled={finding || !transcript}
            >
              {finding ? "Finding highlights…" : "Find highlight clips"}
            </button>
            <label className="flex items-center gap-2 text-sm">
              Clip length target
              <select
                className="rounded border border-border px-2 py-1"
                value={targetSeconds ?? ""}
                onChange={(e) =>
                  setTargetSeconds(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">Default (15–60s)</option>
                <option value="15">15s</option>
                <option value="30">30s</option>
                <option value="60">60s</option>
              </select>
            </label>
          </div>
          {transcript && (
            <div className="space-y-3 border-t pt-3">
              <div className="flex flex-wrap items-end gap-3 text-sm">
                <label className="flex flex-col">
                  Find clips about…
                  <input
                    className="mt-1 rounded border border-border bg-background px-2 py-1"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g. pasta sauce"
                  />
                </label>
                <button
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-4 py-2 font-medium text-foreground transition-colors duration-200 hover:bg-muted disabled:opacity-50"
                  onClick={runSearch}
                  disabled={searching || searchQuery.trim().length < 3}
                >
                  {searching ? "Searching…" : "Search transcript"}
                </button>
                <label className="flex items-center gap-2">
                  Translate captions to
                  <select
                    className="rounded border border-border px-2 py-1"
                    value={translateLang}
                    onChange={(e) => setTranslateLang(e.target.value)}
                  >
                    {TRANSLATION_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-4 py-2 font-medium text-foreground transition-colors duration-200 hover:bg-muted disabled:opacity-50"
                  onClick={runTranslate}
                  disabled={translating}
                >
                  {translating ? "Translating…" : "Translate"}
                </button>
                {translatedTranscript && (
                  <button
                    className="rounded border border-border px-3 py-2"
                    onClick={() => setTranslatedTranscript(null)}
                  >
                    Use original captions
                  </button>
                )}
              </div>
              {searchResults.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {searchResults.map((w, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 rounded border border-border p-2">
                      <span>
                        {fmtTime(w.start)} – {fmtTime(w.end)} · {w.title}
                      </span>
                      <button
                        className="rounded border border-border px-2 py-1"
                        onClick={() =>
                          setClips((prev) => [
                            ...prev,
                            {
                              id: crypto.randomUUID(),
                              start: w.start,
                              end: w.end,
                              title: w.title,
                              hashtags: [],
                              source: "manual",
                            },
                          ])
                        }
                      >
                        Add as clip
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {transcript && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                Transcript ({transcript.length} segments)
              </summary>
              <div className="mt-2 max-h-48 space-y-1 overflow-auto">
                {transcript.map((s, i) => (
                  <p key={i} className="text-muted-foreground">
                    <span className="text-muted-foreground">
                      [{fmtTime(s.start)}]{" "}
                    </span>
                    {s.text}
                  </p>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {file && duration > 0 && (
        <section className="space-y-3 rounded-xl bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">
            2. Cut a clip by hand (always works, no AI needed)
          </h2>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col">
              Start (seconds)
              <input
                className="mt-1 rounded border border-border bg-background px-2 py-1"
                inputMode="decimal"
                value={manualStart}
                onChange={(e) => setManualStart(e.target.value)}
                placeholder="e.g. 12"
              />
            </label>
            <label className="flex flex-col">
              End (seconds)
              <input
                className="mt-1 rounded border border-border bg-background px-2 py-1"
                inputMode="decimal"
                value={manualEnd}
                onChange={(e) => setManualEnd(e.target.value)}
                placeholder="e.g. 58"
              />
            </label>
            <label className="flex flex-col">
              Title (optional)
              <input
                className="mt-1 rounded border border-border bg-background px-2 py-1"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
              />
            </label>
            <label className="flex flex-col">
              Caption shown on the clip (optional)
              <input
                className="mt-1 rounded border border-border bg-background px-2 py-1"
                value={manualCaption}
                onChange={(e) => setManualCaption(e.target.value)}
              />
            </label>
            <button
              className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-4 py-2 font-medium text-foreground transition-colors duration-200 hover:bg-muted"
              onClick={addManualClip}
            >
              Add clip
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Clips are capped at 3 minutes so rendering stays fast in the
            browser.
          </p>
        </section>
      )}

      {file && duration > 0 && (
        <BrandKitPanel kit={brandKit} onChange={handleBrandKitChange} />
      )}

      {clips.length > 0 && (
        <section className="space-y-4 rounded-xl bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">3. Render vertical clips</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              Crop
              <select
                className="rounded border border-border px-2 py-1"
                value={cropMode}
                onChange={(e) => setCropMode(e.target.value as CropMode)}
              >
                <option value="face">Face-centered (auto)</option>
                <option value="track">Face-tracked (per-second)</option>
                <option value="smart">Smart crop (auto)</option>
                <option value="center">Center</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={voiceoverOn}
                onChange={(e) => setVoiceoverOn(e.target.checked)}
              />
              AI voiceover reads the title (needs a voice key; otherwise
              you get an honest message and the original audio)
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Face-centered uses on-device face detection and falls back to
            smart crop, then centre. Output is 720×1280 vertical video —
            MP4 where your browser supports it, otherwise WebM.
          </p>
          <p className="text-xs text-muted-foreground">
            Free tier: {Math.max(0, FREE_CLIPS_PER_DAY - usedToday)} of{" "}
            {FREE_CLIPS_PER_DAY} clips left today. Free clips carry a
            small “AI Video Clipper” watermark; paid tiers are not
            configured yet.
          </p>
          {Object.keys(rendered).length > 0 && (
            <button
              className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted disabled:opacity-50"
              onClick={downloadAllZip}
              disabled={zipBusy}
            >
              {zipBusy ? "Zipping…" : "Download all clips + captions (ZIP)"}
            </button>
          )}
          <MusicPicker
            selected={musicTrack}
            onSelect={(t) => {
              setMusicTrack(t);
              // Dropping the track while "replaced" is chosen falls
              // back to "muted" — replace needs a real track.
              if (!t && audioTreatment === "replaced")
                setAudioTreatment("muted");
            }}
          />
          <ul className="space-y-4">
            {clips.map((clip) => {
              const out = rendered[clip.id];
              return (
                <li key={clip.id} className="rounded-lg border border-border p-4">
                  <p className="font-medium">{clip.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {fmtTime(clip.start)} – {fmtTime(clip.end)} ·{" "}
                    {clip.source === "ai" ? "AI highlight" : "Manual"}
                    {clip.hashtags.length > 0 && ` · ${clip.hashtags.join(" ")}`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    <button
                      className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-primary px-3 py-1.5 font-medium text-on-primary transition-colors duration-200 hover:opacity-90 active:opacity-80 disabled:opacity-50"
                      onClick={() => renderOne(clip)}
                      disabled={renderingId !== null || !rightsOk}
                    >
                      {renderingId === clip.id
                        ? `Rendering… ${Math.round(progress * 100)}%`
                        : "Render clip"}
                    </button>
                    <button
                      className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-3 py-1.5 text-foreground transition-colors duration-200 hover:bg-muted"
                      onClick={() => checkMusic(clip)}
                      disabled={musicCheck[clip.id]?.status === "checking"}
                    >
                      {musicCheck[clip.id]?.status === "checking"
                        ? "Checking music…"
                        : "Check music"}
                    </button>
                    {transcript && (
                      <button
                        className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-3 py-1.5 text-foreground transition-colors duration-200 hover:bg-muted"
                        onClick={() => downloadSrt(clip)}
                      >
                        Download SRT captions
                      </button>
                    )}
                    {transcript && (
                      <button
                        className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-3 py-1.5 text-foreground transition-colors duration-200 hover:bg-muted"
                        onClick={() => downloadVtt(clip)}
                      >
                        Download VTT captions
                      </button>
                    )}
                    <button
                      className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-3 py-1.5 text-foreground transition-colors duration-200 hover:bg-muted"
                      onClick={() =>
                        setEditingClipId(editingClipId === clip.id ? null : clip.id)
                      }
                    >
                      {editingClipId === clip.id ? "Close editor" : "Edit clip"}
                    </button>
                    <button
                      className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-3 py-1.5 text-foreground transition-colors duration-200 hover:bg-muted"
                      onClick={() => makeThumbnail(clip)}
                    >
                      Make thumbnail
                    </button>
                    {out && (
                      <button
                        className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-3 py-1.5 text-foreground transition-colors duration-200 hover:bg-muted"
                        onClick={() => makeShare(clip)}
                      >
                        Share link
                      </button>
                    )}
                    <button
                      className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-3 py-1.5 text-foreground transition-colors duration-200 hover:bg-muted"
                      onClick={() => copyText(clip)}
                    >
                      {copiedId === clip.id ? "Copied!" : "Copy title + hashtags"}
                    </button>
                  </div>
                  {editingClipId === clip.id && videoUrl && (
                    <ClipEditor
                      videoUrl={videoUrl}
                      clip={clip}
                      transcript={translatedTranscript ?? transcript ?? []}
                      words={words ?? undefined}
                      file={file}
                      presetId={presetByClip[clip.id] ?? "pop"}
                      onSave={(s, e) => saveClipEdit(clip.id, s, e)}
                      onSplit={(parts) => splitClip(clip.id, parts)}
                      onPresetChange={(pid) =>
                        setPresetByClip((prev) => ({ ...prev, [clip.id]: pid }))
                      }
                      onSetSplitBackground={(url) =>
                        setSplitBgByClip((prev) => {
                          const next = { ...prev };
                          if (url) next[clip.id] = url;
                          else delete next[clip.id];
                          return next;
                        })
                      }
                      onClose={() => setEditingClipId(null)}
                    />
                  )}
                  {thumbnails[clip.id] && (
                    <div className="mt-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbnails[clip.id]}
                        alt={`Thumbnail for ${clip.title}`}
                        className="w-32 rounded-lg"
                      />
                      <a
                        className="mt-1 block text-sm font-medium text-primary underline"
                        href={thumbnails[clip.id]}
                        download={`${clip.id}-thumbnail.jpg`}
                      >
                        Download thumbnail
                      </a>
                    </div>
                  )}
                  {shareLinks[clip.id] && (
                    <p className="mt-3 text-sm">
                      Share link:{" "}
                      <a
                        className="font-medium text-primary underline"
                        href={shareLinks[clip.id]}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shareLinks[clip.id]}
                      </a>{" "}
                      (public to anyone with the link; views are counted)
                    </p>
                  )}
                  {musicCheck[clip.id]?.status === "detected" && (
                    <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                      <strong>Copyrighted music detected in this clip.</strong>{" "}
                      {musicCheck[clip.id].match
                        ? `${musicCheck[clip.id].match!.artist} — ${musicCheck[clip.id].match!.title}. `
                        : ""}
                      Posting this clip with that music may get it muted,
                      blocked, or struck. This check is a detection aid,
                      not legal advice. The download stays hidden until
                      you acknowledge the risk.
                      <label className="mt-2 flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={!!musicAck[clip.id]}
                          onChange={(e) =>
                            setMusicAck((prev) => ({
                              ...prev,
                              [clip.id]: e.target.checked,
                            }))
                          }
                        />
                        I understand the risk and still want the download.
                      </label>
                    </div>
                  )}
                  {musicCheck[clip.id]?.status === "clear" && (
                    <p className="mt-3 text-sm text-emerald-800 dark:text-emerald-300">
                      Music check: no known recorded music detected in this
                      clip&apos;s sample.
                    </p>
                  )}
                  {musicCheck[clip.id]?.status === "unavailable" && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Not scanned — no recognition key is connected, so
                      this clip has not been checked. Unscanned does
                      not mean clear.
                    </p>
                  )}
                  {out &&
                    !(
                      musicCheck[clip.id]?.status === "detected" &&
                      !musicAck[clip.id]
                    ) && (
                    <div className="mt-3 text-sm">
                      <a
                        className="font-medium text-primary underline"
                        href={out.url}
                        download={`${clip.id}.${out.mimeType.includes("mp4") ? "mp4" : "webm"}`}
                      >
                        Download clip ({out.mimeType})
                      </a>
                      {!out.voiceoverOk && (
                        <span className="ml-2 text-amber-700 dark:text-amber-300">
                          {out.audioTreatment === "muted"
                            ? "Voiceover did not play — this clip has no original audio (muted)."
                            : out.audioTreatment === "replaced"
                              ? "Voiceover did not play — this clip carries the licensed track only."
                              : "Voiceover did not play — clip has original audio only."}
                        </span>
                      )}
                    </div>
                  )}
                  {out &&
                    !(
                      musicCheck[clip.id]?.status === "detected" &&
                      !musicAck[clip.id]
                    ) && (
                    <PostClip
                      clipId={clip.id}
                      title={clip.title}
                      hashtags={clip.hashtags}
                      mimeType={out.mimeType}
                      getBlob={async () =>
                        fetch(out.url).then((r) => r.blob())
                      }
                    />
                  )}
                  <MetadataCard transcript={transcript ?? []} clip={clip} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {clips.length > 0 && (
        <ComplianceChecklist
          projectId={projectId}
          declarationAccepted={rightsOk}
          clips={clips.map((c) => ({ id: c.id, title: c.title }))}
          musicCheck={musicCheck}
          musicLicence={musicTrack?.licence ?? null}
        />
      )}
    </div>
  );
}
