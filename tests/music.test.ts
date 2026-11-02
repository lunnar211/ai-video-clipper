import { describe, expect, it, vi } from "vitest";
import { AuddDetector, parseAuddResponse } from "@/lib/music/audd";
import {
  ROYALTY_FREE_SOURCES,
  TRACK_LICENCES,
} from "@/lib/music/tracks";

describe("parseAuddResponse", () => {
  it("parses a match with artist + title", () => {
    const res = parseAuddResponse({
      status: "success",
      result: {
        artist: "Example Artist",
        title: "Example Song",
        album: "Example Album",
        label: "Example Label",
        timecode: "00:03",
      },
    });
    expect(res.detected).toBe(true);
    expect(res.match).toMatchObject({
      artist: "Example Artist",
      title: "Example Song",
    });
  });

  it("treats result null as no match (not an error)", () => {
    expect(parseAuddResponse({ status: "success", result: null })).toEqual({
      detected: false,
      match: null,
    });
  });

  it("throws on an API error object", () => {
    expect(() =>
      parseAuddResponse({
        error: { error_code: 901, error_message: "No api_token" },
      }),
    ).toThrow("901");
  });
});

describe("AuddDetector (mocked, $0 spent)", () => {
  it("posts multipart to api.audd.io and returns the match", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          status: "success",
          result: { artist: "A", title: "B" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const detector = new AuddDetector(
      "test-token-never-real",
      fetchMock as unknown as typeof fetch,
    );
    const res = await detector.detect(new Blob(["x"]), "sample.wav");
    expect(res.detected).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.audd.io/");
    expect(init.body).toBeInstanceOf(FormData);
  });
});

describe("royalty-free picker data", () => {
  it("every source carries a licence note (no silent unlicensed music)", () => {
    expect(ROYALTY_FREE_SOURCES.length).toBeGreaterThan(0);
    for (const s of ROYALTY_FREE_SOURCES) {
      expect(s.licenceNote.length).toBeGreaterThan(0);
    }
  });

  it("upload licences include an own-licence option", () => {
    expect(TRACK_LICENCES).toContain("Own licensed track");
  });
});
