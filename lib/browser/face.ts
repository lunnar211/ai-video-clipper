import { median } from "@/lib/crop";

/**
 * Face-centered crop via MediaPipe tasks-vision (Apache 2.0).
 * Samples ~1 frame per second inside [start, end], takes the median face
 * centre x (0..1 across the frame), and returns it. Any failure — model
 * download, no faces found, API change — returns null, and the caller
 * falls back to smartcrop, then centre. Nothing here ever blocks a clip.
 */

const VISION_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

type FaceDetectorLike = {
  detect: (
    canvas: HTMLCanvasElement,
  ) => Promise<{
    detections: Array<{
      boundingBox?: { originX: number; width: number };
    }>;
  }>;
  close: () => void;
};

let detectorPromise: Promise<FaceDetectorLike | null> | null = null;

async function loadDetector(): Promise<FaceDetectorLike | null> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(
          VISION_WASM_URL,
        );
        const detector = await vision.FaceDetector.createFromOptions(
          fileset,
          {
            baseOptions: { modelAssetPath: FACE_MODEL_URL },
            runningMode: "IMAGE",
            minDetectionConfidence: 0.5,
          },
        );
        return detector as unknown as FaceDetectorLike;
      } catch {
        return null;
      }
    })();
  }
  return detectorPromise;
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = Math.min(time, video.duration - 0.05);
    // Never hang the clip on a slow seek.
    setTimeout(done, 1500);
  });
}

/**
 * Median face centre x across sampled frames, or null when face
 * detection is unavailable or no face is found in most samples.
 */
export async function sampleFaceCenterX(
  video: HTMLVideoElement,
  start: number,
  end: number,
): Promise<number | null> {
  try {
    const detector = await loadDetector();
    if (!detector) return null;
    const wasPaused = video.paused;
    video.pause();
    const probe = document.createElement("canvas");
    probe.width = 320;
    probe.height = Math.max(
      1,
      Math.round(320 * (video.videoHeight / Math.max(1, video.videoWidth))),
    );
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    if (!pctx) return null;
    const centres: number[] = [];
    const steps = Math.max(1, Math.floor(end - start));
    for (let i = 0; i < steps; i++) {
      const t = start + (i + 0.5) * ((end - start) / steps);
      await seekTo(video, t);
      pctx.drawImage(video, 0, 0, probe.width, probe.height);
      const result = await detector.detect(probe);
      const box = result.detections[0]?.boundingBox;
      if (box && box.width > 0) {
        centres.push((box.originX + box.width / 2) / probe.width);
      }
    }
    if (wasPaused === false) {
      await video.play().catch(() => undefined);
    }
    // Require faces in at least half the samples, else fall back.
    if (centres.length < Math.ceil(steps / 2)) return null;
    return median(centres);
  } catch {
    return null;
  }
}

export type FaceTrackPoint = { t: number; x: number };

/**
 * Per-second face track: one centre-x per second of [start, end],
 * smoothed with a 3-point median so the crop window glides instead of
 * jumping. Returns [] when detection is unavailable. The renderer
 * uses this for cropMode "track"; the existing "face" mode keeps its
 * single-median behaviour untouched.
 */
export async function sampleFaceTrack(
  video: HTMLVideoElement,
  start: number,
  end: number,
): Promise<FaceTrackPoint[]> {
  try {
    const detector = await loadDetector();
    if (!detector) return [];
    const wasPaused = video.paused;
    video.pause();
    const probe = document.createElement("canvas");
    probe.width = 320;
    probe.height = Math.max(
      1,
      Math.round(320 * (video.videoHeight / Math.max(1, video.videoWidth))),
    );
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    if (!pctx) return [];
    const raw: FaceTrackPoint[] = [];
    const steps = Math.max(1, Math.floor(end - start));
    for (let i = 0; i < steps; i++) {
      const t = start + (i + 0.5) * ((end - start) / steps);
      await seekTo(video, t);
      pctx.drawImage(video, 0, 0, probe.width, probe.height);
      const result = await detector.detect(probe);
      const box = result.detections[0]?.boundingBox;
      if (box && box.width > 0) {
        raw.push({ t, x: (box.originX + box.width / 2) / probe.width });
      }
    }
    if (wasPaused === false) {
      await video.play().catch(() => undefined);
    }
    if (raw.length < Math.ceil(steps / 2)) return [];
    // Fill gaps from neighbours, then smooth with a 3-point median.
    const filled: FaceTrackPoint[] = [];
    for (let i = 0; i < steps; i++) {
      const t = start + (i + 0.5) * ((end - start) / steps);
      const exact = raw.find((p) => Math.abs(p.t - t) < 0.01);
      if (exact) {
        filled.push(exact);
      } else {
        const before = [...raw].reverse().find((p) => p.t < t);
        const after = raw.find((p) => p.t > t);
        const x =
          before && after
            ? (before.x + after.x) / 2
            : (before ?? after)?.x ?? 0.5;
        filled.push({ t, x });
      }
    }
    return filled.map((p, i) => {
      const xs = [
        filled[Math.max(0, i - 1)].x,
        p.x,
        filled[Math.min(filled.length - 1, i + 1)].x,
      ];
      return { t: p.t, x: median(xs) };
    });
  } catch {
    return [];
  }
}
