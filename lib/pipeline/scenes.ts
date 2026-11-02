/**
 * Scene / shot boundary detection (pure core + browser sampler contract).
 *
 * The pure detector works on per-frame mean absolute differences
 * (0..1, one value per sampled frame): a boundary is declared where the
 * difference exceeds `threshold` and the previous declared boundary is
 * at least `minGapSec` away. The browser sampler (lib/browser/scenes.ts)
 * produces those differences from canvas frames; the server worker can
 * reuse this same function on ffmpeg scene scores.
 */

export type SceneBoundary = { time: number; strength: number };

/** Pure boundary detector over frame-difference samples. */
export function detectSceneBoundaries(
  diffs: number[],
  sampleIntervalSec: number,
  threshold = 0.35,
  minGapSec = 1.5,
): SceneBoundary[] {
  const out: SceneBoundary[] = [];
  let lastTime = -Infinity;
  for (let i = 1; i < diffs.length; i++) {
    const d = diffs[i] ?? 0;
    const t = i * sampleIntervalSec;
    if (d >= threshold && t - lastTime >= minGapSec) {
      out.push({ time: t, strength: Math.min(1, d) });
      lastTime = t;
    }
  }
  return out;
}

/**
 * Downscaled-frame sharpness: variance of luminance over a small
 * grayscale sample. Higher = sharper (better thumbnail candidate).
 * Pure, so the thumbnail picker is testable without a canvas.
 */
export function luminanceVariance(gray: ArrayLike<number>): number {
  const n = gray.length;
  if (n === 0) return 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += gray[i];
  mean /= n;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const d = gray[i] - mean;
    acc += d * d;
  }
  return acc / n;
}
