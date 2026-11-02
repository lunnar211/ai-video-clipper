import type { TranscriptSegment } from "@/lib/captions";
import { segmentAtTime } from "@/lib/captions";
import { windowForCenterX, type CropMode } from "@/lib/crop";
import { sampleFaceCenterX } from "@/lib/browser/face";
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
  ctx.fillStyle = "rgba(0,0,0,0.68)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxWidth, boxHeight, 18);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => {
    ctx.fillText(l, OUTPUT_WIDTH / 2, y + padding + lineHeight / 2 + i * lineHeight);
  });
}

export type RenderOptions = {
  videoUrl: string;
  start: number;
  end: number;
  cropMode: CropMode;
  captions: TranscriptSegment[];
  manualCaption?: string;
  voiceoverUrl?: string;
  onProgress?: (frac: number) => void;
};

export type RenderResult = {
  blob: Blob;
  mimeType: string;
  voiceoverOk: boolean;
};

/** Resolved crop centres, so a retry after a blocked playback skips sampling. */
const centerCache = new Map<string, number>();

export async function renderClip(opts: RenderOptions): Promise<RenderResult> {
  const video = await loadVideo(opts.videoUrl);
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Could not read this video's size.");

  // Resolve the horizontal crop centre before recording starts.
  const cacheKey = `${opts.videoUrl}|${opts.start}|${opts.end}|${opts.cropMode}`;
  let centerX = centerCache.get(cacheKey);
  if (centerX === undefined) {
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
  const win = windowForCenterX(vw, vh, centerX);

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
  recorder.start();

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
        OUTPUT_WIDTH,
        OUTPUT_HEIGHT,
      );
      const caption =
        opts.manualCaption?.trim() ||
        segmentAtTime(opts.captions, t) ||
        null;
      if (caption) drawWrappedText(ctx, caption, OUTPUT_WIDTH - 80);
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
  await stopped;
  await audioCtx.close().catch(() => undefined);
  const type = mimeType || "video/webm";
  return { blob: new Blob(chunks, { type }), mimeType: type, voiceoverOk };
}
