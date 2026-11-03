import { describe, expect, it } from "vitest";
import * as marketing from "@/lib/marketing";
import { FEATURES, STEPS } from "@/lib/marketing";
import { CHUNK_BYTES } from "@/lib/storage/chunked-upload";
import { STORAGE_NOT_CONFIGURED } from "@/lib/storage/not-configured";
import { stageServerCopy } from "@/lib/storage/stage-upload";

/**
 * Phase 10 — "no demo, real only" pins.
 *
 * If any of these fail, the homepage is showing something that is not
 * real — fix the copy or the code, never the test.
 */

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
}

describe("phase 10: no demo content in marketing copy", () => {
  it("exports no demo section at all", () => {
    expect("DEMO_STYLES" in marketing).toBe(false);
    expect("DEMO_NOTE" in marketing).toBe(false);
    expect("DemoStyle" in marketing).toBe(false);
  });

  it("contains no illustration, drawing, or demo wording anywhere", () => {
    const strings: string[] = [];
    collectStrings(marketing, strings);
    expect(strings.length).toBeGreaterThan(0);
    for (const text of strings) {
      expect(text.toLowerCase()).not.toMatch(/illustrat|drawing/);
      expect(text.toLowerCase()).not.toMatch(/\bdemo\b/);
    }
  });

  it("step 1 no longer claims a video arrives via a connected channel", () => {
    expect(STEPS[0].body).not.toContain("YouTube");
    expect(STEPS[0].body).toContain("stays in your browser");
  });

  it("the moments card uses the real 15–60 second window", () => {
    expect(FEATURES[0].body).toContain("15–60 second moments");
    expect(FEATURES[0].body).not.toContain("30–60 second moments");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type MinimalFile = {
  name: string;
  type: string;
  size: number;
  slice: (start: number, end: number) => Blob;
};

function smallVideoFile(): MinimalFile {
  return {
    name: "clip.mp4",
    type: "video/mp4",
    size: 100,
    slice: () => new Blob(["x".repeat(100)]),
  };
}

describe("phase 10: server staging fallback", () => {
  it("falls back honestly when storage is not configured (503)", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: STORAGE_NOT_CONFIGURED }, 503)) as typeof fetch;
    const result = await stageServerCopy(
      smallVideoFile() as unknown as File,
      { fetchImpl },
    );
    expect(result).toEqual({ staged: false, reason: "not-configured" });
  });

  it("reports a real staged upload on success", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: unknown) => {
      const url = String(input);
      calls.push(url);
      if (url === "/api/uploads/initiate") {
        return jsonResponse({
          uploadId: "up-9",
          key: "uploads/abc/clip.mp4",
          chunkBytes: CHUNK_BYTES,
          partUrls: ["https://r2.example/part-1"],
        });
      }
      if (url === "/api/uploads/complete") {
        return jsonResponse({ ok: true });
      }
      return new Response(null, {
        status: 200,
        headers: { etag: '"etag-1"' },
      });
    }) as typeof fetch;
    const result = await stageServerCopy(
      smallVideoFile() as unknown as File,
      { fetchImpl },
    );
    expect(result).toEqual({
      staged: true,
      key: "uploads/abc/clip.mp4",
      uploadId: "up-9",
    });
    expect(calls).toContain("/api/uploads/initiate");
    expect(calls).toContain("/api/uploads/complete");
  });

  it("throws on a non-config failure instead of faking success", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: "Something broke." }, 500)) as typeof fetch;
    await expect(
      stageServerCopy(smallVideoFile() as unknown as File, { fetchImpl }),
    ).rejects.toThrow("Something broke.");
  });

  it("throws when a part keeps failing instead of reporting a save", async () => {
    const fetchImpl = (async (input: unknown) => {
      const url = String(input);
      if (url === "/api/uploads/initiate") {
        return jsonResponse({
          uploadId: "up-9",
          key: "uploads/abc/clip.mp4",
          chunkBytes: CHUNK_BYTES,
          partUrls: ["https://r2.example/part-1"],
        });
      }
      return new Response(null, { status: 500 });
    }) as typeof fetch;
    await expect(
      stageServerCopy(smallVideoFile() as unknown as File, { fetchImpl }),
    ).rejects.toThrow(/Part 1 upload failed/);
  });
});
