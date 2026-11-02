import { describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimits } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  it("allows up to the limit then blocks", () => {
    resetRateLimits();
    const ip = "203.0.113.9";
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(ip, 5, 60_000, 1000)).toBe(true);
    }
    expect(checkRateLimit(ip, 5, 60_000, 1000)).toBe(false);
  });

  it("refills after the window passes", () => {
    resetRateLimits();
    const ip = "203.0.113.10";
    for (let i = 0; i < 5; i++) checkRateLimit(ip, 5, 60_000, 1000);
    expect(checkRateLimit(ip, 5, 60_000, 1000)).toBe(false);
    expect(checkRateLimit(ip, 5, 60_000, 61_001)).toBe(true);
  });

  it("tracks IPs independently", () => {
    resetRateLimits();
    for (let i = 0; i < 5; i++) checkRateLimit("10.0.0.1", 5, 60_000, 1000);
    expect(checkRateLimit("10.0.0.2", 5, 60_000, 1000)).toBe(true);
  });
});
