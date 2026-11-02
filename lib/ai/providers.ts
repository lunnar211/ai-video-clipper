/**
 * Honest AI-key map. Each provider is used ONLY for what its key can
 * actually do, and every route fails closed with AI_NOT_CONNECTED when
 * its key is absent — never a fake result.
 *
 * - Groq: Whisper transcription (audio -> timestamped transcript) + text
 *   chat for titles/highlights. PRIMARY path.
 * - Gemini: video-understanding is not used server-side (video never
 *   leaves the browser); Gemini text is the second opinion for highlight
 *   selection and a fallback for titles.
 * - OpenRouter: free-text-tier fallback for titles/captions/hashtags ONLY.
 *   Its image/video APIs are paid-only and are NOT used.
 * - ElevenLabs: optional AI voiceover track for clips (voice only).
 * - NVIDIA: text-safety check on generated captions/titles ONLY.
 * - fal.ai: NOT wired (video generation is not video clipping).
 * - Hugging Face: NOT wired (the owner's stored token is 401-invalid).
 * - Brevo: NOT wired (the owner's key is 401; email is a later step).
 */

export const AI_NOT_CONNECTED = "AI is not connected yet";

export function getKey(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

export type FetchImpl = typeof fetch;

export function providerErrorMessage(res: Response, provider: string): string {
  return `${provider} request failed (HTTP ${res.status})`;
}
