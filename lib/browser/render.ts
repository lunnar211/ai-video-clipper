import type { TranscriptSegment, WordTimestamp } from "@/lib/captions";
import { segmentAtTime, wordAtTime, type CaptionPreset } from "@/lib/captions";
import { windowForCenterX, type CropMode } from "@/lib/crop";
import { sampleFaceCenterX, sampleFaceTrack, type FaceTrackPoint } from "@/lib/browser/face";
import { sampleSmartCropCenterX } from "@/lib/browser/smartcrop";

/**
 * Browser clip renderer (the ffmpeg.wasm equivalent for this MVP).
 * One pass: video frame -> 9:16 canvas crop -> burned-in caption text ->
 * MediaRecorder. Original audio is mixed in through Web Audio; an
 * optional ElevenLabs voiceover track is mixed alongside it. No video
 * data leaves the browser.
 *
 * Output is 720x1280. Format is MP4 where the browser supports it,
 * otherwise WebM — the result reports the actual mime type used.
 */

export const OUTPUT_WIDTH = 720;
export const OUTPUT_HEIGHT = 1280;

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.640028',
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm",
];

export function pickBestMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      // ignore and try the next candidate
    }
  }
  return "";
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.playsInline = true;
    const onMeta = () => {
      video.removeEventListener("loadedmetadata", onMeta);
      resolve(video);
    };
    const onError = () => reject(new Error("Could not load this video file."));
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("error", onError);
    video.src = url;
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = time;
    setTimeout(done, 2000);
  });
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  preset?: CaptionPreset,
): void {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
    if (lines.length === 2 && line) {
      // Keep captions to two lines; the rest is cut, not overflowed.
      break;
    }
  }
  if (lines.length < 2 && line) lines.push(line);
  const fontSize = 46;
  const lineHeight = 58;
  const padding = 18;
  const boxWidth = Math.min(
    maxWidth + padding * 2,
    Math.max(...lines.map((l) => ctx.measureText(l).width)) + padding * 2,
  );
  const boxHeight = lines.length * lineHeight + padding * 2;
  const x = (OUTPUT_WIDTH - boxWidth) / 2;
  const y = OUTPUT_HEIGHT - boxHeight - 130;
  ctx.fillStyle = preset?.background ?? "rgba(0,0,0,0.68)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxWidth, boxHeight, 18);
  ctx.fill();
  ctx.fillStyle = preset?.textColor ?? "#ffffff";
  ctx.font = `700 ${fontSize}px ${preset?.fontFamily ?? "system-ui, sans-serif"}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => {
    ctx.fillText(l, OUTPUT_WIDTH / 2, y + padding + lineHeight / 2 + i * lineHeight);
  });
}

/**
 * Animated word-by-word caption: the active word (from word-level
 * timestamps) is drawn in the preset's highlight color. Falls back to
 * the plain caption when no active word matches.
 */
function drawCaptionWithHighlight(
  ctx: CanvasRenderingContext2D,
  text: string,
  activeWord: string | null,
  preset: CaptionPreset,
  maxWidth: number,
): void {
  const words = text.split(/\s+/).filter(Boolean);
  const activeIdx = activeWord
    ? words.findIndex(
        (w) => w.toLowerCase().replace(/[^a-z0-9]/gi, "") ===
          activeWord.toLowerCase().replace(/[^a-z0-9]/gi, ""),
      )
    : -1;
  if (activeIdx === -1) {
    drawWrappedText(ctx, text, maxWidth, preset);
    return;
  }
  // Lay words into up to two lines, then draw word by word.
  ctx.font = `700 46px ${preset.fontFamily}`;
  const lines: Array<Array<{ word: string; idx: number }>> = [];
  let line: Array<{ word: string; idx: number }> = [];
  let lineWidth = 0;
  words.forEach((word, idx) => {
    const w = ctx.measureText(word).width + 12;
    if (line.length > 0 && lineWidth + w > maxWidth) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    line.push({ word, idx });
    lineWidth += w;
    if (lines.length === 2) return;
  });
  if (lines.length < 2 && line.length > 0) lines.push(line);
  const lineHeight = 58;
  const padding = 18;
  const boxWidth = Math.min(
    maxWidth + padding * 2,
    Math.max(
      ...lines.map((l) =>
        l.reduce((n, p) => n + ctx.measureText(p.word).width + 12, 0),
      ),
    ) + padding * 2,
  );
  const boxHeight = lines.length * lineHeight + padding * 2;
  const x = (OUTPUT_WIDTH - boxWidth) / 2;
  const y = OUTPUT_HEIGHT - boxHeight - 130;
  ctx.fillStyle = preset.background;
  ctx.beginPath();
  ctx.roundRect(x, y, boxWidth, boxHeight, 18);
  ctx.fill();
  ctx.textBaseline = "middle";
  lines.forEach((l, li) => {
    const total = l.reduce(
      (n, p) => n + ctx.measureText(p.word).width + 12,
      -12,
    );
    let cx = OUTPUT_WIDTH / 2 - total / 2;
    for (const p of l) {
      ctx.fillStyle =
        p.idx === activeIdx ? preset.highlightColor : preset.textColor;
      ctx.textAlign = "left";
      ctx.fillText(p.word, cx, y + padding + lineHeight / 2 + li * lineHeight);
      cx += ctx.measureText(p.word).width + 12;
    }
  });
}

function drawWatermark(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText("AI Video Clipper", OUTPUT_WIDTH - 24, 24);
  ctx.restore();
}

export type RenderOptions = {
  videoUrl: string;
  start: number;
  end: number;
  cropMode: CropMode;
  captions: TranscriptSegment[];
  manualCaption?: string;
  voiceoverUrl?: string;
  /** Optional user-licensed background track, mixed at low volume. */
  musicUrl?: string;
  musicGain?: number;
  /** Free-tier watermark: small brand text on every frame. */
  watermark?: boolean;
  /** Caption style preset (ClipForge Phase 1). Default = bold pop look. */
  captionPreset?: CaptionPreset;
  /** Clip-relative word timestamps for animated word highlight. */
  words?: WordTimestamp[];
  /** Brand kit mark: logo image + optional watermark text. */
  brandLogoUrl?: string;
  brandWatermarkText?: string;
  /** Split-screen background video (user-supplied or licensed only). */
  splitBackgroundUrl?: string;
  onProgress?: (frac: number) => void;
};

export type RenderResult = {
  blob: Blob;
  mimeType: string;
  voiceoverOk: boolean;
};

/** Resolved crop centres, so a retry after a blocked playback skips sampling. */
const centerCache = new Map<string, number>();
const trackCache = new Map<string, FaceTrackPoint[]>();

function trackXAt(track: FaceTrackPoint[], t: number): number {
  if (track.length === 0) return 0.5;
  let best = track[0];
  for (const p of track) {
    if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  }
  return best.x;
}

async function loadBrandLogo(url: string): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const loaded = new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 3000);
    });
    img.src = url;
    return (await loaded) ? img : null;
  } catch {
    return null;
  }
}

export async function renderClip(opts: RenderOptions): Promise<RenderResult> {
  const video = await loadVideo(opts.videoUrl);
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Could not read this video's size.");

  // Resolve the horizontal crop centre before recording starts.
  // "track" resolves a per-second face track; other modes keep their
  // existing behaviour exactly (face = single median, smart = one frame).
  const cacheKey = `${opts.videoUrl}|${opts.start}|${opts.end}|${opts.cropMode}`;
  let centerX = centerCache.get(cacheKey);
  let faceTrack: FaceTrackPoint[] | null = null;
  if (opts.cropMode === "track") {
    faceTrack = trackCache.get(cacheKey) ?? null;
    if (!faceTrack) {
      faceTrack = await sampleFaceTrack(video, opts.start, opts.end);
      trackCache.set(cacheKey, faceTrack);
    }
    if (faceTrack.length === 0) {
      centerX = (await sampleFaceCenterX(video, opts.start, opts.end)) ?? 0.5;
    }
  } else if (centerX === undefined) {
    centerX = 0.5;
    if (opts.cropMode === "left") centerX = 0;
    else if (opts.cropMode === "right") centerX = 1;
    else if (opts.cropMode === "face") {
      centerX = (await sampleFaceCenterX(video, opts.start, opts.end)) ?? 0.5;
    } else if (opts.cropMode === "smart") {
      centerX =
        (await sampleSmartCropCenterX(video, (opts.start + opts.end) / 2)) ??
        0.5;
    }
    centerCache.set(cacheKey, centerX);
  }
  const win = windowForCenterX(vw, vh, centerX ?? 0.5);

  const brandLogo = opts.brandLogoUrl
    ? await loadBrandLogo(opts.brandLogoUrl)
    : null;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  // Mix the original audio (and optional voiceover) into the recording.
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  try {
    const source = audioCtx.createMediaElementSource(video);
    source.connect(dest);
  } catch {
    // Audio stays silent; the picture still renders.
  }
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
      gain.gain.value = opts.musicGain ?? 0.15;
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

  await seekTo(video, opts.start);
  // Playback must actually start before recording: if the browser blocks
  // autoplay (the face/smart sampling awaits can outlast the click
  // gesture), fail loudly instead of recording a blank clip. The crop
  // centre is cached above, so pressing Render again plays immediately.
  await video.play().catch(() => undefined);
  if (video.paused) {
    await audioCtx.close().catch(() => undefined);
    throw new Error(
      "Playback was blocked by the browser. Press Render again — the crop position is now cached, so the retry plays immediately.",
    );
  }
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
  // Split-screen background (user-supplied or licensed only). It plays
  // muted and loops; if it fails to load, the clip renders full-frame.
  let bgVideo: HTMLVideoElement | null = null;
  let bgReady = false;
  if (opts.splitBackgroundUrl) {
    try {
      bgVideo = await loadVideo(opts.splitBackgroundUrl);
      bgVideo.muted = true;
      bgVideo.loop = true;
      await bgVideo.play().catch(() => undefined);
      bgReady = !bgVideo.paused;
    } catch {
      bgVideo = null;
      bgReady = false;
    }
  }
  recorder.start();

  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = video.currentTime;
      const frameWin =
        faceTrack && faceTrack.length > 0
          ? windowForCenterX(vw, vh, trackXAt(faceTrack, t))
          : win;
      if (bgReady && bgVideo) {
        // Main clip on top half, background footage on bottom half.
        ctx.drawImage(
          video,
          frameWin.sx,
          frameWin.sy,
          frameWin.sw,
          frameWin.sh,
          0,
          0,
          OUTPUT_WIDTH,
          OUTPUT_HEIGHT / 2,
        );
        const bvw = bgVideo.videoWidth || OUTPUT_WIDTH;
        const bvh = bgVideo.videoHeight || OUTPUT_HEIGHT / 2;
        const bscale = Math.max(
          OUTPUT_WIDTH / bvw,
          OUTPUT_HEIGHT / 2 / bvh,
        );
        const bdw = bvw * bscale;
        const bdh = bvh * bscale;
        ctx.drawImage(
          bgVideo,
          (OUTPUT_WIDTH - bdw) / 2,
          OUTPUT_HEIGHT / 2 + (OUTPUT_HEIGHT / 2 - bdh) / 2,
          bdw,
          bdh,
        );
      } else {
        ctx.drawImage(
          video,
          frameWin.sx,
          frameWin.sy,
          frameWin.sw,
          frameWin.sh,
          0,
          0,
          OUTPUT_WIDTH,
          OUTPUT_HEIGHT,
        );
      }
      const caption =
        opts.manualCaption?.trim() ||
        segmentAtTime(opts.captions, t) ||
        null;
      if (caption) {
        if (opts.captionPreset && opts.words) {
          const active = wordAtTime(opts.words, t - opts.start);
          drawCaptionWithHighlight(
            ctx,
            caption,
            active ? active.word : null,
            opts.captionPreset,
            OUTPUT_WIDTH - 80,
          );
        } else {
          drawWrappedText(ctx, caption, OUTPUT_WIDTH - 80, opts.captionPreset);
        }
      }
      if (brandLogo) {
        const lw = 120;
        const lh = lw * (brandLogo.height / Math.max(1, brandLogo.width));
        ctx.drawImage(brandLogo, 24, 24, lw, lh);
      }
      if (opts.brandWatermarkText?.trim()) {
        ctx.save();
        ctx.font = "700 24px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText(opts.brandWatermarkText.trim(), 24, OUTPUT_HEIGHT - 24);
        ctx.restore();
      }
      if (opts.watermark) drawWatermark(ctx);
      opts.onProgress?.(
        Math.min(1, Math.max(0, (t - opts.start) / (opts.end - opts.start))),
      );
      if (t >= opts.end || video.ended) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    tick();
  });

  if (recorder.state !== "inactive") recorder.stop();
  video.pause();
  voiceEl?.pause();
  musicEl?.pause();
  bgVideo?.pause();
  await stopped;
  await audioCtx.close().catch(() => undefined);
  const type = mimeType || "video/webm";
  return { blob: new Blob(chunks, { type }), mimeType: type, voiceoverOk };
}
