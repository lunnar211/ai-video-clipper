import { describe, expect, it } from "vitest";
import {
  formatSrtTime,
  segmentAtTime,
  segmentsToSrt,
} from "@/lib/captions";

describe("formatSrtTime", () => {
  it("formats zero and boundaries", () => {
    expect(formatSrtTime(0)).toBe("00:00:00,000");
    expect(formatSrtTime(61.5)).toBe("00:01:01,500");
    expect(formatSrtTime(3661.123)).toBe("01:01:01,123");
  });
});

describe("segmentsToSrt", () => {
  it("clips to the clip range and shifts to zero", () => {
    const segments = [
      { start: 5, end: 12, text: "hello world" },
      { start: 12, end: 20, text: "second line" },
      { start: 30, end: 40, text: "outside" },
    ];
    const srt = segmentsToSrt(segments, 10, 25);
    expect(srt).toContain("00:00:00,000 --> 00:00:02,000");
    expect(srt).toContain("hello world");
    expect(srt).toContain("00:00:02,000 --> 00:00:10,000");
    expect(srt).toContain("second line");
    expect(srt).not.toContain("outside");
  });

  it("drops empty text", () => {
    const srt = segmentsToSrt(
      [{ start: 0, end: 5, text: "   " }],
      0,
      10,
    );
    expect(srt).toBe("");
  });
});

describe("segmentAtTime", () => {
  const segments = [
    { start: 0, end: 5, text: "first" },
    { start: 5, end: 9, text: "second" },
  ];
  it("finds the active segment and returns null outside", () => {
    expect(segmentAtTime(segments, 2)).toBe("first");
    expect(segmentAtTime(segments, 5)).toBe("second");
    expect(segmentAtTime(segments, 9)).toBeNull();
    expect(segmentAtTime(segments, 100)).toBeNull();
  });
});
