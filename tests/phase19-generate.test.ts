/**
 * Phase 19 — parity slice 2 pins.
 *
 * Script rewrite + multi-language scripts (same Groq → Gemini →
 * OpenRouter chain, no new keys), subtitle style resolution +
 * styled-caption drawing (recording-stub canvas context, so the
 * real drawing code is exercised, not mocked), format dimensions
 * + aspect crop windows, generation-history storage rules, and
 * source pins for the new /generate UI (versions, style controls,
 * formats, history) with the banned-promise and downloader-term
 * greps on the new copy.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  generateScript,
  rewriteScript,
  resolveScriptLanguage,
} from "@/lib/ai/script";
import {
  FORMAT_DIMENSIONS,
  DEFAULT_SUBTITLE_STYLE,
  SUBTITLE_FONTS,
  resolveSubtitleStyle,
  drawStyledCaption,
  strokeColorFor,
} from "@/lib/browser/subtitles";
import { windowForAspect, windowForCenterX } from "@/lib/crop";
import {
  loadHistory,
  recordGeneration,
  HISTORY_KEY,
  HISTORY_MAX_ENTRIES,
  type GenerationHistoryEntry,
} from "@/lib/browser/generation-history";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const ORIGINAL = {
  title: "Morning Routines",
  hashtags: ["#morning"],
  segments: [
    { text: "Start your day with water.", visualKeyword: "glass of water" },
    { text: "Stretch for two minutes.", visualKeyword: "morning stretch" },
  ],
};

const REWRITTEN = JSON.stringify({
  title: "Mornings, Reworded",
  hashtags: ["#morning"],
  segments: [
    {
      text: "Begin the morning by drinking water.",
      visualKeyword: "drinking water",
    },
    {
      text: "Spend two minutes stretching.",
      visualKeyword: "stretching routine",
    },
  ],
});

function groqResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200 },
  );
}

function baseEntry(overrides: Partial<GenerationHistoryEntry> = {}): GenerationHistoryEntry {
  return {
    id: "generated-1",
    createdAt: new Date().toISOString(),
    topic: "morning routines",
    title: "Morning Routines",
    hashtags: ["#morning"],
    language: "en",
    format: "9:16",
    subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE },
    segments: [
      {
        text: "Start your day with water.",
        visualKeyword: "glass of water",
        visual: {
          kind: "cc",
          fileUrl: "https://upload.wikimedia.org/water.webm",
          title: "Ocean waves",
          license: "CC-BY",
          attribution: '"Ocean waves" by A is licensed under CC-BY.',
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Ocean_waves",
        },
      },
    ],
    attribution: "Script: AI-generated.",
    ...overrides,
  };
}

describe("resolveScriptLanguage", () => {
  it("passes curated codes through", () => {
    expect(resolveScriptLanguage("es")).toBe("es");
    expect(resolveScriptLanguage("ne")).toBe("ne");
  });

  it("falls back to English for unknown or missing codes", () => {
    expect(resolveScriptLanguage("xx")).toBe("en");
    expect(resolveScriptLanguage(undefined)).toBe("en");
  });
});

describe("rewriteScript chain", () => {
  const OLD_ENV = { ...process.env };
  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("NVIDIA_API_KEY", "");
  });
  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.unstubAllEnvs();
  });

  it("throws AI_NOT_CONNECTED when no provider key exists", async () => {
    await expect(rewriteScript(ORIGINAL, vi.fn())).rejects.toThrow(
      "AI is not connected yet",
    );
  });

  it("rewrites via Groq first, keeping segment count", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq");
    const fetchMock = vi.fn().mockResolvedValue(groqResponse(REWRITTEN));
    const { script, provider } = await rewriteScript(
      ORIGINAL,
      fetchMock as unknown as typeof fetch,
    );
    expect(provider).toBe("groq");
    expect(script.title).toBe("Mornings, Reworded");
    expect(script.segments).toHaveLength(2);
    expect(script.segments[0].text).toBe(
      "Begin the morning by drinking water.",
    );
  });

  it("falls through to Gemini when Groq fails", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("groq down", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: REWRITTEN }] } }],
          }),
          { status: 200 },
        ),
      );
    const { provider } = await rewriteScript(
      ORIGINAL,
      fetchMock as unknown as typeof fetch,
    );
    expect(provider).toBe("gemini");
  });

  it("asks for the chosen language in the prompt", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq");
    let capturedBody = "";
    const fetchMock = vi.fn().mockImplementation(async (_url, opts) => {
      capturedBody = String((opts as { body?: unknown }).body ?? "");
      return groqResponse(REWRITTEN);
    });
    await rewriteScript(
      ORIGINAL,
      fetchMock as unknown as typeof fetch,
      "es",
    );
    expect(capturedBody).toContain("Spanish");
  });

  it("asks generateScript for the chosen language too", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq");
    let capturedBody = "";
    const fetchMock = vi.fn().mockImplementation(async (_url, opts) => {
      capturedBody = String((opts as { body?: unknown }).body ?? "");
      return groqResponse(
        JSON.stringify({
          title: "Rutinas",
          hashtags: [],
          segments: [
            { text: "Bebe agua.", visualKeyword: "vaso de agua" },
          ],
        }),
      );
    });
    const { script } = await generateScript(
      "morning routines",
      1,
      fetchMock as unknown as typeof fetch,
      "es",
    );
    expect(capturedBody).toContain("Spanish");
    expect(script.segments[0].text).toBe("Bebe agua.");
  });
});

describe("subtitle style resolution", () => {
  it("defaults unknown fonts, colors, positions, backgrounds", () => {
    const resolved = resolveSubtitleStyle({
      font: "Comic Sans",
      color: "not-a-color",
      position: "sideways" as never,
      background: "rainbow" as never,
    });
    expect(resolved).toEqual(DEFAULT_SUBTITLE_STYLE);
  });

  it("clamps sizes to 28–72", () => {
    expect(resolveSubtitleStyle({ size: 10 }).size).toBe(28);
    expect(resolveSubtitleStyle({ size: 100 }).size).toBe(72);
    expect(resolveSubtitleStyle({ size: 54 }).size).toBe(54);
  });

  it("keeps valid choices", () => {
    const resolved = resolveSubtitleStyle({
      font: SUBTITLE_FONTS[1].stack,
      position: "top",
      color: "#fde047",
      size: 54,
      stroke: true,
      background: "light",
    });
    expect(resolved.font).toBe(SUBTITLE_FONTS[1].stack);
    expect(resolved.position).toBe("top");
    expect(resolved.color).toBe("#fde047");
    expect(resolved.stroke).toBe(true);
    expect(resolved.background).toBe("light");
  });
});

describe("strokeColorFor", () => {
  it("uses a dark stroke on light text and light stroke on dark text", () => {
    expect(strokeColorFor("#ffffff")).toContain("0,0,0");
    expect(strokeColorFor("#111111")).toContain("255,255,255");
  });
});

/** Recording stub canvas context: records every draw call. */
function recordingCtx() {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  const ctx = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    textAlign: "",
    textBaseline: "",
    measureText: (text: string) => ({ width: text.length * 10 }),
    beginPath: () => calls.push({ fn: "beginPath", args: [] }),
    roundRect: (x: number, y: number, w: number, h: number, r: number) =>
      calls.push({ fn: "roundRect", args: [x, y, w, h, r] }),
    fill: () => calls.push({ fn: "fill", args: [] }),
    fillText: (text: string, x: number, y: number) =>
      calls.push({ fn: "fillText", args: [text, x, y] }),
    strokeText: (text: string, x: number, y: number) =>
      calls.push({ fn: "strokeText", args: [text, x, y] }),
  };
  return { ctx, calls };
}

