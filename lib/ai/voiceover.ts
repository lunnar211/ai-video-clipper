import { getKey, type FetchImpl } from "@/lib/ai/providers";

/**
 * ElevenLabs voiceover (voice only, optional). Returns MP3 audio bytes.
 * Off by default in the sense that the route fails closed without the
 * key — the UI toggle only takes effect when the key is configured.
 */
export const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

export async function elevenLabsSpeak(
  text: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ArrayBuffer> {
  const key = getKey("ELEVENLABS_API_KEY");
  if (!key) throw new Error("ELEVENLABS_API_KEY is not configured");
  const res = await fetchImpl(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        output_format: "mp3_44100_128",
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs request failed (HTTP ${res.status})`);
  }
  return await res.arrayBuffer();
}
