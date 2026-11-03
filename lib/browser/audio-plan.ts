/**
 * Clean-audio plan (ClipForge Phase 15).
 *
 * Pure logic for what a render's audio mix contains. The browser
 * renderer (lib/browser/render.ts) applies this plan; the plan itself
 * is testable without browser APIs.
 *
 * Treatments:
 * - "original": today's behaviour — the video's own audio is mixed in.
 * - "muted": the video's own audio is NOT connected, so the render
 *   carries no original audio track. Voiceover narration, if enabled,
 *   still plays (it is new narration, not the original track), and a
 *   picked licensed track still mixes as background.
 * - "replaced": the video's own audio is NOT connected and the picked
 *   licensed track becomes the soundtrack at full volume. This is
 *   only reachable when a real licensed track is selected (a
 *   user-uploaded track they hold a licence for — the site ships no
 *   built-in tracks; LICENSED_TRACKS is empty). Asking for "replaced"
 *   without a track falls back to "muted" rather than inventing one.
 */

export type AudioTreatment = "original" | "muted" | "replaced";

export type AudioPlan = {
  /** The treatment actually applied (replaced-without-track → muted). */
  treatment: AudioTreatment;
  /** Whether the video element's own audio is connected to the mix. */
  connectOriginal: boolean;
  /** Gain for the licensed track, or null when no track is mixed. */
  musicGain: number | null;
  /** Whether the output carries any audio track at all. */
  hasAudioTrack: boolean;
};

/** Background-track gain, matching the existing render default. */
export const BACKGROUND_MUSIC_GAIN = 0.15;

/** Soundtrack gain when a licensed track replaces the original. */
export const REPLACEMENT_MUSIC_GAIN = 1.0;

export function resolveAudioPlan(
  treatment: AudioTreatment,
  opts: { hasMusic: boolean; hasVoiceover: boolean },
): AudioPlan {
  const effective: AudioTreatment =
    treatment === "replaced" && !opts.hasMusic ? "muted" : treatment;
  const connectOriginal = effective === "original";
  const musicGain = !opts.hasMusic
    ? null
    : effective === "replaced"
      ? REPLACEMENT_MUSIC_GAIN
      : BACKGROUND_MUSIC_GAIN;
  return {
    treatment: effective,
    connectOriginal,
    musicGain,
    hasAudioTrack:
      connectOriginal || opts.hasVoiceover || opts.hasMusic,
  };
}

/**
 * Treatments the UI may offer. "replaced" appears only when a real
 * licensed track is selected; otherwise it is hidden, not faked.
 */
export function availableTreatments(
  hasLicensedTrack: boolean,
): AudioTreatment[] {
  return hasLicensedTrack
    ? ["original", "muted", "replaced"]
    : ["original", "muted"];
}