describe("drawStyledCaption", () => {
  it("draws the default look: dark box, white text, bottom", () => {
    const { ctx, calls } = recordingCtx();
    drawStyledCaption(
      ctx as unknown as CanvasRenderingContext2D,
      "Hello world",
      720,
      1280,
      DEFAULT_SUBTITLE_STYLE,
    );
    const box = calls.find((c) => c.fn === "roundRect");
    expect(box).toBeDefined();
    // Single line: box height = 46*1.26 + 36 = 93.96; bottom y = 1280 - 93.96 - 130.
    expect((box!.args[1] as number)).toBeCloseTo(1056.04, 1);
    expect(ctx.fillStyle).toBe("#ffffff");
    expect(calls.some((c) => c.fn === "fillText")).toBe(true);
    expect(calls.some((c) => c.fn === "strokeText")).toBe(false);
  });

  it("honors top position, yellow color, stroke, and no background", () => {
    const { ctx, calls } = recordingCtx();
    drawStyledCaption(
      ctx as unknown as CanvasRenderingContext2D,
      "Hello world",
      720,
      1280,
      {
        ...DEFAULT_SUBTITLE_STYLE,
        position: "top",
        color: "#fde047",
        stroke: true,
        background: "none",
      },
    );
    const box = calls.find((c) => c.fn === "roundRect");
    expect(box).toBeUndefined();
    expect(calls.some((c) => c.fn === "strokeText")).toBe(true);
    expect(ctx.fillStyle).toBe("#fde047");
    // Top position: the text sits at margin + padding + half a line.
    const text = calls.find((c) => c.fn === "fillText");
    expect((text!.args[2] as number)).toBeCloseTo(130 + 18 + 28.98, 1);
  });

  it("scales the font with canvas width (16:9)", () => {
    const { ctx } = recordingCtx();
    drawStyledCaption(
      ctx as unknown as CanvasRenderingContext2D,
      "Hello world",
      1280,
      720,
      DEFAULT_SUBTITLE_STYLE,
    );
    expect(ctx.font).toContain("81.77");
  });
});

