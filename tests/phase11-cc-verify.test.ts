import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  CC_VERIFY_HOSTS,
  classifyLicense,
  parseArchiveUrl,
  parseWikimediaUrl,
  verifyCcUrl,
} from "@/lib/imports/cc-verify";
import { combineAttributionLines } from "@/lib/rights/attribution";
import { resetRateLimits } from "@/lib/rate-limit";
import { POST as ccVerifyPost } from "@/app/api/imports/cc-verify/route";

/**
 * Phase 11 — CC-verified paste import pins.
 *
 * If any of these fail, the paste path is accepting something it
 * must refuse (a host, a licence, a non-video) or refusing something
 * it must accept — fix the code, never the test.
 */

const publicLookup = async () => ["93.184.216.34"];

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function commonsPage(overrides: Record<string, unknown> = {}) {
  return jsonRes({
    query: {
      pages: [
        {
          title: "File:Example video.mp4",
          imageinfo: [
            {
              url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Example_video.mp4",
              descriptionurl:
                "https://commons.wikimedia.org/wiki/File:Example_video.mp4",
              mime: "video/mp4",
              size: 12345,
              user: "UploaderName",
              extmetadata: {
                LicenseShortName: { value: "CC BY-SA 4.0" },
                LicenseUrl: {
                  value: "https://creativecommons.org/licenses/by-sa/4.0/",
                },
                Artist: { value: "<a href=\"https://example.invalid\">Jane Doe</a>" },
              },
              ...overrides,
            },
          ],
        },
      ],
    },
  });
}

function archiveItem(overrides: Record<string, unknown> = {}) {
  return jsonRes({
    metadata: {
      title: "Archive Video",
      creator: "John Smith",
      licenseurl: "https://creativecommons.org/licenses/by/4.0/",
      ...overrides,
    },
    files: [
      { name: "archive_video.mp4", format: "h.264", size: 999, source: "original" },
      { name: "archive_video_512kb.mp4", format: "h.264", size: 100, source: "derivative" },
      { name: "archive_video_files.xml", format: "Metadata", size: 10, source: "metadata" },
    ],
  });
}

describe("phase 11: licence classification", () => {
  it("accepts CC-BY, CC-BY-SA, CC0, and public domain", () => {
    expect(classifyLicense("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/")).toBe("CC-BY");
    expect(classifyLicense("CC BY-SA 4.0", undefined)).toBe("CC-BY-SA");
    expect(classifyLicense("CC0 1.0", undefined)).toBe("CC0");
    expect(classifyLicense("Public domain", undefined)).toBe("public-domain");
    expect(classifyLicense(undefined, "https://creativecommons.org/publicdomain/mark/1.0/")).toBe("public-domain");
    expect(classifyLicense(undefined, "https://creativecommons.org/publicdomain/zero/1.0/")).toBe("CC0");
  });

  it("refuses NC, ND, and reserved terms even when a free term is also present", () => {
    expect(classifyLicense("CC BY-NC-SA 4.0", undefined)).toBe("not-free");
    expect(classifyLicense("CC BY-ND 4.0", undefined)).toBe("not-free");
    expect(classifyLicense("All rights reserved", undefined)).toBe("not-free");
  });

  it("returns unknown for missing or unrecognised licences (fail closed)", () => {
    expect(classifyLicense(undefined, undefined)).toBe("unknown");
    expect(classifyLicense("Some custom licence", undefined)).toBe("unknown");
  });
});

