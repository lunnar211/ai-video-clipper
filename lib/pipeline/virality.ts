/**
 * ClipForge weighted virality score.
 *
 * The pipeline score is hook 40% / pacing 35% / engagement 25%.
 * It is RECONCILED with (not a silent replacement of) the existing
 * per-clip metadata sub-scores {hook, emotion, pacing, ending}:
 *   hook       -> hook (direct)
 *   pacing     -> pacing (direct)
 *   engagement -> mean(emotion, ending) — emotional pull plus payoff.
 * Every score is an estimate, never a promise of views. All inputs are
 * clamped to 0..100; missing inputs fall back to neutral 50s.
 */

export type MetadataSubscores = {
  hook: number;
  emotion: number;
  pacing: number;
  ending: number;
};

export type WeightedVirality = {
  /** Weighted total, 0..100, rounded to an integer. */
  score: number;
  components: {
    hook: number;
    pacing: number;
    engagement: number;
  };
  weights: { hook: 0.4; pacing: 0.35; engagement: 0.25 };
  /** One-line written reason per component, for the UI. */
  reasons: {
    hook: string;
    pacing: string;
    engagement: string;
  };
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 50;
  return Math.min(100, Math.max(0, x));
}

function reasonFor(label: string, value: number): string {
  if (value >= 80) return `Strong ${label} — likely to hold attention.`;
  if (value >= 60) return `Solid ${label} — works, with room to sharpen.`;
  if (value >= 40) return `Weak ${label} — consider a stronger cut.`;
  return `Very weak ${label} — this clip may underperform.`;
}

/**
 * Combine metadata sub-scores into the pipeline's weighted score.
 * Partial input is allowed; absent fields default to 50 (neutral).
 */
export function weightedVirality(
  sub: Partial<MetadataSubscores>,
): WeightedVirality {
  const hook = clamp01(sub.hook ?? 50);
  const pacing = clamp01(sub.pacing ?? 50);
  const engagement = clamp01(
    (clamp01(sub.emotion ?? 50) + clamp01(sub.ending ?? 50)) / 2,
  );
  const score = Math.round(
    hook * 0.4 + pacing * 0.35 + engagement * 0.25,
  );
  return {
    score,
    components: { hook, pacing, engagement },
    weights: { hook: 0.4, pacing: 0.35, engagement: 0.25 },
    reasons: {
      hook: reasonFor("hook", hook),
      pacing: reasonFor("pacing", pacing),
      engagement: reasonFor("engagement", engagement),
    },
  };
}
