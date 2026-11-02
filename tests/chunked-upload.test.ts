import { describe, expect, it } from "vitest";
import {
  CHUNK_BYTES,
  partRanges,
  uploadFileChunked,
} from "@/lib/storage/chunked-upload";

describe("partRanges", () => {
  it("returns one part for a tiny file", () => {
    expect(partRanges(1)).toEqual([{ partNumber: 1, start: 0, end: 1 }]);
  });

  it("returns one part for exactly one chunk", () => {
    expect(partRanges(CHUNK_BYTES)).toEqual([
      { partNumber: 1, start: 0, end: CHUNK_BYTES },
    ]);
  });

  it("splits one byte over the boundary into two parts", () => {
    expect(partRanges(CHUNK_BYTES + 1)).toEqual([
      { partNumber: 1, start: 0, end: CHUNK_BYTES },
      { partNumber: 2, start: CHUNK_BYTES, end: CHUNK_BYTES + 1 },
    ]);
  });

  it("rejects non-positive and non-integer sizes", () => {
    expect(() => partRanges(0)).toThrow();
    expect(() => partRanges(-5)).toThrow();
    expect(() => partRanges(1.5)).toThrow();
  });

  it("refuses part counts the server refuses", () => {
    expect(() => partRanges(10001 * CHUNK_BYTES)).toThrow(/10000/);
  });
});

type Call = { url: string; init?: RequestInit };

type PutBehavior = { status: number; etag?: string };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Mock fetch: initiate returns part URLs, PUTs consume the put queue,
 * complete succeeds unless told otherwise. Nothing touches real R2.
 */
function makeMockFetch(opts: {
  initiate?: Response;
  putQueue?: PutBehavior[];
  complete?: Response;
}): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const putQueue = [...(opts.putQueue ?? [])];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "/api/uploads/initiate") {
      return (
        opts.initiate ??
        jsonResponse({
          uploadId: "up-1",
          key: "uploads/abc/clip.mp4",
          chunkBytes: CHUNK_BYTES,
          partUrls: [
            "https://r2.example/part-1",
            "https://r2.example/part-2",
          ],
        })
      );
    }
    if (url === "/api/uploads/complete") {
      return opts.complete ?? jsonResponse({ ok: true });
    }
    const next = putQueue.shift() ?? { status: 200, etag: '"etag-x"' };
    return new Response(null, {
      status: next.status,
      headers: next.etag ? { etag: next.etag } : {},
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function twoPartVideo(): File {
  const bytes = new Uint8Array(CHUNK_BYTES + 1);
  return new File([bytes], "clip.mp4", { type: "video/mp4" });
}

describe("uploadFileChunked", () => {
  it("uploads each part and completes with the collected ETags", async () => {
    const { calls, fetchImpl } = makeMockFetch({
      putQueue: [
        { status: 200, etag: '"etag-1"' },
        { status: 200, etag: '"etag-2"' },
      ],
    });
    const progress: [number, number][] = [];
    const result = await uploadFileChunked(twoPartVideo(), {
      fetchImpl,
      onProgress: (up, total) => progress.push([up, total]),
    });
    expect(result).toEqual({ key: "uploads/abc/clip.mp4", uploadId: "up-1" });

    const initCall = calls.find((c) => c.url === "/api/uploads/initiate");
    expect(initCall).toBeDefined();
    expect(JSON.parse(String(initCall?.init?.body))).toMatchObject({
      filename: "clip.mp4",
      mime: "video/mp4",
      sizeBytes: CHUNK_BYTES + 1,
    });

    const completeCall = calls.find((c) => c.url === "/api/uploads/complete");
    expect(JSON.parse(String(completeCall?.init?.body))).toEqual({
      key: "uploads/abc/clip.mp4",
      uploadId: "up-1",
      parts: [
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 2, etag: '"etag-2"' },
      ],
    });
    expect(progress).toEqual([
      [CHUNK_BYTES, CHUNK_BYTES + 1],
      [CHUNK_BYTES + 1, CHUNK_BYTES + 1],
    ]);
  });

  it("retries a failed part once before giving up", async () => {
    const { calls, fetchImpl } = makeMockFetch({
      putQueue: [
        { status: 500 },
        { status: 200, etag: '"etag-1"' },
        { status: 200, etag: '"etag-2"' },
      ],
    });
    const result = await uploadFileChunked(twoPartVideo(), { fetchImpl });
    expect(result.uploadId).toBe("up-1");
    expect(calls.filter((c) => c.url.startsWith("https://r2.example"))).toHaveLength(3);
  });

  it("aborts honestly when a part keeps failing (no complete call)", async () => {
    const { calls, fetchImpl } = makeMockFetch({
      putQueue: [
        { status: 500 },
        { status: 500 },
      ],
    });
    await expect(uploadFileChunked(twoPartVideo(), { fetchImpl })).rejects.toThrow(
      /Part 1 upload failed/,
    );
    expect(calls.some((c) => c.url === "/api/uploads/complete")).toBe(false);
  });

  it("surfaces the server initiate error and uploads nothing", async () => {
    const { calls, fetchImpl } = makeMockFetch({
      initiate: jsonResponse({ error: "Storage is not configured." }, 503),
    });
    await expect(uploadFileChunked(twoPartVideo(), { fetchImpl })).rejects.toThrow(
      "Storage is not configured.",
    );
    expect(calls).toHaveLength(1);
  });

  it("refuses non-video files before any network call", async () => {
    const { calls, fetchImpl } = makeMockFetch({});
    const text = new File(["hello"], "notes.txt", { type: "text/plain" });
    await expect(uploadFileChunked(text, { fetchImpl })).rejects.toThrow(
      /Only video files/,
    );
    expect(calls).toHaveLength(0);
  });

  it("refuses to continue when the server chunk size mismatches", async () => {
    const { fetchImpl } = makeMockFetch({
      initiate: jsonResponse({
        uploadId: "up-1",
        key: "uploads/abc/clip.mp4",
        chunkBytes: 5 * 1024 * 1024,
        partUrls: ["https://r2.example/part-1"],
      }),
    });
    await expect(uploadFileChunked(twoPartVideo(), { fetchImpl })).rejects.toThrow(
      /chunk size/,
    );
  });

  it("refuses a part upload that returns no ETag", async () => {
    const { fetchImpl } = makeMockFetch({
      putQueue: [{ status: 200 }],
    });
    await expect(uploadFileChunked(twoPartVideo(), { fetchImpl })).rejects.toThrow(
      /ETag/,
    );
  });
});
