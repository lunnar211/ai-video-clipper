import { describe, it, expect, vi } from "vitest";
import { uploadYoutubeShort } from "@/lib/publish/adapters/youtube";
import {
  validateSchedule,
  isDue,
} from "@/lib/publish/schedule";
import {
  fetchYoutubeStats,
  syncTargetAnalytics,
} from "@/lib/publish/analytics";
import {
  tempMediaKeyFor,
  deleteTempMediaNow,
  TEMP_MEDIA_PREFIX,
} from "@/lib/publish/tempmedia";

const input = {
  accessToken: "tok",
  title: "My clip",
  description: "Desc",
  tags: ["a"],
  visibility: "unlisted",
  mediaBytes: new Uint8Array([0, 1, 2, 3]),
};

describe("YouTube upload adapter (mocked HTTP)", () => {
  it("sends multipart metadata + bytes and returns the video id", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Uint8Array | null = null;
    const f = vi.fn(async (url: string, opts: Record<string, unknown>) => {
      capturedUrl = url;
      capturedHeaders = opts.headers as Record<string, string>;
      capturedBody = opts.body as Uint8Array;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "vid-9" }),
      };
    }) as unknown as typeof fetch;
    const res = await uploadYoutubeShort(input, f);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.providerPostId).toBe("vid-9");
      expect(res.providerUrl).toBe("https://www.youtube.com/shorts/vid-9");
    }
    expect(capturedUrl).toContain("upload/youtube/v3/videos");
    expect(capturedUrl).toContain("uploadType=multipart");
    expect(capturedHeaders.Authorization).toBe("Bearer tok");
    expect(capturedHeaders["Content-Type"]).toMatch(
      /multipart\/related; boundary=/,
    );
    const text = new TextDecoder().decode(capturedBody!);
    expect(text).toContain('"title":"My clip"');
    expect(text).toContain('"privacyStatus":"unlisted"');
    expect(text).toContain('"tags":["a"]');
  });
  it("marks 429/5xx retryable and missing id as failure", async () => {
    const fail = (status: number) =>
      vi.fn(async () => ({
        ok: false,
        status,
        json: async () => ({}),
      })) as unknown as typeof fetch;
    const r429 = await uploadYoutubeShort(input, fail(429));
    expect(r429.ok).toBe(false);
    if (!r429.ok) {
      expect(r429.retryable).toBe(true);
      expect(r429.status).toBe(429);
    }
    const r400 = await uploadYoutubeShort(input, fail(400));
    expect(r400.ok).toBe(false);
    if (!r400.ok) expect(r400.retryable).toBe(false);
    const noId = await uploadYoutubeShort(
      input,
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
      })) as unknown as typeof fetch,
    );
    expect(noId.ok).toBe(false);
  });
});

describe("schedule validation", () => {
  const now = Date.parse("2026-11-02T00:00:00Z");
  it("accepts future schedules, rejects past/bad dates/bad zones", () => {
    expect(validateSchedule(null, null, now).ok).toBe(true);
    const ok = validateSchedule(
      "2026-11-03T10:00:00Z",
      "Asia/Kathmandu",
      now,
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.utcIso).toBe("2026-11-03T10:00:00.000Z");
    expect(validateSchedule("2026-11-01T00:00:00Z", null, now).ok).toBe(
      false,
    );
    expect(validateSchedule("junk", null, now).ok).toBe(false);
    expect(
      validateSchedule("2026-11-03T10:00:00Z", "Mars/Olympus", now).ok,
    ).toBe(false);
  });
  it("computes due only for scheduled posts at/after their time", () => {
    expect(isDue("2026-11-01T00:00:00Z", "scheduled", now)).toBe(true);
    expect(isDue("2026-11-03T00:00:00Z", "scheduled", now)).toBe(false);
    expect(isDue("2026-11-01T00:00:00Z", "published", now)).toBe(false);
    expect(isDue(null, "scheduled", now)).toBe(false);
  });
});

describe("analytics sync", () => {
  it("reads YouTube statistics and marks other platforms unsupported", async () => {
    const f = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            statistics: {
              viewCount: "120",
              likeCount: "7",
              commentCount: "2",
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;
    const stats = await fetchYoutubeStats("vid-9", "tok", f);
    expect(stats).toEqual({ views: 120, likes: 7, comments: 2 });
    const unsupported = await syncTargetAnalytics(
      "x",
      "post-1",
      "tok",
      f,
    );
    expect(unsupported.supported).toBe(false);
  });
});

describe("temp media lifecycle", () => {
  it("keys live under tmp/publish and deletes best-effort", async () => {
    const key = tempMediaKeyFor("post-1");
    expect(key.startsWith(TEMP_MEDIA_PREFIX)).toBe(true);
    expect(await deleteTempMediaNow(null, key)).toBe(false);
    const failing = {
      name: "r2",
      initiate: async () => {
        throw new Error("no");
      },
      complete: async () => ({ key }),
      presignedGet: async () => "",
      delete: async () => {
        throw new Error("delete failed");
      },
    };
    expect(await deleteTempMediaNow(failing, key)).toBe(false);
    let deleted = "";
    const okStore = { ...failing, delete: async (k: string) => {
      deleted = k;
    } };
    expect(await deleteTempMediaNow(okStore, key)).toBe(true);
    expect(deleted).toBe(key);
  });
});
