import type { TranscriptSegment } from "@/lib/captions";
import { windowForAspect } from "@/lib/crop";
import {
  FORMAT_DIMENSIONS,
  drawStyledCaption,
  resolveSubtitleStyle,
  type GeneratedFormat,
  type SubtitleStyle,
} from "@/lib/browser/subtitles";
import {
  pickBestMimeType,
  loadVideo,
} from "@/lib/browser/render";

/**
 * Generated-short composer (ClipForge Phase 17).
 *
 * Unlike `renderClip` (one source video, one clip), this composes
 * several short visuals sequentially into ONE vertical short:
 * each script segment plays its visual for a fixed window, with
 * its caption burned in, and the segments join into a single
 * MediaRecorder stream. It reuses the renderer's canvas size,
 * mime-type choice, video loader, and caption drawing — it does
 * not fork the renderer.
 *
 * Audio, honestly: source visuals are MUTED — a generated short's
 * soundtrack is voiceover narration (when connected) plus an
 * optional user-licensed music upload at full volume, never a
 * random stock clip's audio. No video data leaves the browser.
 */

export const GENERATED_WINDOW_SEC = 5;

export type GeneratedSegmentInput = {
  videoUrl: string;
  caption: string;
};

export type RenderGeneratedOptions = {
  segments: GeneratedSegmentInput[];
  windowSec?: number;
  voiceoverUrl?: string;
  /** User-licensed soundtrack, played at full volume, looped. */
  musicUrl?: string;
  watermark?: boolean;
  /** Output format (default 9:16, the Phase 17 size). */
  format?: GeneratedFormat;
  /** Burned-in caption style (default = the Phase 17 look). */
  subtitleStyle?: SubtitleStyle;
  onProgress?: (frac: number) => void;
};

export type RenderGeneratedResult = {
  blob: Blob;
  mimeType: string;
  voiceoverOk: boolean;
  totalSec: number;
  /** Real output size, so the UI can state it honestly. */
  width: number;
  height: number;
  format: GeneratedFormat;
};

/**
 * Build the caption track for a generated short: segment i covers
 * [i*window, (i+1)*window). Pure — unit-tested, and reused for the
 * SRT/VTT exports so the files match the rendered short exactly.
 */
export function buildGeneratedCaptions(
  segments: GeneratedSegmentInput[],
  windowSec: number = GENERATED_WINDOW_SEC,
): TranscriptSegment[] {
  return segments.map((s, i) => ({
    start: i * windowSec,
    end: (i + 1) * windowSec,
    text: s.caption,
  }));
}

export function generatedTotalSec(
  segmentCount: number,
  windowSec: number = GENERATED_WINDOW_SEC,
): number {
  return Math.max(0, segmentCount * windowSec);
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
): void {
  ctx.save();
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText("AI Video Clipper", canvasWidth - 24, 24);
  ctx.restore();
}

export async function renderGeneratedShort(
  opts: RenderGeneratedOptions,
): Promise<RenderGeneratedResult> {
  const windowSec = opts.windowSec ?? GENERATED_WINDOW_SEC;
  if (opts.segments.length === 0) {
    throw new Error("A generated short needs at least one segment.");
  }
  const totalSec = generatedTotalSec(opts.segments.length, windowSec);
  const format: GeneratedFormat = opts.format ?? "9:16";
  const dims = FORMAT_DIMENSIONS[format];
  const subtitleStyle = resolveSubtitleStyle(opts.subtitleStyle ?? {});

  const canvas = document.createElement("canvas");
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  let voiceEl: HTMLAudioElement | null = null;
  if (opts.voiceoverUrl) {
    try {
      voiceEl = new Audio(opts.voiceoverUrl);
      voiceEl.crossOrigin = "anonymous";
      const vsource = audioCtx.createMediaElementSource(voiceEl);
      vsource.connect(dest);
    } catch {
      voiceEl = null;
    }
  }
  let musicEl: HTMLAudioElement | null = null;
  if (opts.musicUrl) {
    try {
      musicEl = new Audio(opts.musicUrl);
      musicEl.crossOrigin = "anonymous";
      const msource = audioCtx.createMediaElementSource(musicEl);
      const gain = audioCtx.createGain();
      gain.gain.value = 1.0;
      msource.connect(gain);
      gain.connect(dest);
    } catch {
      musicEl = null;
    }
  }

  const canvasStream = canvas.captureStream(30);
  const audioTracks = dest.stream.getAudioTracks();
  if (audioTracks.length > 0) canvasStream.addTrack(audioTracks[0]);

  const mimeType = pickBestMimeType();
  const recorder = mimeType
    ? new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 5_000_000,
      })
    : new MediaRecorder(canvasStream, { videoBitsPerSecond: 5_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  // Voiceover + music start once, over the whole short.
  let voiceoverOk = false;
  if (voiceEl) {
    voiceEl.currentTime = 0;
    await voiceEl.play().then(
      () => {
        voiceoverOk = true;
      },
      () => {
        voiceoverOk = false;
      },
    );
  }
  if (musicEl) {
    musicEl.currentTime = 0;
    musicEl.loop = true;
    await musicEl.play().catch(() => undefined);
  }
  recorder.start();

  try {
    for (let i = 0; i < opts.segments.length; i++) {
      const segment = opts.segments[i];
      const video = await loadVideo(segment.videoUrl);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) {
        throw new Error("Could not read a visual's size.");
      }
      const win = windowForAspect(vw, vh, dims.width, dims.height);
      await video.play().catch(() => undefined);
      if (video.paused) {
        throw new Error(
          "Playback was blocked by the browser. Press Render again.",
        );
      }
      const segStartWall = Date.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          const t = video.currentTime;
          ctx.drawImage(
            video,
            win.sx,
            win.sy,
            win.sw,
            win.sh,
            0,
            0,
            dims.width,
            dims.height,
          );
          drawStyledCaption(
            ctx,
            segment.caption,
            dims.width,
            dims.height,
            subtitleStyle,
          );
          if (opts.watermark) drawWatermark(ctx, dims.width);
          const doneSec = i * windowSec + Math.min(t, windowSec);
          opts.onProgress?.(
            Math.min(1, Math.max(0, doneSec / totalSec)),
          );
          // A segment ends at its window, at video end, or on a
          // wall-clock failsafe (a stalled video must not hang
          // the render forever).
          const stalled = Date.now() - segStartWall > (windowSec + 10) * 1000;
          if (t >= windowSec || video.ended || stalled) {
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        tick();
      });
      video.pause();
    }
  } finally {
    if (recorder.state !== "inactive") recorder.stop();
    voiceEl?.pause();
    musicEl?.pause();
    await stopped;
    await audioCtx.close().catch(() => undefined);
  }
  const type = mimeType || "video/webm";
  return {
    blob: new Blob(chunks, { type }),
    mimeType: type,
    voiceoverOk,
    totalSec,
    width: dims.width,
    height: dims.height,
    format,
  };
}
