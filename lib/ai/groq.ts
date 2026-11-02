import type { TranscriptSegment } from "@/lib/captions";
import {
  getKey,
  providerErrorMessage,
  type FetchImpl,
} from "@/lib/ai/providers";

const GROQ_BASE = "https://api.groq.com/openai/v1";

export const GROQ_WHISPER_PRIMARY =
  process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3-turbo";
const GROQ_WHISPER_FALLBACK = "whisper-large-v3";
export const GROQ_TEXT_MODEL =
  process.env.GROQ_TEXT_MODEL ?? "openai/gpt-oss-20b";

type WhisperVerboseJson = {
  segments?: Array<{ start: number; end: number; text: string }>;
  text?: string;
};

/**
 * Transcribe an audio blob with Groq Whisper. Returns timestamped
 * segments. Falls back to whisper-large-v3 if the primary model is
 * rejected (404/400) — the transcript, never a fake, is what matters.
 */
export async function groqTranscribe(
  audio: Blob,
  filename: string,
  fetchImpl: FetchImpl = fetch,
): Promise<{ segments: TranscriptSegment[]; model: string }> {
  const key = getKey("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY is not configured");

  const models = [GROQ_WHISPER_PRIMARY, GROQ_WHISPER_FALLBACK];
  let lastError: Error | null = null;
  for (const model of models) {
    const form = new FormData();
    form.append("file", audio, filename);
    form.append("model", model);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    const res = await fetchImpl(`${GROQ_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (res.ok) {
      const data = (await res.json()) as WhisperVerboseJson;
      const segments: TranscriptSegment[] = (data.segments ?? [])
        .filter(
          (s) =>
            Number.isFinite(s.start) &&
            Number.isFinite(s.end) &&
            s.end > s.start &&
            typeof s.text === "string",
        )
        .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }))
        .filter((s) => s.text.length > 0);
      return { segments, model };
    }
    lastError = new Error(providerErrorMessage(res, "Groq Whisper"));
    // Only retry with the fallback model on model-level rejections.
    if (res.status !== 400 && res.status !== 404) break;
  }
  throw lastError ?? new Error("Groq Whisper request failed");
}

/** Groq chat completion (text). Returns the assistant message text. */
export async function groqChat(
  messages: Array<{ role: string; content: string }>,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  const key = getKey("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY is not configured");
  const res = await fetchImpl(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_TEXT_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) throw new Error(providerErrorMessage(res, "Groq chat"));
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}
