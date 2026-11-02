/**
 * Speaker diarization — interface only, env-gated, no paid calls.
 *
 * "Who spoke when" needs a dedicated diarization provider (e.g. a
 * pyannote-based API). No diarization provider or key exists yet, so
 * this module deliberately contains NO implementation that calls a
 * paid API: resolveDiarization() returns null until the owner picks a
 * provider and sets DIARIZATION_PROVIDER + DIARIZATION_API_KEY, and
 * the /api/clips/diarize route honestly 503s until then. The interface
 * below is the contract the future adapter must satisfy.
 */

import { getKey } from "@/lib/ai/providers";

export type SpeakerTurn = {
  speaker: string;
  start: number;
  end: number;
};

export type DiarizationProvider = {
  name: string;
  diarize: (audio: Blob, filename: string) => Promise<SpeakerTurn[]>;
};

/**
 * Returns the configured provider, or null when diarization is not
 * configured. Never returns a fake provider: without a real provider,
 * diarization is unavailable, not approximated.
 */
export function resolveDiarization(): DiarizationProvider | null {
  const provider = process.env.DIARIZATION_PROVIDER;
  const key = getKey("DIARIZATION_API_KEY");
  if (!provider || !key) return null;
  // No adapter exists yet for any provider name — a future slice adds
  // one here and registers it. Until then, configured-but-unknown is
  // still "not configured" rather than a silent fallback.
  return null;
}

export const DIARIZATION_NOT_CONFIGURED =
  "Speaker diarization is not configured yet — set DIARIZATION_PROVIDER and DIARIZATION_API_KEY, or use the transcript without speaker labels.";
