/**
 * Pluggable ASR provider interface.
 *
 * Today only Groq Whisper is wired (it is the provider the owner
 * already pays nothing extra for and whose key is on file). A second
 * provider is added by implementing AsrProvider and registering it in
 * resolveAsr — the transcribe route never calls a provider directly.
 */

import type { TranscriptSegment, WordTimestamp } from "@/lib/captions";
import { getKey } from "@/lib/ai/providers";
import { groqTranscribe } from "@/lib/ai/groq";

export type AsrResult = {
  segments: TranscriptSegment[];
  model: string;
  words?: WordTimestamp[];
};

export type AsrProvider = {
  name: string;
  transcribe: (
    audio: Blob,
    filename: string,
    opts?: { wordTimestamps?: boolean },
  ) => Promise<AsrResult>;
};

const groqAsr: AsrProvider = {
  name: "groq",
  transcribe: (audio, filename, opts) =>
    groqTranscribe(audio, filename, opts ?? {}),
};

/**
 * Resolve the configured ASR provider. Returns null when no provider
 * key is set — callers must fail closed (503) in that case.
 */
export function resolveAsr(): AsrProvider | null {
  if (getKey("GROQ_API_KEY")) return groqAsr;
  return null;
}
