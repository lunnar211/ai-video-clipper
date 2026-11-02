/**
 * Audio-fingerprint provider interface (ClipForge Phase 2).
 *
 * A provider identifies recorded music in an audio sample. A match
 * means the clip MAY contain copyrighted music — it is a detection
 * aid, never legal advice, and nothing here is designed to evade
 * detection. The critical honesty rule: when no provider is
 * configured, or a provider errors, the result is "not scanned" —
 * unscanned content is NEVER reported as clean.
 *
 * Providers, in priority order:
 * 1. AudD (AUDD_API_TOKEN) — see lib/music/audd.ts for the adapter.
 * 2. ACRCloud (ACRCloud keys) — documented identify API shape only;
 *    never called without keys, and never live-tested by this repo
 *    (no ACRCloud account exists here). Marked as such in docs.
 */

import { createHmac } from "node:crypto";
import {
  getMusicDetector,
  type MusicDetection,
  type MusicMatch,
} from "@/lib/music/audd";
import { getKey, type FetchImpl } from "@/lib/ai/providers";

export type ScanResult = {
  /** False when no provider ran — the ONLY honest value then. */
  scanned: boolean;
  provider: "audd" | "acrcloud" | null;
  detected: boolean;
  match: MusicMatch | null;
  /** Human-readable note for the UI (e.g. why a scan did not run). */
  note: string;
};

export const NOT_SCANNED: ScanResult = {
  scanned: false,
  provider: null,
  detected: false,
  match: null,
  note: "Not scanned — no music-recognition key is connected, so this clip has not been checked.",
};

export interface FingerprintProvider {
  readonly name: "audd" | "acrcloud";
  scan(audio: Blob, filename: string): Promise<ScanResult>;
}

export class AuddFingerprintProvider implements FingerprintProvider {
  readonly name = "audd" as const;
  constructor(private readonly fetchImpl?: FetchImpl) {}
  async scan(audio: Blob, filename: string): Promise<ScanResult> {
    const detector = getMusicDetector(this.fetchImpl);
    if (!detector) return NOT_SCANNED;
    const result: MusicDetection = await detector.detect(audio, filename);
    return {
      scanned: true,
      provider: "audd",
      detected: result.detected,
      match: result.match,
      note: result.detected
        ? "Match found — this clip may contain copyrighted music."
        : "No match found in the recognition database. That is not proof the clip is clear — databases are incomplete.",
    };
  }
}

type AcrCloudIdentifyResponse = {
  status?: { code?: number; msg?: string };
  metadata?: {
    music?: {
      title?: string;
      artists?: { name?: string }[];
      album?: { name?: string };
      label?: string;
    }[];
  };
};

/** Parse an ACRCloud identify body. Throws on a non-zero status code. */
export function parseAcrCloudResponse(
  data: AcrCloudIdentifyResponse,
): MusicDetection {
  const code = data.status?.code;
  if (code !== undefined && code !== 0) {
    throw new Error(
      `ACRCloud error ${code}: ${data.status?.msg ?? "unknown"}`,
    );
  }
  const first = data.metadata?.music?.[0];
  if (!first?.title) return { detected: false, match: null };
  return {
    detected: true,
    match: {
      artist: (first.artists ?? []).map((a) => a.name ?? "").filter(Boolean).join(", ") || "Unknown artist",
      title: first.title,
      album: first.album?.name ?? null,
      label: first.label ?? null,
      timecode: null,
    },
  };
}

/**
 * Build the ACRCloud identify signature (documented shape):
 * HMAC-SHA1 over METHOD + "\n" + URI + "\n" + access_key + "\n" +
 * data_type + "\n" + signature_version + "\n" + timestamp, base64.
 * Pure + tested; the network call below is never made without keys.
 */
export function acrCloudSignature(
  accessSecret: string,
  parts: {
    method: string;
    uri: string;
    accessKey: string;
    dataType: string;
    signatureVersion: string;
    timestamp: string;
  },
): string {
  const stringToSign = [
    parts.method,
    parts.uri,
    parts.accessKey,
    parts.dataType,
    parts.signatureVersion,
    parts.timestamp,
  ].join("\n");
  return createHmac("sha1", accessSecret).update(stringToSign).digest("base64");
}

export class AcrCloudFingerprintProvider implements FingerprintProvider {
  readonly name = "acrcloud" as const;
  constructor(
    private readonly accessKey: string,
    private readonly accessSecret: string,
    private readonly host: string,
    private readonly fetchImpl: FetchImpl = fetch,
  ) {}

  async scan(audio: Blob, filename: string): Promise<ScanResult> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = acrCloudSignature(this.accessSecret, {
      method: "POST",
      uri: "/v1/identify",
      accessKey: this.accessKey,
      dataType: "audio",
      signatureVersion: "1",
      timestamp,
    });
    const form = new FormData();
    form.append("sample", audio, filename);
    form.append("sample_bytes", String(audio.size));
    form.append("access_key", this.accessKey);
    form.append("data_type", "audio");
    form.append("signature_version", "1");
    form.append("signature", signature);
    form.append("timestamp", timestamp);
    const res = await this.fetchImpl(`https://${this.host}/v1/identify`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      throw new Error(`ACRCloud request failed (HTTP ${res.status})`);
    }
    const data = (await res.json()) as AcrCloudIdentifyResponse;
    const result = parseAcrCloudResponse(data);
    return {
      scanned: true,
      provider: "acrcloud",
      detected: result.detected,
      match: result.match,
      note: result.detected
        ? "Match found — this clip may contain copyrighted music."
        : "No match found in the recognition database. That is not proof the clip is clear — databases are incomplete.",
    };
  }
}

export type FingerprintConfig = {
  auddToken: string | null;
  acrAccessKey: string | null;
  acrAccessSecret: string | null;
  acrHost: string | null;
};

export function resolveFingerprintConfig(): FingerprintConfig {
  return {
    auddToken: getKey("AUDD_API_TOKEN"),
    acrAccessKey: getKey("ACRCLOUD_ACCESS_KEY"),
    acrAccessSecret: getKey("ACRCLOUD_ACCESS_SECRET"),
    acrHost: getKey("ACRCLOUD_HOST") ?? "identify-eu-west-1.acrcloud.com",
  };
}

/** First configured provider wins (AudD, then ACRCloud), else null. */
export function getFingerprintProvider(
  fetchImpl?: FetchImpl,
): FingerprintProvider | null {
  const cfg = resolveFingerprintConfig();
  if (cfg.auddToken) return new AuddFingerprintProvider(fetchImpl);
  if (cfg.acrAccessKey && cfg.acrAccessSecret && cfg.acrHost) {
    return new AcrCloudFingerprintProvider(
      cfg.acrAccessKey,
      cfg.acrAccessSecret,
      cfg.acrHost,
      fetchImpl,
    );
  }
  return null;
}
