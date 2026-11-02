/**
 * Browser chunked-upload client (ClipForge Phase 7).
 *
 * Completes the Phase 1 multipart API (/api/uploads/initiate +
 * /api/uploads/complete, backed by R2 presigned URLs), which until now
 * had no browser caller: large files never pass through Vercel
 * functions — the browser PUTs each chunk straight to R2 and the
 * server only orchestrates. This client is the caller.
 *
 * Design notes:
 * - Chunk size MUST match the server's CHUNK_BYTES (8 MB); the client
 *   takes the server-returned chunkBytes and refuses to continue if it
 *   does not match, rather than silently uploading misaligned parts.
 * - Every network call goes through an injectable fetch so unit tests
 *   never touch real R2 (and the client never assumes a live bucket).
 * - Each part is retried once on failure; a part that still fails
 *   aborts the whole upload with an honest error (no partial success
 *   is reported as done).
 * - Filenames are never logged here (they may contain personal info).
 */

export const CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_PARTS = 10000;

export type PartRange = {
  partNumber: number;
  start: number;
  end: number;
};

export type UploadProgress = (uploadedBytes: number, totalBytes: number) => void;

export type ChunkedUploadResult = {
  key: string;
  uploadId: string;
};

type MinimalFile = {
  name: string;
  type: string;
  size: number;
  slice: (start: number, end: number) => Blob;
};

/**
 * Split a file into 1-based part ranges. Pure and unit-tested.
 * Throws on non-positive sizes and on part counts the server refuses.
 */
export function partRanges(
  sizeBytes: number,
  chunkBytes: number = CHUNK_BYTES,
): PartRange[] {
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error("sizeBytes must be a positive integer.");
  }
  if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) {
    throw new Error("chunkBytes must be a positive integer.");
  }
  const count = Math.ceil(sizeBytes / chunkBytes);
  if (count > MAX_PARTS) {
    throw new Error(
      `File needs ${count} parts, over the server maximum of ${MAX_PARTS}.`,
    );
  }
  const ranges: PartRange[] = [];
  for (let i = 0; i < count; i++) {
    ranges.push({
      partNumber: i + 1,
      start: i * chunkBytes,
      end: Math.min(sizeBytes, (i + 1) * chunkBytes),
    });
  }
  return ranges;
}

type InitiateResponse = {
  uploadId: string;
  key: string;
  chunkBytes: number;
  partUrls: string[];
};

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error.length > 0) {
      return data.error;
    }
  } catch {
    /* fall through to the status-based message */
  }
  return `Request failed (HTTP ${res.status}).`;
}

function isInitiateResponse(value: unknown): value is InitiateResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.uploadId === "string" &&
    typeof v.key === "string" &&
    typeof v.chunkBytes === "number" &&
    Array.isArray(v.partUrls) &&
    v.partUrls.every((u) => typeof u === "string")
  );
}

/**
 * Upload a video file in chunks. Returns the server key + upload id on
 * success; throws an honest error otherwise (validation, initiate,
 * part upload, or completion — nothing partial is reported as done).
 */
export async function uploadFileChunked(
  file: MinimalFile,
  opts: {
    fetchImpl?: typeof fetch;
    onProgress?: UploadProgress;
    /** Extra attempts per part after the first try (default 1). */
    maxPartRetries?: number;
  } = {},
): Promise<ChunkedUploadResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxPartRetries = opts.maxPartRetries ?? 1;
  if (!file.type.startsWith("video/")) {
    throw new Error("Only video files can be uploaded.");
  }
  const ranges = partRanges(file.size);

  const initRes = await fetchImpl("/api/uploads/initiate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mime: file.type,
      sizeBytes: file.size,
    }),
  });
  if (!initRes.ok) {
    throw new Error(await readErrorMessage(initRes));
  }
  const init = (await initRes.json()) as unknown;
  if (!isInitiateResponse(init)) {
    throw new Error("Upload start returned an unexpected response.");
  }
  if (init.chunkBytes !== CHUNK_BYTES) {
    throw new Error(
      `Server chunk size (${init.chunkBytes}) does not match the client chunk size (${CHUNK_BYTES}).`,
    );
  }
  if (init.partUrls.length !== ranges.length) {
    throw new Error(
      `Server returned ${init.partUrls.length} part URLs for ${ranges.length} parts.`,
    );
  }

  const parts: { partNumber: number; etag: string }[] = [];
  let uploaded = 0;
  for (const range of ranges) {
    const url = init.partUrls[range.partNumber - 1];
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxPartRetries; attempt++) {
      const putRes = await fetchImpl(url, {
        method: "PUT",
        body: file.slice(range.start, range.end),
      });
      if (putRes.ok) {
        const etag = putRes.headers.get("etag");
        if (!etag) {
          throw new Error(
            `Part ${range.partNumber} upload did not return an ETag.`,
          );
        }
        parts.push({ partNumber: range.partNumber, etag });
        uploaded += range.end - range.start;
        opts.onProgress?.(uploaded, file.size);
        lastError = null;
        break;
      }
      lastError = new Error(
        `Part ${range.partNumber} upload failed (HTTP ${putRes.status}).`,
      );
    }
    if (lastError) throw lastError;
  }

  const completeRes = await fetchImpl("/api/uploads/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key: init.key,
      uploadId: init.uploadId,
      parts,
    }),
  });
  if (!completeRes.ok) {
    throw new Error(await readErrorMessage(completeRes));
  }
  return { key: init.key, uploadId: init.uploadId };
}