describe("phase 11: URL parsing", () => {
  it("parses Commons File: pages, direct files, and thumbnails", () => {
    expect(
      parseWikimediaUrl(new URL("https://commons.wikimedia.org/wiki/File:Example_video.mp4")),
    ).toEqual({ title: "File:Example_video.mp4" });
    expect(
      parseWikimediaUrl(new URL("https://upload.wikimedia.org/wikipedia/commons/a/ab/Example_video.mp4")),
    ).toEqual({ title: "File:Example_video.mp4" });
    expect(
      parseWikimediaUrl(
        new URL("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Example_video.mp4/320px-Example_video.mp4"),
      ),
    ).toEqual({ title: "File:Example_video.mp4" });
    expect(
      parseWikimediaUrl(new URL("https://commons.wikimedia.org/wiki/Special:FilePath/Example_video.mp4")),
    ).toEqual({ title: "File:Example_video.mp4" });
  });

  it("refuses non-file Commons pages at parse time", () => {
    expect(
      parseWikimediaUrl(new URL("https://commons.wikimedia.org/wiki/Main_Page")),
    ).toBeNull();
  });

  it("parses Archive item pages and download links", () => {
    expect(
      parseArchiveUrl(new URL("https://archive.org/details/some-item")),
    ).toEqual({ kind: "item", identifier: "some-item" });
    expect(
      parseArchiveUrl(new URL("https://ia800300.us.archive.org/download/some-item/some-item.mp4")),
    ).toEqual({ kind: "file", identifier: "some-item", filename: "some-item.mp4" });
    expect(parseArchiveUrl(new URL("https://archive.org/about"))).toBeNull();
  });
});