describe("formats and aspect crop", () => {
  it("declares real output sizes", () => {
    expect(FORMAT_DIMENSIONS["9:16"]).toEqual(
      expect.objectContaining({ width: 720, height: 1280 }),
    );
    expect(FORMAT_DIMENSIONS["16:9"]).toEqual(
      expect.objectContaining({ width: 1280, height: 720 }),
    );
    expect(FORMAT_DIMENSIONS["1:1"]).toEqual(
      expect.objectContaining({ width: 720, height: 720 }),
    );
  });

  it("9:16 aspect window equals the centred 9:16 window", () => {
    expect(windowForAspect(1920, 1080, 9, 16)).toEqual(
      windowForCenterX(1920, 1080, 0.5),
    );
  });

  it("16:9 window keeps the full frame of a 16:9 video", () => {
    expect(windowForAspect(1920, 1080, 16, 9)).toEqual({
      sx: 0,
      sy: 0,
      sw: 1920,
      sh: 1080,
    });
  });

  it("1:1 window centres a square in a wide frame", () => {
    expect(windowForAspect(1920, 1080, 1, 1)).toEqual({
      sx: 420,
      sy: 0,
      sw: 1080,
      sh: 1080,
    });
  });

  it("returns zeros for invalid dimensions", () => {
    expect(windowForAspect(0, 1080, 16, 9)).toEqual({
      sx: 0,
      sy: 0,
      sw: 0,
      sh: 0,
    });
  });
});

describe("generation history storage", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips an entry, newest first", () => {
    recordGeneration(baseEntry({ id: "a" }));
    recordGeneration(baseEntry({ id: "b" }));
    const entries = loadHistory();
    expect(entries.map((e) => e.id)).toEqual(["b", "a"]);
    expect(entries[0].segments[0].visual?.kind).toBe("cc");
  });

  it("caps at 20 entries", () => {
    for (let i = 0; i < 21; i++) {
      recordGeneration(baseEntry({ id: `e${i}` }));
    }
    const entries = loadHistory();
    expect(entries).toHaveLength(HISTORY_MAX_ENTRIES);
    expect(entries[0].id).toBe("e20");
  });

  it("drops malformed entries instead of failing", () => {
    store.set(
      HISTORY_KEY,
      JSON.stringify([baseEntry(), { id: "bad" }, "junk", null]),
    );
    const entries = loadHistory();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("generated-1");
  });

  it("returns empty for non-array or broken storage", () => {
    store.set(HISTORY_KEY, "not json");
    expect(loadHistory()).toEqual([]);
    store.set(HISTORY_KEY, JSON.stringify({ nope: true }));
    expect(loadHistory()).toEqual([]);
  });
});

describe("phase 19 UI pins", () => {
  it("generate tool has versions, style controls, formats, history", () => {
    const src = read("components/GenerateTool.tsx");
    expect(src).toContain("Script versions");
    expect(src).toContain("Rewrite script");
    expect(src).toContain("Use rewritten version");
    expect(src).toContain("Use original version");
    expect(src).toContain("Script language");
    expect(src).toContain("Subtitle style");
    expect(src).toContain("Subtitle font");
    expect(src).toContain("Subtitle position");
    expect(src).toContain("Subtitle background");
    expect(src).toContain("Subtitle size");
    expect(src).toContain("Generation history");
    expect(src).toContain("Reopen");
    expect(src).toContain("Rendered in");
    expect(src).toContain("Captions:");
  });

  it("rewrite route fails closed like the script route", () => {
    const src = read("app/api/generate/rewrite/route.ts");
    expect(src).toContain("AI_NOT_CONNECTED");
    expect(src).toContain("status: 503");
    expect(src).toContain("status: 502");
    expect(src).toContain("generate-rewrite");
  });

  it("no banned promises in new UI copy", () => {
    for (const path of [
      "components/GenerateTool.tsx",
      "lib/browser/subtitles.ts",
      "lib/browser/generation-history.ts",
      "app/api/generate/rewrite/route.ts",
    ]) {
      const src = read(path);
      expect(src).not.toContain("copyright-free");
      expect(src).not.toContain("copyright removed");
      expect(src).not.toContain("no copyright strikes");
    }
  });

  it("no downloader terms in new or changed files", () => {
    for (const path of [
      "components/GenerateTool.tsx",
      "lib/browser/subtitles.ts",
      "lib/browser/generation-history.ts",
      "lib/ai/script.ts",
      "app/api/generate/rewrite/route.ts",
    ]) {
      const src = read(path).toLowerCase();
      expect(src).not.toContain("youtube-dl");
      expect(src).not.toContain("yt-dlp");
      expect(src).not.toContain("download from youtube");
    }
  });
});
