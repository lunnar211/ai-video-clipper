/**
 * Phase 18 — CSP blob-fetch fix pins.
 *
 * The site's CSP connect-src does not list blob:, so fetching a
 * blob: URL back is refused by the browser. The older clip tool
 * used to fetch its own rendered clip URL for ZIP export and for
 * the post panel; Phase 18 keeps the rendered bytes in state
 * instead (the pattern Phase 17 proved in the generator). These
 * tests pin the source contract: no fetch-back anywhere, bytes
 * from state, and the CSP itself untouched.
 * They read source files because the contract lives in the
 * component wiring, not in runtime behavior (the browser proof
 * is e2e/phase18.spec.ts).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("phase 18 blob-state fix", () => {
  it("never fetches a rendered clip URL back", () => {
    const src = read("components/ClipperTool.tsx");
    expect(src).not.toContain("fetch(out.url)");
  });

  it("keeps the rendered blob in state for ZIP + post", () => {
    const src = read("components/ClipperTool.tsx");
    expect(src).toContain("blob: Blob");
    expect(src).toContain("blob: result.blob");
    expect(src).toContain("out.blob.arrayBuffer()");
    expect(src).toContain("async () => out.blob");
  });

  it("does not weaken the CSP connect-src to allow blob: fetches", () => {
    const config = read("next.config.ts");
    // Only the connect-src directive governs fetch(): img-src and
    // media-src legitimately list blob: so <video>/<img> elements
    // can play object URLs — that is not fetching.
    const connectSrc = config
      .split("\n")
      .find((line) => line.includes("connect-src"));
    expect(connectSrc).toBeDefined();
    expect(connectSrc).not.toContain("blob:");
  });

  it("post panel documents the direct-blob contract", () => {
    const src = read("components/PostClip.tsx");
    expect(src).not.toContain("browser-local blob URL");
    expect(src).toContain("never fetched back from a blob: URL");
  });
});
