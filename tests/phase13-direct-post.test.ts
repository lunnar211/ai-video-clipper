import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  DIRECT_POST_PLATFORMS,
  POST_COPYRIGHT_SENTENCE,
  shareClipFile,
  shareSupported,
} from "@/lib/post/direct-share";
import {
  postActivityCounts,
  postActivityEventSchema,
  recordPostActivity,
} from "@/lib/post/activity";
import { resetRateLimits } from "@/lib/rate-limit";
import { POST as postActivityPost } from "@/app/api/post-activity/route";

/**
 * Phase 13 — post without connecting pins.
 *
 * If any of these fail, the no-connect path is claiming something it
 * must not (a confirmed post, a credential it does not hold, an
 * upload page that does not exist) or recording something it must
 * not — fix the code, never the test.
 */

function fakeFile(): File {
  return new File(["clip-bytes"], "clip-1.mp4", { type: "video/mp4" });
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("phase 13: direct-post platform table", () => {
  it("covers all six platforms, with Instagram honestly app-only", () => {
    expect(DIRECT_POST_PLATFORMS.map((p) => p.id)).toEqual([
      "youtube",
      "tiktok",
      "instagram",
      "facebook",
      "x",
      "linkedin",
    ]);
    for (const p of DIRECT_POST_PLATFORMS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.note.length).toBeGreaterThan(0);
      if (p.id === "instagram") {
        expect(p.uploadUrl).toBeNull();
        expect(p.note).toMatch(/no public web page/i);
        expect(p.note).toMatch(/app/i);
      } else {
        expect(p.uploadUrl).toMatch(/^https:\/\//);
      }
    }
  });

  it("never promises a copyright-free post", () => {
    expect(POST_COPYRIGHT_SENTENCE).toMatch(/does not remove copyright/i);
    expect(POST_COPYRIGHT_SENTENCE).not.toMatch(/no copyright strikes/i);
    expect(POST_COPYRIGHT_SENTENCE).not.toMatch(/guarantee/i);
  });
});

describe("phase 13: device share sheet", () => {
  it("shares when the device supports file sharing", async () => {
    const shared: unknown[] = [];
    const nav = {
      share: async (data: unknown) => {
        shared.push(data);
      },
      canShare: () => true,
    };
    expect(shareSupported(nav, fakeFile())).toBe(true);
    expect(await shareClipFile(nav, fakeFile(), "Title", "#tag")).toBe(
      "shared",
    );
    expect(shared).toHaveLength(1);
  });

  it("reports cancellation, never a post", async () => {
    const abort = new Error("dismissed");
    abort.name = "AbortError";
    const nav = {
      share: async () => {
        throw abort;
      },
      canShare: () => true,
    };
    expect(await shareClipFile(nav, fakeFile(), "Title", "")).toBe(
      "cancelled",
    );
  });

  it("falls back honestly when sharing is unavailable", async () => {
    expect(shareSupported({}, fakeFile())).toBe(false);
    expect(await shareClipFile({}, fakeFile(), "Title", "")).toBe(
      "unsupported",
    );
    const nav = {
      share: async () => {},
      canShare: () => false,
    };
    expect(shareSupported(nav, fakeFile())).toBe(false);
    expect(await shareClipFile(nav, fakeFile(), "Title", "")).toBe(
      "unsupported",
    );
  });

  it("treats a non-abort share failure as unsupported, not shared", async () => {
    const nav = {
      share: async () => {
        throw new Error("boom");
      },
      canShare: () => true,
    };
    expect(await shareClipFile(nav, fakeFile(), "Title", "")).toBe(
      "unsupported",
    );
  });
});

describe("phase 13: activity event shape", () => {
  it("accepts every real outcome and platform, never 'published'", () => {
    for (const outcome of ["shared", "cancelled", "opened", "unsupported"]) {
      expect(
        postActivityEventSchema.safeParse({
          clip_id: "clip-1",
          platform: "share_sheet",
          outcome,
        }).success,
      ).toBe(true);
    }
    expect(
      postActivityEventSchema.safeParse({
        clip_id: "clip-1",
        platform: "youtube",
        outcome: "published",
      }).success,
    ).toBe(false);
    expect(
      postActivityEventSchema.safeParse({
        clip_id: "clip-1",
        platform: "youtube",
        outcome: "shared",
      }).success,
    ).toBe(true);
    expect(
      postActivityEventSchema.safeParse({
        clip_id: "",
        platform: "youtube",
        outcome: "shared",
      }).success,
    ).toBe(false);
  });

  it("records only clip id, platform, outcome — nothing else", async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = (async (url: string, init?: { body?: string }) => {
      calls.push({ url, body: init?.body ?? "" });
      return jsonRes([]);
    }) as never;
    await recordPostActivity(
      { url: "https://example.supabase.co", serviceKey: "svc" },
      { clip_id: "clip-9", platform: "tiktok", outcome: "opened" },
      fetchImpl,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/rest/v1/clipper_post_activity");
    const body = JSON.parse(calls[0].body) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "clip_id",
      "outcome",
      "platform",
    ]);
  });

  it("aggregates counts and flags truncation", async () => {
    const rows = [
      { platform: "youtube", outcome: "opened" },
      { platform: "youtube", outcome: "opened" },
      { platform: "share_sheet", outcome: "shared" },
      { platform: "share_sheet", outcome: "cancelled" },
    ];
    const fetchImpl = (async () => jsonRes(rows)) as never;
    const counts = await postActivityCounts(
      { url: "https://example.supabase.co", serviceKey: "svc" },
      fetchImpl,
    );
    expect(counts.total).toBe(4);
    expect(counts.byPlatform).toEqual({ youtube: 2, share_sheet: 2 });
    expect(counts.byOutcome).toEqual({
      opened: 2,
      shared: 1,
      cancelled: 1,
    });
    expect(counts.truncated).toBe(false);
  });
});

