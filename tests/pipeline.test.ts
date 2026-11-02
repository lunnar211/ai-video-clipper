import { describe, it, expect } from "vitest";
import { weightedVirality } from "@/lib/pipeline/virality";
import {
  rmsWindows,
  findSilentRanges,
  nonSilentSegments,
} from "@/lib/pipeline/silence";
import {
  detectSceneBoundaries,
  luminanceVariance,
} from "@/lib/pipeline/scenes";
import {
  keywordSearch,
  hitsToWindows,
  lengthWindow,
} from "@/lib/pipeline/search";
import { segmentsToVtt, formatVttTime, wordAtTime } from "@/lib/captions";
import { buildZip, crc32 } from "@/lib/browser/zip";
import { parseBrandKit } from "@/lib/brandkit";

describe("weighted virality", () => {
  it("weights hook 40 / pacing 35 / engagement 25", () => {
    // engagement = mean(50, 70) = 60
    const v = weightedVirality({
      hook: 80,
      emotion: 50,
      pacing: 60,
      ending: 70,
    });
    expect(v.score).toBe(Math.round(80 * 0.4 + 60 * 0.35 + 60 * 0.25));
    expect(v.components.engagement).toBe(60);
    expect(v.reasons.hook).toMatch(/Strong/);
  });
  it("defaults missing inputs to neutral 50", () => {
    expect(weightedVirality({}).score).toBe(50);
  });
  it("clamps out-of-range inputs", () => {
    const v = weightedVirality({
      hook: 500,
      emotion: -20,
      pacing: 50,
      ending: 50,
    });
    expect(v.components.hook).toBe(100);
    expect(v.components.engagement).toBe(25);
  });
});

describe("silence detection", () => {
  it("finds silent ranges and drops short ones", () => {
    // 0.5s windows at 16kHz: loud, loud, quiet x4, loud
    const samples = new Float32Array(16000 * 3);
    samples.fill(0.5, 0, 16000);
    // middle second stays 0 (quiet)
    samples.fill(0.5, 32000, 48000);
    const rms = rmsWindows(samples, 16000, 0.5);
    expect(rms.length).toBe(6);
    const ranges = findSilentRanges(rms, 0.5, 0.01, 1, 0.5);
    expect(ranges).toEqual([{ start: 1, end: 2 }]);
  });
  it("splits a clip into non-silent parts", () => {
    const parts = nonSilentSegments(0, 10, [{ start: 3, end: 5 }], 2);
    expect(parts).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ]);
  });
  it("drops parts shorter than the minimum", () => {
    expect(nonSilentSegments(0, 10, [{ start: 0, end: 9 }], 2)).toEqual([]);
  });
});

describe("scene detection", () => {
  it("declares boundaries above threshold with a gap rule", () => {
    const bounds = detectSceneBoundaries(
      [0.1, 0.9, 0.8, 0.2, 0.7],
      1,
      0.35,
      1.5,
    );
    expect(bounds.map((b) => b.time)).toEqual([1, 4]);
  });
  it("variance is 0 for flat frames and > 0 for varied ones", () => {
    expect(luminanceVariance([128, 128, 128])).toBe(0);
    expect(luminanceVariance([0, 255])).toBeGreaterThan(0);
  });
});

describe("clip search + length targets", () => {
  const transcript = [
    { start: 0, end: 5, text: "Welcome to the cooking show" },
    { start: 10, end: 15, text: "Today we cook pasta with garlic" },
    { start: 30, end: 35, text: "The pasta sauce needs garlic and basil" },
  ];
  it("matches keywords case-insensitively", () => {
    const hits = keywordSearch(transcript, "garlic pasta");
    expect(hits.length).toBe(2);
    // Both matching segments contain both terms; ties break by start time.
    expect(hits[0].segment.start).toBe(10);
    expect(hits[0].matches).toBe(2);
    expect(hits[1].segment.start).toBe(30);
    expect(hits[1].matches).toBe(2);
  });
  it("ignores tiny query terms", () => {
    expect(keywordSearch(transcript, "we")).toEqual([]);
  });
  it("groups nearby hits into windows", () => {
    const hits = keywordSearch(transcript, "garlic pasta");
    const windows = hitsToWindows(hits, 60);
    expect(windows.length).toBeGreaterThanOrEqual(1);
    expect(windows[0].end - windows[0].start).toBeGreaterThanOrEqual(15);
  });
  it("length windows: default 15-60, target narrows", () => {
    expect(lengthWindow(null)).toEqual({ minLen: 15, maxLen: 60 });
    expect(lengthWindow(30)).toEqual({ minLen: 15, maxLen: 30 });
    expect(lengthWindow(15)).toEqual({ minLen: 10, maxLen: 15 });
  });
});

describe("VTT + word timestamps", () => {
  it("writes a valid WebVTT document", () => {
    const vtt = segmentsToVtt(
      [{ start: 10, end: 12, text: "hello world" }],
      10,
      20,
    );
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:02.000");
    expect(vtt).toContain("hello world");
  });
  it("formats VTT times with dots", () => {
    expect(formatVttTime(61.5)).toBe("00:01:01.500");
  });
  it("finds the active word", () => {
    const words = [
      { word: "hello", start: 0, end: 0.5 },
      { word: "world", start: 0.5, end: 1 },
    ];
    expect(wordAtTime(words, 0.7)?.word).toBe("world");
    expect(wordAtTime(words, 1.5)).toBeNull();
  });
});

describe("stored ZIP writer", () => {
  it("produces a parseable archive with correct signatures", () => {
    const zip = buildZip([
      { name: "a.txt", data: new TextEncoder().encode("hello") },
      { name: "b.txt", data: new Uint8Array([1, 2, 3]) },
    ]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("a.txt");
    expect(text).toContain("hello");
    expect(text).toContain("b.txt");
  });
  it("crc32 matches the known vector", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("brand kit validation", () => {
  it("accepts a valid kit and rejects a bad color", () => {
    expect(
      parseBrandKit({ primaryColor: "#0ea5e9", watermarkEnabled: true }),
    ).not.toBeNull();
    expect(parseBrandKit({ primaryColor: "blue" })).toBeNull();
  });
});
