"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { TranscriptSegment, WordTimestamp } from "@/lib/captions";
import { segmentAtTime, wordAtTime, CAPTION_PRESETS } from "@/lib/captions";
import { rmsWindows, findSilentRanges, nonSilentSegments, type TimeRange } from "@/lib/pipeline/silence";
import { resampleMono } from "@/lib/browser/audio";

/**
 * Clip editor (ClipForge Phase 1). Additive panel, rendered per clip
 * from ClipperTool — the existing upload/transcribe/render flow is
 * untouched. Features: draggable timeline trim, live 9:16 preview with
 * caption + active-word highlight, transcript segment exclusion
 * (cuts), silence detection + split, caption preset choice,
 * split-screen background (user-supplied or licensed footage only),
 * undo/redo, and per-clip versions stored in the browser.
 */

export type EditorClip = {
  id: string;
  start: number;
  end: number;
  title: string;
};

type Version = {
  label: string;
  start: number;
  end: number;
  presetId: string;
  at: string;
};

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ClipEditor(props: {
  videoUrl: string;
  clip: EditorClip;
  transcript: TranscriptSegment[];
  words?: WordTimestamp[];
  file: File | null;
  presetId: string;
  onSave: (start: number, end: number) => void;
  onSplit: (parts: Array<{ start: number; end: number; title: string }>) => void;
  onPresetChange: (presetId: string) => void;
  onSetSplitBackground: (url: string | null) => void;
  onClose: () => void;
}) {
  const { clip, transcript } = props;
  const [start, setStart] = useState(clip.start);
  const [end, setEnd] = useState(clip.end);
  const [currentTime, setCurrentTime] = useState(clip.start);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [silent, setSilent] = useState<TimeRange[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [history, setHistory] = useState<Array<{ start: number; end: number }>>([
    { start: clip.start, end: clip.end },
  ]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [versions, setVersions] = useState<Version[]>(() => {
    try {
      const raw = localStorage.getItem(`clipforge-versions-${clip.id}`);
      return raw ? (JSON.parse(raw) as Version[]) : [];
    } catch {
      return [];
    }
  });
  const [versionLabel, setVersionLabel] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const duration = useMemo(() => {
    const maxEnd = Math.max(
      clip.end,
      ...transcript.map((s) => s.end),
    );
    return Math.max(maxEnd, clip.end + 5);
  }, [clip.end, transcript]);

  // Note: start/end state is the editor's source of truth; every change
  // flows through applyTimes/onSave, so no sync effect is needed (and
  // React forbids setState-in-effect here).

  const pushHistory = useCallback((s: number, e: number) => {
    setHistory((prev) => {
      const next = prev.slice(0, historyIdx + 1);
      next.push({ start: s, end: e });
      return next.slice(-50);
    });
    setHistoryIdx((i) => Math.min(i + 1, 49));
  }, [historyIdx]);

  const applyTimes = useCallback(
    (s: number, e: number, record = true) => {
      const cs = Math.max(0, s);
      const ce = Math.max(cs + 1, e);
      setStart(cs);
      setEnd(ce);
      props.onSave(cs, ce);
      if (record) pushHistory(cs, ce);
    },
    [props, pushHistory],
  );

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const prev = history[historyIdx - 1];
    setHistoryIdx(historyIdx - 1);
    setStart(prev.start);
    setEnd(prev.end);
    props.onSave(prev.start, prev.end);
  }, [history, historyIdx, props]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const next = history[historyIdx + 1];
    setHistoryIdx(historyIdx + 1);
    setStart(next.start);
    setEnd(next.end);
    props.onSave(next.start, next.end);
  }, [history, historyIdx, props]);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(0, t), v.duration || t);
    void v.play().catch(() => undefined);
  }, []);

  const onTrackPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, which: "start" | "end") => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const move = (ev: PointerEvent) => {
        const frac = Math.min(
          1,
          Math.max(0, (ev.clientX - rect.left) / rect.width),
        );
        const t = frac * duration;
        if (which === "start") setStart(Math.min(t, end - 1));
        else setEnd(Math.max(t, start + 1));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        applyTimes(start, end);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      e.preventDefault();
    },
    [duration, start, end, applyTimes],
  );

  const detectSilence = useCallback(async () => {
    if (!props.file) return;
    setDetecting(true);
    try {
      const ctx = new AudioContext();
      try {
        const buf = await props.file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        const channels: Float32Array[] = [];
        for (let c = 0; c < decoded.numberOfChannels; c++) {
          channels.push(decoded.getChannelData(c));
        }
        const mono = resampleMono(channels, decoded.sampleRate, 16000);
        const rms = rmsWindows(mono, 16000, 0.5);
        setSilent(findSilentRanges(rms, 0.5, 0.01, 1, 0.5));
      } finally {
        await ctx.close().catch(() => undefined);
      }
    } catch {
      setSilent([]);
    } finally {
      setDetecting(false);
    }
  }, [props.file]);

  const applyCuts = useCallback(() => {
    const kept = transcript.filter((_, i) => !excluded.has(i));
    if (kept.length === 0) return;
    const parts: Array<{ start: number; end: number; title: string }> = [];
    let cur: { start: number; end: number } | null = null;
    for (const s of kept) {
      if (!cur) cur = { start: s.start, end: s.end };
      else if (s.start - cur.end <= 1) cur.end = Math.max(cur.end, s.end);
      else {
        parts.push({ ...cur, title: `${clip.title} (part ${parts.length + 1})` });
        cur = { start: s.start, end: s.end };
      }
    }
    if (cur) {
      parts.push({ ...cur, title: `${clip.title} (part ${parts.length + 1})` });
    }
    const clipped = parts
      .map((p) => ({
        start: Math.max(p.start, start),
        end: Math.min(p.end, end),
        title: p.title,
      }))
      .filter((p) => p.end - p.start >= 2);
    if (clipped.length > 0) props.onSplit(clipped);
  }, [transcript, excluded, start, end, clip.title, props]);

  const splitSilences = useCallback(() => {
    if (!silent) return;
    const parts = nonSilentSegments(start, end, silent, 2).map((p, i) => ({
      ...p,
      title: `${clip.title} (part ${i + 1})`,
    }));
    if (parts.length > 0) props.onSplit(parts);
  }, [silent, start, end, clip.title, props]);

  const saveVersion = useCallback(() => {
    const v: Version = {
      label: versionLabel.trim() || `Version ${versions.length + 1}`,
      start,
      end,
      presetId: props.presetId,
      at: new Date().toISOString(),
    };
    const next = [...versions, v];
    setVersions(next);
    try {
      localStorage.setItem(
        `clipforge-versions-${clip.id}`,
        JSON.stringify(next),
      );
    } catch {
      // ignore storage failures
    }
    setVersionLabel("");
  }, [versionLabel, versions, start, end, props.presetId, clip.id]);

  const caption = segmentAtTime(transcript, currentTime);
  const activeWord = props.words
    ? wordAtTime(props.words, currentTime - clip.start)
    : null;

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-border bg-muted p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Editor — {clip.title}</h4>
        <button className="rounded border border-border px-2 py-1 text-sm" onClick={props.onClose}>
          Close editor
        </button>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="relative w-56 overflow-hidden rounded-lg bg-black" style={{ aspectRatio: "9 / 16" }}>
          <video
            ref={videoRef}
            src={props.videoUrl}
            controls
            playsInline
            className="h-full w-full object-cover"
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              e.currentTarget.currentTime = clip.start;
            }}
          />
          {caption && (
            <div className="pointer-events-none absolute bottom-16 left-2 right-2 rounded bg-black/70 px-2 py-1 text-center text-sm text-white">
              {activeWord ? (
                <span>
                  {caption.split(/\s+/).map((w, i) => (
                    <span
                      key={i}
                      className={
                        w.toLowerCase().replace(/[^a-z0-9]/gi, "") ===
                        activeWord.word.toLowerCase().replace(/[^a-z0-9]/gi, "")
                          ? "text-yellow-300"
                          : undefined
                      }
                    >
                      {w}{" "}
                    </span>
                  ))}
                </span>
              ) : (
                caption
              )}
            </div>
          )}
        </div>

        <div className="w-full">
          <div
            ref={trackRef}
            className="relative h-8 w-full rounded bg-muted"
            role="group"
            aria-label="Clip timeline trim"
          >
            <div
              className="absolute top-0 h-8 rounded bg-accent"
              style={{
                left: `${(start / duration) * 100}%`,
                width: `${((end - start) / duration) * 100}%`,
              }}
            />
            <div
              className="absolute top-0 h-8 w-3 cursor-ew-resize rounded bg-primary"
              style={{ left: `calc(${(start / duration) * 100}% - 6px)` }}
              role="slider"
              aria-label="Clip start"
              aria-valuenow={Math.round(start)}
              tabIndex={0}
              onPointerDown={(e) => onTrackPointer(e, "start")}
            />
            <div
              className="absolute top-0 h-8 w-3 cursor-ew-resize rounded bg-primary"
              style={{ left: `calc(${(end / duration) * 100}% - 6px)` }}
              role="slider"
              aria-label="Clip end"
              aria-valuenow={Math.round(end)}
              tabIndex={0}
              onPointerDown={(e) => onTrackPointer(e, "end")}
            />
            <div
              className="absolute top-0 h-8 w-0.5 bg-red-500"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1">
              Start
              <input
                className="w-20 rounded border border-border px-2 py-1"
                inputMode="decimal"
                value={start.toFixed(1)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setStart(v);
                }}
                onBlur={() => applyTimes(start, end)}
              />
            </label>
            <label className="flex items-center gap-1">
              End
              <input
                className="w-20 rounded border border-border px-2 py-1"
                inputMode="decimal"
                value={end.toFixed(1)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setEnd(v);
                }}
                onBlur={() => applyTimes(start, end)}
              />
            </label>
            <button className="rounded border border-border px-2 py-1" onClick={undo} disabled={historyIdx <= 0}>
              Undo
            </button>
            <button
              className="rounded border border-border px-2 py-1"
              onClick={redo}
              disabled={historyIdx >= history.length - 1}
            >
              Redo
            </button>
            <span className="text-muted-foreground">
              {fmt(start)} – {fmt(end)} ({fmt(end - start)})
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Caption style
          <select
            className="rounded border border-border px-2 py-1"
            value={props.presetId}
            onChange={(e) => props.onPresetChange(e.target.value)}
          >
            {CAPTION_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Split-screen background (your own or licensed footage only)
          <input
            type="file"
            accept="video/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              props.onSetSplitBackground(f ? URL.createObjectURL(f) : null);
            }}
          />
        </label>
        <button
          className="rounded border border-border px-2 py-1"
          onClick={() => props.onSetSplitBackground(null)}
        >
          Remove background
        </button>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <button className="rounded border border-border px-2 py-1" onClick={detectSilence} disabled={detecting || !props.file}>
          {detecting ? "Detecting silence…" : "Detect silence"}
        </button>
        {silent && silent.length > 0 && (
          <button className="rounded border border-border px-2 py-1" onClick={splitSilences}>
            Split out {silent.length} silent part{silent.length === 1 ? "" : "s"}
          </button>
        )}
        {silent && silent.length === 0 && (
          <span className="text-muted-foreground">No silences over 1 second found.</span>
        )}
      </div>

      {transcript.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            Transcript editing — click a line to seek, tick lines to cut them out
          </summary>
          <div className="mt-2 max-h-48 space-y-1 overflow-auto">
            {transcript.map((s, i) => (
              <label key={i} className="flex items-start gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={excluded.has(i)}
                  onChange={(e) => {
                    const next = new Set(excluded);
                    if (e.target.checked) next.add(i);
                    else next.delete(i);
                    setExcluded(next);
                  }}
                />
                <button
                  type="button"
                  className="text-left"
                  onClick={() => seekTo(s.start)}
                >
                  <span className="text-muted-foreground">[{fmt(s.start)}] </span>
                  {s.text}
                </button>
              </label>
            ))}
          </div>
          <button className="mt-2 rounded border border-border px-2 py-1" onClick={applyCuts} disabled={excluded.size === 0}>
            Cut ticked lines (split into remaining parts)
          </button>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          className="rounded border border-border px-2 py-1"
          value={versionLabel}
          onChange={(e) => setVersionLabel(e.target.value)}
          placeholder="Version label (optional)"
        />
        <button className="rounded border border-border px-2 py-1" onClick={saveVersion}>
          Save version
        </button>
        {versions.map((v, i) => (
          <button
            key={i}
            className="rounded border border-border px-2 py-1"
            onClick={() => {
              applyTimes(v.start, v.end);
              props.onPresetChange(v.presetId);
            }}
            title={`Saved ${new Date(v.at).toLocaleString()}`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
