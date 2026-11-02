/**
 * Browser scene sampler + thumbnail picker.
 *
 * Scene sampling seeks through the video at ~2 fps, draws each frame
 * small, and records the mean absolute luminance difference to the
 * previous frame; lib/pipeline/scenes.ts turns those differences into
 * boundaries. Thumbnail picking scores sampled frames by luminance
 * variance (sharper = better) and returns the best time + a canvas
 * snapshot with an optional text overlay.
 */

import {
  detectSceneBoundaries,
  luminanceVariance,
  type SceneBoundary,
} from "@/lib/pipeline/scenes";

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = Math.min(time, video.duration - 0.05);
    setTimeout(done, 1500);
  });
}

function frameDiff(
  prev: Uint8ClampedArray,
  cur: Uint8ClampedArray,
): number {
  const n = Math.min(prev.length, cur.length);
  if (n === 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i += 4) {
    acc += Math.abs((cur[i] ?? 0) - (prev[i] ?? 0));
  }
  return acc / (n / 4) / 255;
}

/** Sample frame differences at ~2 fps inside [start, end]. */
export async function sampleSceneBoundaries(
  video: HTMLVideoElement,
  start: number,
  end: number,
): Promise<SceneBoundary[]> {
  try {
    const wasPaused = video.paused;
    video.pause();
    const probe = document.createElement("canvas");
    probe.width = 160;
    probe.height = Math.max(
      1,
      Math.round(160 * (video.videoHeight / Math.max(1, video.videoWidth))),
    );
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    if (!pctx) return [];
    const interval = 0.5;
    const diffs: number[] = [];
    let prev: Uint8ClampedArray | null = null;
    for (let t = start; t < end; t += interval) {
      await seekTo(video, t);
      pctx.drawImage(video, 0, 0, probe.width, probe.height);
      const data = pctx.getImageData(0, 0, probe.width, probe.height).data;
      if (prev) diffs.push(frameDiff(prev, data));
      else diffs.push(0);
      prev = data;
    }
    if (wasPaused === false) {
      await video.play().catch(() => undefined);
    }
    return detectSceneBoundaries(diffs, interval);
  } catch {
    return [];
  }
}

export type ThumbnailResult = { time: number; dataUrl: string };

/**
 * Pick the sharpest sampled frame in [start, end] and render it as a
 * 720x1280 thumbnail with an optional text overlay. Returns null when
 * the video cannot be sampled.
 */
export async function pickThumbnail(
  video: HTMLVideoElement,
  start: number,
  end: number,
  overlayText?: string,
): Promise<ThumbnailResult | null> {
  try {
    const wasPaused = video.paused;
    video.pause();
    const probe = document.createElement("canvas");
    probe.width = 160;
    probe.height = Math.max(
      1,
      Math.round(160 * (video.videoHeight / Math.max(1, video.videoWidth))),
    );
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    if (!pctx) return null;
    let best: { time: number; score: number } | null = null;
    const steps = Math.max(1, Math.floor(end - start));
    for (let i = 0; i < steps; i++) {
      const t = start + (i + 0.5) * ((end - start) / steps);
      await seekTo(video, t);
      pctx.drawImage(video, 0, 0, probe.width, probe.height);
      const data = pctx.getImageData(0, 0, probe.width, probe.height).data;
      const gray: number[] = [];
      for (let j = 0; j < data.length; j += 16) gray.push(data[j] ?? 0);
      const score = luminanceVariance(gray);
      if (!best || score > best.score) best = { time: t, score };
    }
    if (!best) return null;
    await seekTo(video, best.time);
    const out = document.createElement("canvas");
    out.width = 720;
    out.height = 1280;
    const octx = out.getContext("2d");
    if (!octx) return null;
    // Cover the 9:16 frame with the source frame, centred.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(720 / vw, 1280 / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    octx.drawImage(video, (720 - dw) / 2, (1280 - dh) / 2, dw, dh);
    if (overlayText?.trim()) {
      octx.font = "700 64px system-ui, sans-serif";
      octx.textAlign = "center";
      octx.fillStyle = "rgba(0,0,0,0.65)";
      const text = overlayText.trim().slice(0, 60);
      const w = octx.measureText(text).width + 48;
      octx.fillRect(360 - w / 2, 96, w, 96);
      octx.fillStyle = "#ffffff";
      octx.fillText(text, 360, 160);
    }
    if (wasPaused === false) {
      await video.play().catch(() => undefined);
    }
    return { time: best.time, dataUrl: out.toDataURL("image/jpeg", 0.85) };
  } catch {
    return null;
  }
}