describe("phase 11: verification flows (mocked sources)", () => {
  it("verifies a CC-BY-SA Commons video and strips HTML from the author", async () => {
    const fetchFn = vi.fn(async () => commonsPage());
    const result = await verifyCcUrl(
      "https://commons.wikimedia.org/wiki/File:Example_video.mp4",
      { fetchFn, lookup: publicLookup },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verified.license).toBe("CC-BY-SA");
    expect(result.verified.author).toBe("Jane Doe");
    expect(result.verified.title).toBe("Example video.mp4");
    expect(result.verified.attribution).toContain("CC-BY-SA");
    expect(result.verified.files).toHaveLength(1);
    expect(result.verified.files[0].url).toContain("upload.wikimedia.org");
  });

  it("strips the Commons imageinfo ?utm_source query string from the file name", async () => {
    const fetchFn = vi.fn(async () =>
      commonsPage({
        url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Example_video.mp4?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
      }),
    );
    const result = await verifyCcUrl(
      "https://commons.wikimedia.org/wiki/File:Example_video.mp4",
      { fetchFn, lookup: publicLookup },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verified.files).toHaveLength(1);
    expect(result.verified.files[0].name).toBe("Example_video.mp4");
  });

  it("refuses a non-free Commons licence with a specific reason", async () => {
    const fetchFn = vi.fn(async () =>
      commonsPage({
        extmetadata: {
          LicenseShortName: { value: "CC BY-NC 4.0" },
          LicenseUrl: { value: "https://creativecommons.org/licenses/by-nc/4.0/" },
        },
      }),
    );
    const result = await verifyCcUrl(
      "https://commons.wikimedia.org/wiki/File:Example_video.mp4",
      { fetchFn, lookup: publicLookup },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("LICENSE_NOT_FREE");
  });

  it("refuses an unknown Commons licence rather than assuming free", async () => {
    const fetchFn = vi.fn(async () =>
      commonsPage({ extmetadata: {} }),
    );
    const result = await verifyCcUrl(
      "https://commons.wikimedia.org/wiki/File:Example_video.mp4",
      { fetchFn, lookup: publicLookup },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("LICENSE_UNKNOWN");
  });

  it("refuses a non-video Commons file", async () => {
    const fetchFn = vi.fn(async () =>
      commonsPage({ mime: "image/jpeg", url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg" }),
    );
    const result = await verifyCcUrl(
      "https://commons.wikimedia.org/wiki/File:Example.jpg",
      { fetchFn, lookup: publicLookup },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("NOT_A_VIDEO");
  });

  it("verifies an Archive item and lists original video files first", async () => {
    const fetchFn = vi.fn(async () => archiveItem());
    const result = await verifyCcUrl("https://archive.org/details/some-item", {
      fetchFn,
      lookup: publicLookup,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verified.license).toBe("CC-BY");
    expect(result.verified.author).toBe("John Smith");
    expect(result.verified.files).toHaveLength(2);
    expect(result.verified.files[0].name).toBe("archive_video.mp4");
    expect(result.verified.files[0].url).toBe(
      "https://archive.org/download/some-item/archive_video.mp4",
    );
  });

  it("pins one file for an Archive download link", async () => {
    const fetchFn = vi.fn(async () => archiveItem());
    const result = await verifyCcUrl(
      "https://archive.org/download/some-item/archive_video_512kb.mp4",
      { fetchFn, lookup: publicLookup },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verified.files).toHaveLength(1);
    expect(result.verified.files[0].name).toBe("archive_video_512kb.mp4");
  });

  it("refuses an Archive item with a reserved licence", async () => {
    const fetchFn = vi.fn(async () =>
      archiveItem({ licenseurl: "https://example.invalid/all-rights-reserved" }),
    );
    const result = await verifyCcUrl("https://archive.org/details/some-item", {
      fetchFn,
      lookup: publicLookup,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("LICENSE_NOT_FREE");
  });

  it("refuses an Archive item with an unrecognised licence", async () => {
    const fetchFn = vi.fn(async () =>
      archiveItem({ licenseurl: "https://example.invalid/custom-terms" }),
    );
    const result = await verifyCcUrl("https://archive.org/details/some-item", {
      fetchFn,
      lookup: publicLookup,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("LICENSE_UNKNOWN");
  });

  it("refuses any non-allowlisted host before any fetch", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("must not be called");
    });
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.tiktok.com/@someone/video/123",
      "https://example.invalid/video.mp4",
    ]) {
      const result = await verifyCcUrl(url, { fetchFn, lookup: publicLookup });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("HOST_NOT_ALLOWED");
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses a redirect that leaves the allow-list", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/steal" },
      }),
    );
    const result = await verifyCcUrl(
      "https://commons.wikimedia.org/wiki/File:Example_video.mp4",
      { fetchFn, lookup: publicLookup },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("HOST_NOT_ALLOWED");
  });

  it("fails closed when the verification API is unreachable", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await verifyCcUrl(
      "https://commons.wikimedia.org/wiki/File:Example_video.mp4",
      { fetchFn, lookup: publicLookup },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("VERIFY_UNAVAILABLE");
  });

  it("the allow-list is exactly the two sources", () => {
    expect(CC_VERIFY_HOSTS).toEqual([
      "commons.wikimedia.org",
      "upload.wikimedia.org",
      "archive.org",
      "*.archive.org",
    ]);
  });
});

describe("phase 11: attribution combining for ZIP export", () => {
  it("joins music and CC lines, drops blanks, null when empty", () => {
    expect(combineAttributionLines(["Music: x", "Work by y"])).toBe(
      "Music: x\nWork by y",
    );
    expect(combineAttributionLines([null, undefined, "  "])).toBeNull();
    expect(combineAttributionLines([null, "Work by y"])).toBe("Work by y");
  });
});

describe("phase 11: cc-verify route refusals", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  async function post(url: string, ip: string): Promise<Response> {
    return ccVerifyPost(
      new Request("http://localhost/api/imports/cc-verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ url }),
      }),
    );
  }

  it("refuses a YouTube link with HOST_NOT_ALLOWED and no network call", async () => {
    const res = await post("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "10.0.0.1");
    expect(res.status).toBe(400);
    const data = (await res.json()) as { reason?: string; error?: string };
    expect(data.reason).toBe("HOST_NOT_ALLOWED");
    expect(data.error).toContain("Wikimedia Commons and Internet Archive");
  });

  it("rejects an invalid body", async () => {
    const res = await ccVerifyPost(
      new Request("http://localhost/api/imports/cc-verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "10.0.0.2",
        },
        body: JSON.stringify({ url: "not a link" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
