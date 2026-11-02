/**
 * YouTube upload adapter (ClipForge Phase 3 — the first live adapter).
 *
 * Uses the YouTube Data API v3 videos.insert endpoint with
 * uploadType=multipart: one multipart/related body carrying the JSON
 * metadata part and the raw video bytes. Real HTTP happens only when
 * called with a real token; tests inject a mocked fetch and assert the
 * request shape. The response id is the provider post id.
 *
 * Other platforms live in adapters/stubs.ts until their app review
 * passes — their upload functions refuse honestly rather than
 * pretending to publish.
 */

import type { FetchImpl } from "@/lib/ai/providers";
import type { UploadInput, UploadResult } from "../publisher";

function boundary(): string {
  return `clipforge-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * Upload a Short to YouTube. Returns the video id on success.
 * Errors carry the HTTP status (for retry decisions), never tokens.
 */
export async function uploadYoutubeShort(
  input: UploadInput,
  fetchImpl: FetchImpl = fetch,
): Promise<UploadResult> {
  const meta = {
    snippet: {
      title: input.title ?? "Untitled clip",
      description: input.description,
      tags: input.tags,
      categoryId: "22",
    },
    status: {
      privacyStatus: input.visibility,
      selfDeclaredMadeForKids: false,
    },
  };
  const sep = boundary();
  // Build multipart/related: JSON part + binary part. TextEncoder keeps
  // the JSON ASCII-safe; bytes are concatenated, never stringified.
  const header = new TextEncoder().encode(
    `--${sep}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(meta) +
      `\r\n--${sep}\r\nContent-Type: video/mp4\r\n\r\n`,
  );
  const footer = new TextEncoder().encode(`\r\n--${sep}--\r\n`);
  const body = new Uint8Array(
    header.length + input.mediaBytes.length + footer.length,
  );
  body.set(header, 0);
  body.set(input.mediaBytes, header.length);
  body.set(footer, header.length + input.mediaBytes.length);
  const res = await fetchImpl(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": `multipart/related; boundary=${sep}`,
      },
      body: body as unknown as BodyInit,
    },
  );
  if (!res.ok) {
    return {
      ok: false,
      code: "UPLOAD_FAILED",
      message: `YouTube upload failed (HTTP ${res.status})`,
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
    };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const id =
    json !== null && typeof json === "object"
      ? (json as Record<string, unknown>).id
      : null;
  if (typeof id !== "string" || !id) {
    return {
      ok: false,
      code: "UPLOAD_FAILED",
      message: "YouTube upload returned no video id",
      retryable: false,
    };
  }
  return {
    ok: true,
    providerPostId: id,
    providerUrl: `https://www.youtube.com/shorts/${id}`,
  };
}
