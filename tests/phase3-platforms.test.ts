import { describe, it, expect } from "vitest";
import {
  PLATFORMS,
  PLATFORM_IDS,
  platformStatus,
  publishAllowed,
  publishRefusalReason,
} from "@/lib/publish/platforms";
import { validateForPlatform } from "@/lib/publish/validator";

const emptyEnv = {} as NodeJS.ProcessEnv;

describe("platform registry", () => {
  it("every platform has scopes and a flag + approval env", () => {
    for (const id of PLATFORM_IDS) {
      const def = PLATFORMS[id];
      expect(def.scopes.length).toBeGreaterThan(0);
      expect(def.flagEnv).toMatch(/^PUBLISH_/);
      expect(def.approvalEnv).toBeTruthy();
    }
  });
  it("defaults to disabled; flag without approval is pending", () => {
    expect(platformStatus("youtube", emptyEnv)).toBe("disabled");
    expect(publishAllowed("youtube", emptyEnv)).toBe(false);
    expect(publishRefusalReason("youtube", emptyEnv)).toMatch(/not enabled/);
    const pending = {
      ...emptyEnv,
      PUBLISH_YOUTUBE_ENABLED: "true",
    } as NodeJS.ProcessEnv;
    expect(platformStatus("youtube", pending)).toBe("pending_approval");
    expect(publishRefusalReason("youtube", pending)).toMatch(
      /pending platform approval/,
    );
    const live = {
      ...pending,
      YOUTUBE_APP_APPROVED: "true",
    } as NodeJS.ProcessEnv;
    expect(platformStatus("youtube", live)).toBe("live");
    expect(publishAllowed("youtube", live)).toBe(true);
    expect(publishRefusalReason("youtube", live)).toBeNull();
  });
  it("YouTube requests upload + read-only scopes (read-only proves channel ownership for the own-video import)", () => {
    expect(PLATFORMS.youtube.scopes).toEqual([
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ]);
  });
});

describe("platform limits validator", () => {
  const good = {
    durationSec: 45,
    sizeBytes: 50 * 1024 * 1024,
    aspect: "9:16",
    title: "A title",
    description: "A caption",
    tags: ["a", "b"],
  };
  it("passes a valid Short and refuses each violation specifically", () => {
    expect(validateForPlatform("youtube", good).ok).toBe(true);
    const long = validateForPlatform("youtube", { ...good, durationSec: 95 });
    expect(long.ok).toBe(false);
    expect(long.errors.join(" ")).toMatch(/60 seconds/);
    const wide = validateForPlatform("youtube", { ...good, aspect: "16:9" });
    expect(wide.errors.join(" ")).toMatch(/9:16/);
    const title = validateForPlatform("youtube", {
      ...good,
      title: "x".repeat(101),
    });
    expect(title.errors.join(" ")).toMatch(/100 characters/);
    const caption = validateForPlatform("x", {
      ...good,
      aspect: "16:9",
      description: "x".repeat(281),
    });
    expect(caption.errors.join(" ")).toMatch(/280 characters/);
    const tags = validateForPlatform("youtube", {
      ...good,
      tags: Array.from({ length: 16 }, (_, i) => `t${i}`),
    });
    expect(tags.errors.join(" ")).toMatch(/15 tags/);
  });
  it("skips fields a platform does not use (no title on TikTok)", () => {
    const res = validateForPlatform("tiktok", {
      ...good,
      durationSec: 300,
      title: "x".repeat(500),
    });
    expect(res.ok).toBe(true);
  });
});
