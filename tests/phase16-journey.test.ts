import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { youtubeJourneySteps } from "@/lib/imports/youtube-journey";
import {
  setPendingYtUrl,
  takePendingYtUrl,
} from "@/lib/upload-pending";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * Phase 16 — one smooth own-YouTube journey.
 *
 * Pins the step-state derivation (the journey's map must never
 * claim a match the tool cannot prove), the hero link carry
 * (consume exactly once, like the CC carry), and the copy ban on
 * the new journey copy. A file uploaded without verification is a
 * completed upload, not a verified source — the steps must show
 * exactly that.
 */

const verified = {
  videoId: "dQw4w9WgXcQ",
  channelId: "UC123",
  channelTitle: "My Channel",
  videoTitle: "My Video",
  accountId: "acc-1",
};

describe("youtubeJourneySteps", () => {
  it("starts with step 1 current and the rest waiting", () => {
    expect(
      youtubeJourneySteps({ verified: null, hasFile: false }),
    ).toEqual([
      { id: "verify", status: "current" },
      { id: "studio", status: "waiting" },
      { id: "upload", status: "waiting" },
    ]);
  });

  it("marks step 1 done and step 2 current after verification", () => {
    expect(
      youtubeJourneySteps({ verified, hasFile: false }),
    ).toEqual([
      { id: "verify", status: "done" },
      { id: "studio", status: "current" },
      { id: "upload", status: "current" },
    ]);
  });

  it("marks every step done once verified and a file is loaded", () => {
    expect(youtubeJourneySteps({ verified, hasFile: true })).toEqual([
      { id: "verify", status: "done" },
      { id: "studio", status: "done" },
      { id: "upload", status: "done" },
    ]);
  });

  it("marks only the upload done for a file without verification", () => {
    // The honest case: the upload happened, but no source record
    // verified — step 1 stays open and the panel stays unverified.
    expect(
      youtubeJourneySteps({ verified: null, hasFile: true }),
    ).toEqual([
      { id: "verify", status: "current" },
      { id: "studio", status: "waiting" },
      { id: "upload", status: "done" },
    ]);
  });
});

describe("pending own-YouTube link carry", () => {
  it("is consumed exactly once", () => {
    setPendingYtUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(takePendingYtUrl()).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(takePendingYtUrl()).toBeNull();
  });
});

describe("Phase 16 copy ban", () => {
  const banned = /copyright-free|copyright removed|no copyright strikes/i;
  const files = [
    "components/YoutubeJourneySteps.tsx",
    "lib/imports/youtube-journey.ts",
    "components/YoutubeOwnedImport.tsx",
  ];
  it.each(files)("no banned promise in %s", (file) => {
    expect(read(file)).not.toMatch(banned);
  });

  it("keeps the standing sentence about AI editing", () => {
    const flat = read("components/YoutubeJourneySteps.tsx").replace(
      /\s+/g,
      " ",
    );
    expect(flat).toContain("AI editing does not remove copyright");
  });
});
