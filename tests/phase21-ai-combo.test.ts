/**
 * Phase 21 — AI-combo backend pipeline pins.
 *
 * The server-side chain (script → verified visuals → subtitles
 * → voiceover slot → render-job record → post wiring) reusing
 * the repo's own library functions, the webhook route's secret
 * gate, and the importable n8n workflow's structure + secret
 * hygiene. No live provider is called: the AI step is stubbed
 * at the fetch boundary (Groq shape), the Commons step is
 * stubbed at the search seam (the real search's own seam for
 * this), and env keys are toggled per test with restore.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  runAiComboPipeline,
  type AiComboDeps,
} from "@/lib/ai-combo/pipeline";
import type { GeneratedVisual } from "@/lib/imports/cc-search";
import type { CommonsSearchResult } from "@/lib/imports/cc-search";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const SCRIPT_JSON = JSON.stringify({
  title: "Ocean Mornings",
  hashtags: ["#ocean"],
  segments: [
    { text: "Waves roll in before sunrise.", visualKeyword: "ocean waves" },
    { text: "The city wakes under neon light.", visualKeyword: "city traffic at night" },
  ],
});

const VISUAL: GeneratedVisual = {
  title: "Ocean waves",
  author: "Example Filmer",
  license: "CC-BY",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Ocean_waves.webm",
  attribution:
    '"Ocean waves" by Example Filmer is licensed under CC-BY. Source: https://commons.wikimedia.org/wiki/File:Ocean_waves.webm',
  fileUrl: "https://upload.wikimedia.org/ocean_waves.webm",
  fileName: "Ocean_waves.webm",
};

function groqStub(): typeof fetch {
  return (async (url: unknown) => {
    const target = String(url);
    if (target.includes("api.groq.com")) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: SCRIPT_JSON } }],
        }),
      } as unknown as Response;
    }
    throw new Error(`Unexpected fetch in test: ${target}`);
  }) as unknown as typeof fetch;
}

function searchStub(): AiComboDeps["searchVisuals"] {
  return async (keyword: string): Promise<CommonsSearchResult> => {
    if (keyword === "ocean waves") {
      return { ok: true, visuals: [VISUAL], note: null };
    }
    return {
      ok: true,
      visuals: [],
      note: "No free-licence video found for this keyword — upload your own footage for this segment.",
    };
  };
}

const OLD_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...OLD_ENV };
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
});

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe("ai-combo pipeline", () => {
  it("runs the full chain and records provenance, not a video", async () => {
    process.env.GROQ_API_KEY = "test-groq";
    const job = await runAiComboPipeline(
      { topic: "ocean mornings", segmentCount: 2 },
      { fetchFn: groqStub(), searchVisuals: searchStub() },
    );
    expect(job.status).toBe("needs_render");
    expect(job.scriptProvider).toBe("groq");
    expect(job.title).toBe("Ocean Mornings");
    expect(job.segments).toHaveLength(2);
    expect(job.segments[0].visual?.title).toBe("Ocean waves");
    expect(job.segments[0].start).toBe(0);
    expect(job.segments[0].end).toBe(5);
    expect(job.segments[1].visual).toBeNull();
    expect(job.segments[1].visualNote).toContain("No free-licence video found");
    expect(job.segmentsWithoutVisuals).toBe(1);
    expect(job.srt).toContain("00:00:00,000 --> 00:00:05,000");
    expect(job.srt).toContain("00:00:05,000 --> 00:00:10,000");
    expect(job.srt).toContain("Waves roll in before sunrise.");
    expect(job.vtt.startsWith("WEBVTT")).toBe(true);
    expect(job.vtt).toContain("00:00:00.000 --> 00:00:05.000");
    expect(job.attribution).toContain('"Ocean waves" by Example Filmer');
    expect(job.attribution).toContain("AI-generated script");
    expect(job.voiceover).toEqual({ status: "not_requested" });
    expect(job.renderNote).toContain("No video has been produced");
    expect(job.renderNote).toContain("Vercel");
    expect(job.post.clipId.startsWith("ai-combo-")).toBe(true);
    expect(job.post.note).toContain("never 'published'");
    expect(job.provenance.scriptProvider).toBe("groq");
    expect(job.provenance.visualLicenses).toEqual(["CC-BY"]);
    expect(job.provenance.sourceUrls).toEqual([VISUAL.sourceUrl]);
  });

  it("splits a custom script with no AI call", async () => {
    const job = await runAiComboPipeline(
      { topic: "ignored when custom", customScript: "First line here.\nSecond line here." },
      { fetchFn: groqStub(), searchVisuals: searchStub() },
    );
    expect(job.scriptProvider).toBe("custom");
    expect(job.segments).toHaveLength(2);
  });

  it("fails honestly with no AI provider", async () => {
    await expect(
      runAiComboPipeline(
        { topic: "ocean mornings" },
        { fetchFn: groqStub(), searchVisuals: searchStub() },
      ),
    ).rejects.toMatchObject({ kind: "ai_not_connected" });
  });

  it("stops with a specific error when the visuals search fails", async () => {
    process.env.GROQ_API_KEY = "test-groq";
    await expect(
      runAiComboPipeline(
        { topic: "ocean mornings", segmentCount: 1 },
        {
          fetchFn: groqStub(),
          searchVisuals: async () => ({
            ok: false,
            message: "Commons could not be reached.",
          }),
        },
      ),
    ).rejects.toMatchObject({
      kind: "visuals_failed",
      message: "Commons could not be reached.",
    });
  });

  it("rejects an invalid topic instead of inventing one", async () => {
    await expect(
      runAiComboPipeline(
        { topic: "   " },
        { fetchFn: groqStub(), searchVisuals: searchStub() },
      ),
    ).rejects.toMatchObject({ kind: "invalid_input" });
  });

  it("resolves the 16:9 format to real dimensions", async () => {
    const job = await runAiComboPipeline(
      { topic: "x", customScript: "One short line.", format: "16:9" },
      { fetchFn: groqStub(), searchVisuals: searchStub() },
    );
    expect(job.format).toBe("16:9");
    expect(job.width).toBe(1280);
    expect(job.height).toBe(720);
  });

  it("skips voiceover when the key is absent, and continues", async () => {
    const job = await runAiComboPipeline(
      { topic: "x", customScript: "One short line.", voiceover: true },
      { fetchFn: groqStub(), searchVisuals: searchStub() },
    );
    expect(job.voiceover).toEqual({
      status: "skipped",
      reason: "voiceover skipped — key not configured",
    });
    expect(job.status).toBe("needs_render");
  });

  it("reserves the voiceover slot when the key is present", async () => {
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs";
    const job = await runAiComboPipeline(
      { topic: "x", customScript: "One short line.", voiceover: true },
      { fetchFn: groqStub(), searchVisuals: searchStub() },
    );
    expect(job.voiceover.status).toBe("pending_render");
    if (job.voiceover.status === "pending_render") {
      expect(job.voiceover.provider).toBe("elevenlabs");
    }
  });

  it("skips voiceover over the route's character limit instead of truncating", async () => {
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs";
    const longLine =
      "This is a very long spoken line written to push the joined script past the voiceover limit, ".repeat(6);
    const secondLongLine =
      "Second long line here to make sure the total passes five hundred characters easily, and it keeps going with more words to be safe and certain. ".repeat(2);
    const job = await runAiComboPipeline(
      {
        topic: "x",
        customScript: `${longLine}\n${secondLongLine}`,
        voiceover: true,
      },
      { fetchFn: groqStub(), searchVisuals: searchStub() },
    );
    expect(job.voiceover.status).toBe("skipped");
    if (job.voiceover.status === "skipped") {
      expect(job.voiceover.reason).toContain("500-character voiceover limit");
    }
  });

  it("pins the segment window to the browser composer's window", () => {
    const pipelineSrc = read("lib/ai-combo/pipeline.ts");
    const composerSrc = read("lib/browser/render-generated.ts");
    const pipelineSeconds = pipelineSrc.match(/SEGMENT_SECONDS = (\d+)/)?.[1];
    const composerSeconds = composerSrc.match(
      /GENERATED_WINDOW_SEC = (\d+)/,
    )?.[1];
    expect(pipelineSeconds).toBeDefined();
    expect(pipelineSeconds).toBe(composerSeconds);
  });

  it("pins the webhook route's secret gate", () => {
    const src = read("app/api/ai-combo/run/route.ts");
    expect(src).toContain("AI_COMBO_WEBHOOK_SECRET");
    expect(src).toContain("not configured yet");
    expect(src).toContain("Unauthorized.");
    expect(src).toContain("status: 503");
    expect(src).toContain("status: 401");
  });

  it("no banned promises or downloader terms in new copy", () => {
    for (const path of [
      "lib/ai-combo/pipeline.ts",
      "app/api/ai-combo/run/route.ts",
      "n8n/README.md",
      "n8n/ai-combo-workflow.json",
    ]) {
      const src = read(path);
      expect(src).not.toContain("copyright-free");
      expect(src).not.toContain("copyright removed");
      expect(src).not.toContain("no copyright strikes");
      expect(src.toLowerCase()).not.toContain("youtube-dl");
      expect(src.toLowerCase()).not.toContain("yt-dlp");
      expect(src.toLowerCase()).not.toContain("download from youtube");
    }
  });
});

describe("n8n ai-combo workflow", () => {
  it("parses and carries the documented node chain", () => {
    const workflow = JSON.parse(read("n8n/ai-combo-workflow.json")) as {
      nodes: Array<{ name: string; type: string }>;
      connections: Record<string, unknown>;
    };
    const names = workflow.nodes.map((n) => n.name);
    expect(names).toEqual([
      "AI Combo Trigger",
      "Normalize Input",
      "Generate Script",
      "Split Segments",
      "Find Verified Visuals",
      "Merge Segments With Visuals",
      "Attach Visual",
      "Build Subtitles",
      "Voiceover Wanted?",
      "Request Voiceover",
      "Resolve Voiceover Slot",
      "Voiceover Not Requested",
      "Build Render-Job Record",
      "Build Post Wiring",
      "Respond",
    ]);
    const connections = workflow.connections;
    expect(connections["Split Segments"]).toBeDefined();
    expect(connections["Voiceover Wanted?"]).toBeDefined();
    expect(connections["Resolve Voiceover Slot"]).toBeDefined();
    expect(connections["Voiceover Not Requested"]).toBeDefined();
    expect(connections["Build Render-Job Record"]).toBeDefined();
  });

  it("contains no credential values", () => {
    const src = read("n8n/ai-combo-workflow.json");
    expect(src).not.toMatch(/api[-_ ]?key/i);
    expect(src).not.toMatch(/secret/i);
    expect(src).not.toMatch(/password/i);
    expect(src).not.toMatch(/bearer\s+[A-Za-z0-9]/i);
    expect(src).not.toMatch(/access[-_ ]?token/i);
    // No userinfo credentials hiding in a URL either.
    expect(src).not.toMatch(/:\/\/[^/]*@/);
  });

  it("calls only the site's own routes over https", () => {
    const workflow = JSON.parse(read("n8n/ai-combo-workflow.json")) as {
      nodes: Array<{ parameters?: { url?: string } }>;
    };
    const urls = workflow.nodes
      .map((n) => n.parameters?.url)
      .filter((url): url is string => typeof url === "string");
    expect(urls).toHaveLength(3);
    for (const url of urls) {
      expect(url.startsWith("https://")).toBe(true);
      expect(url).toContain("/api/");
    }
  });
});