describe("phase 13: post-activity route", () => {
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    resetRateLimits();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedUrl !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    } else {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    }
    if (savedKey !== undefined) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
    } else {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  async function post(body: unknown, ip: string): Promise<Response> {
    return postActivityPost(
      new Request("http://localhost/api/post-activity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  it("rejects an invalid event with 400", async () => {
    const res = await post(
      { clip_id: "clip-1", platform: "youtube", outcome: "published" },
      "10.1.0.1",
    );
    expect(res.status).toBe(400);
  });

  it("503s honestly without a database, and never fakes a record", async () => {
    const res = await post(
      { clip_id: "clip-1", platform: "share_sheet", outcome: "shared" },
      "10.1.0.2",
    );
    expect(res.status).toBe(503);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toMatch(/007_clipforge_phase13/);
  });

  it("records a valid event through the database helper", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      async (url: string, init?: { body?: string }) => {
        seen.push(init?.body ?? "");
        expect(String(url)).toContain("/rest/v1/clipper_post_activity");
        return jsonRes([]);
      },
    );
    const res = await post(
      { clip_id: "clip-1", platform: "x", outcome: "opened" },
      "10.1.0.3",
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { recorded?: boolean }).toEqual({
      recorded: true,
    });
    expect(seen).toHaveLength(1);
    expect(JSON.parse(seen[0]) as Record<string, unknown>).toEqual({
      clip_id: "clip-1",
      platform: "x",
      outcome: "opened",
    });
  });

  it("rate-limits the sixth quick event", async () => {
    const event = {
      clip_id: "clip-1",
      platform: "youtube",
      outcome: "opened",
    };
    const ip = "10.1.0.4";
    for (let i = 0; i < 5; i++) {
      const res = await post(event, ip);
      expect(res.status).not.toBe(429);
    }
    const res = await post(event, ip);
    expect(res.status).toBe(429);
  });
});
