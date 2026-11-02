import { getKey, type FetchImpl } from "@/lib/ai/providers";

/**
 * Music-recognition interface. Implementations identify recorded music
 * in an audio sample; a match means the clip may contain copyrighted
 * music and the UI warns before export. This is a detection aid, not
 * legal advice, and nothing here is designed to evade detection.
 *
 * Adapter: AudD (docs.audd.io). Standard endpoint:
 *   POST https://api.audd.io/  (multipart/form-data)
 *   fields: api_token, file (audio, ≤10 MB), return=apple_music,spotify
 * A `result: null` body means "no match" — distinct from an error.
 * The enterprise endpoint (long files) is deliberately not used: the
 * browser sends a ≤15 s sample, which the standard endpoint covers.
 */

export type MusicMatch = {
  artist: string;
  title: string;
  album: string | null;
  label: string | null;
  timecode: string | null;
};

export type MusicDetection = {
  detected: boolean;
  match: MusicMatch | null;
};

export interface MusicDetector {
  detect(audio: Blob, filename: string): Promise<MusicDetection>;
}

type AuddResponse = {
  status?: string;
  result?: {
    artist?: string | null;
    title?: string | null;
    album?: string | null;
    label?: string | null;
    timecode?: string | null;
  } | null;
  error?: { error_code?: number; error_message?: string };
};

/** Parse an AudD JSON body. Throws on an API error object. */
export function parseAuddResponse(data: AuddResponse): MusicDetection {
  if (data.error) {
    throw new Error(
      `AudD error ${data.error.error_code ?? "?"}: ${data.error.error_message ?? "unknown"}`,
    );
  }
  const r = data.result;
  if (!r || !r.artist || !r.title) return { detected: false, match: null };
  return {
    detected: true,
    match: {
      artist: r.artist,
      title: r.title,
      album: r.album ?? null,
      label: r.label ?? null,
      timecode: r.timecode ?? null,
    },
  };
}

export class AuddDetector implements MusicDetector {
  constructor(
    private readonly apiToken: string,
    private readonly fetchImpl: FetchImpl = fetch,
  ) {}

  async detect(audio: Blob, filename: string): Promise<MusicDetection> {
    const form = new FormData();
    form.append("api_token", this.apiToken);
    form.append("file", audio, filename);
    form.append("return", "apple_music,spotify");
    const res = await this.fetchImpl("https://api.audd.io/", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      throw new Error(`AudD request failed (HTTP ${res.status})`);
    }
    const data = (await res.json()) as AuddResponse;
    return parseAuddResponse(data);
  }
}

/** Build the configured detector, or null when AUDD_API_TOKEN is absent. */
export function getMusicDetector(fetchImpl?: FetchImpl): MusicDetector | null {
  const token = getKey("AUDD_API_TOKEN");
  if (!token) return null;
  return new AuddDetector(token, fetchImpl);
}
