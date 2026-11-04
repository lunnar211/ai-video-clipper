export type CropMode = "center" | "left" | "right" | "smart" | "face" | "track";

export type CropWindow = {
  /** Source x in pixels. */
  sx: number;
  /** Source y in pixels. */
  sy: number;
  /** Source width in pixels. */
  sw: number;
  /** Source height in pixels. */
  sh: number;
};

/**
 * 9:16 source window for a video frame, centred horizontally on
 * `centerXFrac` (0 = left edge, 1 = right edge, clamped into the frame).
 * Uses the full frame height when the frame is wide enough, otherwise the
 * full frame width (window is then vertically centred).
 */
export function windowForCenterX(
  videoWidth: number,
  videoHeight: number,
  centerXFrac: number,
): CropWindow {
  if (videoWidth <= 0 || videoHeight <= 0) {
    return { sx: 0, sy: 0, sw: 0, sh: 0 };
  }
  let sh = videoHeight;
  let sw = sh * (9 / 16);
  if (sw > videoWidth) {
    sw = videoWidth;
    sh = sw * (16 / 9);
  }
  const centerX = Math.min(1, Math.max(0, centerXFrac)) * videoWidth;
  const sx = Math.min(Math.max(0, centerX - sw / 2), videoWidth - sw);
  const sy = (videoHeight - sh) / 2;
  return { sx, sy, sw, sh };
}

/** Fixed-position window for the named mode (smart/face resolve to a frac first). */
export function windowForMode(
  videoWidth: number,
  videoHeight: number,
  mode: "center" | "left" | "right",
): CropWindow {
  const frac = mode === "left" ? 0 : mode === "right" ? 1 : 0.5;
  return windowForCenterX(videoWidth, videoHeight, frac);
}

/**
 * Centred source window with an arbitrary aspect ratio
 * (ClipForge Phase 19 — the generated-short composer renders
 * 9:16, 16:9, and 1:1 from the same visuals). Uses the full frame
 * height when the frame is wide enough, otherwise the full frame
 * width, and centres the window in both axes. For 9:16 this is
 * exactly windowForCenterX at centre 0.5.
 */
export function windowForAspect(
  videoWidth: number,
  videoHeight: number,
  aspectWidth: number,
  aspectHeight: number,
): CropWindow {
  if (
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    aspectWidth <= 0 ||
    aspectHeight <= 0
  ) {
    return { sx: 0, sy: 0, sw: 0, sh: 0 };
  }
  const target = aspectWidth / aspectHeight;
  let sh = videoHeight;
  let sw = sh * target;
  if (sw > videoWidth) {
    sw = videoWidth;
    sh = sw / target;
  }
  return {
    sx: (videoWidth - sw) / 2,
    sy: (videoHeight - sh) / 2,
    sw,
    sh,
  };
}

/** Median of numbers (0 when empty). Used to smooth per-second face centres. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
