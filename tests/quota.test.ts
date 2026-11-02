import { describe, expect, it } from "vitest";
import {
  FREE_CLIPS_PER_DAY,
  dayKey,
  shouldWatermark,
} from "@/lib/usage/quota";

describe("quota helpers", () => {
  it("free tier is 3 clips per day", () => {
    expect(FREE_CLIPS_PER_DAY).toBe(3);
  });

  it("dayKey formats a local calendar day", () => {
    expect(dayKey(new Date(2026, 10, 2))).toBe("2026-11-02");
  });

  it("free renders watermark, pro renders do not", () => {
    expect(shouldWatermark("free")).toBe(true);
    expect(shouldWatermark("pro")).toBe(false);
  });
});
