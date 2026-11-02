"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptSegment } from "@/lib/captions";
import { segmentsToSrt } from "@/lib/captions";
import type { CropMode } from "@/lib/crop";
import { extractAudioWav, extractAudioSampleWav } from "@/lib/browser/audio";
import { renderClip } from "@/lib/browser/render";
import MetadataCard from "@/components/MetadataCard";
import RightsConsent from "@/components/RightsConsent";
import MusicPicker from "@/components/MusicPicker";
import type { UserTrack } from "@/lib/music/tracks";
import type { MusicMatch } from "@/lib/music/audd";
import {
  FREE_CLIPS_PER_DAY,
  canRenderToday,
  clipsUsedToday,
  recordRenderToday,
  shouldWatermark,
} from "@/lib/usage/quota";
import type { Moment } from "@/lib/ai/highlights";

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
  const [musicCheck, setMusicCheck] = useState<
    Record<string, { status: "checking" | "clear" | "detected" | "unavailable"; match?: MusicMatch }>
  >({});
  const [musicAck, setMusicAck] = useState<Record<string, boolean>>({});
  const [usedToday, setUsedToday] = useState<number>(() => clipsUsedToday());
  const previewRef = useRef<HTMLVideoElement | null>(null);

  const toggleRights = useCallback((checked: boolean) => {
    setRightsOk(checked);
    try {
      if (checked) sessionStorage.setItem("clipper-rights-consent", "1");
      else sessionStorage.removeItem("clipper-rights-consent");
    } catch {
      // ignore storage failures; the in-memory state still gates.
    }
  }, []);

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
    setFile(f);
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  }, []);

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
      const res = await fetch("/api/clips/transcribe", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        segments?: TranscriptSegment[];
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
        body: JSON.stringify({ transcript, duration, maxClips: 5 }),
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
  }, [transcript, duration]);

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
              "Voiceover is not connected yet (no voice key on the server) — rendering with the original audio only.",
            );
          } else {
            setNotice("Voiceover failed — rendering with the original audio only.");
          }
        }
        const result = await renderClip({
          videoUrl,
          start: clip.start,
          end: clip.end,
          cropMode,
          captions: transcript ?? [],
          manualCaption: clip.manualCaption,
          voiceoverUrl,
          musicUrl: musicTrack?.url,
          watermark: shouldWatermark("free"),
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
    [videoUrl, cropMode, transcript, voiceoverOn, rightsOk, musicTrack],
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
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Clip your own videos only</strong> — you must own the rights
        to the video you clip. This tool never downloads videos from
        YouTube, TikTok, Instagram, or any platform: there is no link box,
        and your video never leaves this browser except for the audio sent
        for transcription (see FAQ).
      </div>

      <RightsConsent checked={rightsOk} onChange={toggleRights} />
      {!rightsOk && (
        <p className="text-sm text-amber-800">
          Transcription and rendering are blocked until you confirm the
          rights checkbox above.
        </p>
      )}

      <div
        className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) resetForFile(f);
        }}
      >
        <p className="font-medium">Drop your video here, or choose a file</p>
        <p className="mt-1 text-sm text-slate-500">
          Up to 10 minutes, up to 500 MB. MP4, MOV, WebM and other browser
          formats. The video stays in this browser.
        </p>
        <input
          className="mt-4"
          type="file"
          accept="video/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) resetForFile(f);
          }}
        />
        {file && (
          <p className="mt-3 text-sm text-slate-700">
            {file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB
            {duration > 0 && ` — ${fmtTime(duration)}`}
          </p>
        )}
      </div>

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
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900">
          {notice}
        </div>
      )}

      {file && duration > 0 && (
        <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">1. AI transcript &amp; highlights</h2>
          <p className="text-sm text-slate-600">
            Transcription sends only the audio track to the server (Groq
            Whisper). Highlight picking sends only transcript text. If no AI
            key is configured, both steps say so honestly — step 2 below
            always works.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={transcribe}
              disabled={transcribing || !rightsOk}
            >
              {transcribing ? "Transcribing…" : "Transcribe with AI"}
            </button>
            <button
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={findHighlights}
              disabled={finding || !transcript}
            >
              {finding ? "Finding highlights…" : "Find highlight clips"}
            </button>
          </div>
          {transcript && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                Transcript ({transcript.length} segments)
              </summary>
              <div className="mt-2 max-h-48 space-y-1 overflow-auto">
                {transcript.map((s, i) => (
                  <p key={i} className="text-slate-700">
                    <span className="text-slate-400">
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
        <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">
            2. Cut a clip by hand (always works, no AI needed)
          </h2>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col">
              Start (seconds)
              <input
                className="mt-1 rounded border px-2 py-1"
                inputMode="decimal"
                value={manualStart}
                onChange={(e) => setManualStart(e.target.value)}
                placeholder="e.g. 12"
              />
            </label>
            <label className="flex flex-col">
              End (seconds)
              <input
                className="mt-1 rounded border px-2 py-1"
                inputMode="decimal"
                value={manualEnd}
                onChange={(e) => setManualEnd(e.target.value)}
                placeholder="e.g. 58"
              />
            </label>
            <label className="flex flex-col">
              Title (optional)
              <input
                className="mt-1 rounded border px-2 py-1"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
              />
            </label>
            <label className="flex flex-col">
              Caption shown on the clip (optional)
              <input
                className="mt-1 rounded border px-2 py-1"
                value={manualCaption}
                onChange={(e) => setManualCaption(e.target.value)}
              />
            </label>
            <button
              className="rounded-lg bg-slate-800 px-4 py-2 font-medium text-white"
              onClick={addManualClip}
            >
              Add clip
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Clips are capped at 3 minutes so rendering stays fast in the
            browser.
          </p>
        </section>
      )}

      {clips.length > 0 && (
        <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">3. Render vertical clips</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              Crop
              <select
                className="rounded border px-2 py-1"
                value={cropMode}
                onChange={(e) => setCropMode(e.target.value as CropMode)}
              >
                <option value="face">Face-centered (auto)</option>
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
          <p className="text-xs text-slate-500">
            Face-centered uses on-device face detection and falls back to
            smart crop, then centre. Output is 720×1280 vertical video —
            MP4 where your browser supports it, otherwise WebM.
          </p>
          <p className="text-xs text-slate-500">
            Free tier: {Math.max(0, FREE_CLIPS_PER_DAY - usedToday)} of{" "}
            {FREE_CLIPS_PER_DAY} clips left today. Free clips carry a
            small “AI Video Clipper” watermark; paid tiers are not
            configured yet.
          </p>
          <MusicPicker selected={musicTrack} onSelect={setMusicTrack} />
          <ul className="space-y-4">
            {clips.map((clip) => {
              const out = rendered[clip.id];
              return (
                <li key={clip.id} className="rounded-lg border p-4">
                  <p className="font-medium">{clip.title}</p>
                  <p className="text-sm text-slate-600">
                    {fmtTime(clip.start)} – {fmtTime(clip.end)} ·{" "}
                    {clip.source === "ai" ? "AI highlight" : "Manual"}
                    {clip.hashtags.length > 0 && ` · ${clip.hashtags.join(" ")}`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    <button
                      className="rounded-lg bg-violet-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
                      onClick={() => renderOne(clip)}
                      disabled={renderingId !== null || !rightsOk}
                    >
                      {renderingId === clip.id
                        ? `Rendering… ${Math.round(progress * 100)}%`
                        : "Render clip"}
                    </button>
                    <button
                      className="rounded-lg border px-3 py-1.5"
                      onClick={() => checkMusic(clip)}
                      disabled={musicCheck[clip.id]?.status === "checking"}
                    >
                      {musicCheck[clip.id]?.status === "checking"
                        ? "Checking music…"
                        : "Check music"}
                    </button>
                    {transcript && (
                      <button
                        className="rounded-lg border px-3 py-1.5"
                        onClick={() => downloadSrt(clip)}
                      >
                        Download SRT captions
                      </button>
                    )}
                    <button
                      className="rounded-lg border px-3 py-1.5"
                      onClick={() => copyText(clip)}
                    >
                      {copiedId === clip.id ? "Copied!" : "Copy title + hashtags"}
                    </button>
                  </div>
                  {musicCheck[clip.id]?.status === "detected" && (
                    <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
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
                    <p className="mt-3 text-sm text-emerald-800">
                      Music check: no known recorded music detected in this
                      clip&apos;s sample.
                    </p>
                  )}
                  {musicCheck[clip.id]?.status === "unavailable" && (
                    <p className="mt-3 text-sm text-slate-600">
                      Music check unavailable — no recognition key is
                      configured on the server, so no warning can be given
                      for this clip.
                    </p>
                  )}
                  {out &&
                    !(
                      musicCheck[clip.id]?.status === "detected" &&
                      !musicAck[clip.id]
                    ) && (
                    <div className="mt-3 text-sm">
                      <a
                        className="font-medium text-violet-700 underline"
                        href={out.url}
                        download={`${clip.id}.${out.mimeType.includes("mp4") ? "mp4" : "webm"}`}
                      >
                        Download clip ({out.mimeType})
                      </a>
                      {!out.voiceoverOk && (
                        <span className="ml-2 text-amber-700">
                          Voiceover did not play — clip has original audio only.
                        </span>
                      )}
                    </div>
                  )}
                  <MetadataCard transcript={transcript ?? []} clip={clip} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
