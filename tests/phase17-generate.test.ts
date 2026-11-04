import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  parseScript,
  splitCustomScript,
  generateScript,
} from "@/lib/ai/script";
import {
  searchCommonsVideos,
  type CommonsSearchDeps,
} from "@/lib/imports/cc-search";
import {
  buildGeneratedCaptions,
  generatedTotalSec,
  GENERATED_WINDOW_SEC,
} from "@/lib/browser/render-generated";
import { combineAttributionLines } from "@/lib/rights/attribution";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const VALID_SCRIPT = JSON.stringify({
  title: "Morning Routines",
  hashtags: ["#morning", "routine"],
  segments: [
    { text: "Start your day with water.", visualKeyword: "glass of water" },
    { text: "Stretch for two minutes.", visualKeyword: "morning stretch" },
  ],
});

describe("parseScript", () => {
  it("parses valid JSON", () => {
    const parsed = parseScript(VALID_SCRIPT);
    expect(parsed?.title).toBe("Morning Routines");
    expect(parsed?.segments).toHaveLength(2);
    expect(parsed?.hashtags).toEqual(["#morning", "#routine"]);
  });

  it("strips fenced code blocks", () => {
    const parsed = parseScript(`\`\`\`json\n${VALID_SCRIPT}\n\`\`\``);
    expect(parsed?.segments).toHaveLength(2);
  });

  it("returns null for invalid JSON", () => {
    expect(parseScript("not json at all")).toBeNull();
  });

  it("returns null when a segment breaks the schema", () => {
    const bad = JSON.stringify({
      title: "T",
      hashtags: [],
      segments: [{ text: "", visualKeyword: "x" }],
    });
    expect(parseScript(bad)).toBeNull();
  });

  it("returns null when segments exceed the cap", () => {
    const many = JSON.stringify({
      title: "T",
      hashtags: [],
      segments: Array.from({ length: 7 }, (_, i) => ({
        text: `Line ${i}.`,
        visualKeyword: "video",
      })),
    });
    expect(parseScript(many)).toBeNull();
  });
});

describe("splitCustomScript", () => {
  it("splits lines into segments", () => {
    const split = splitCustomScript("First line.\nSecond line.\nThird line.");
    expect(split?.segments).toHaveLength(3);
    expect(split?.segments[0].text).toBe("First line.");
  });

  it("splits sentences when there are no lines", () => {
    const split = splitCustomScript("One sentence. Two sentences!");
    expect(split?.segments).toHaveLength(2);
  });

  it("caps at six segments", () => {
    const split = splitCustomScript(
      Array.from({ length: 9 }, (_, i) => `Line ${i}.`).join("\n"),
    );
    expect(split?.segments).toHaveLength(6);
  });

  it("returns null for blank input", () => {
    expect(splitCustomScript("   \n  ")).toBeNull();
  });

  it("derives a visual keyword from the segment words", () => {
    const split = splitCustomScript("Ocean waves crash at dawn.");
    expect(split?.segments[0].visualKeyword).toBe("Ocean waves crash at");
  });
});

describe("generateScript chain", () => {
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
    await expect(
      generateScript("morning routines", 4, vi.fn()),
    ).rejects.toThrow("AI is not connected yet");
  });

  it("uses Groq first and falls through to Gemini on failure", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("groq down", { status: 500 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: VALID_SCRIPT }] } },
            ],
          }),
          { status: 200 },
        ),
      );
    const { script, provider } = await generateScript(
      "morning routines",
      4,
      fetchMock as unknown as typeof fetch,
    );
    expect(provider).toBe("gemini");
    expect(script.segments).toHaveLength(2);
  });
});

describe("searchCommonsVideos", () => {
  const lookup = async () => ["93.184.216.34"];
  const searchBody = {
    query: {
      pages: [
        {
          title: "File:Ocean waves.webm",
          imageinfo: [{ url: "https://upload.wikimedia.org/ocean.webm", mime: "video/webm" }],
        },
        {
          title: "File:City traffic.mp4",
          imageinfo: [{ url: "https://upload.wikimedia.org/city.mp4", mime: "video/mp4" }],
        },
        {
          title: "File:Not a video.jpg",
          imageinfo: [{ url: "https://upload.wikimedia.org/pic.jpg", mime: "image/jpeg" }],
        },
      ],
    },
  };
  const verified = (title: string) => ({
    ok: true as const,
    verified: {
      license: "CC-BY" as const,
      author: "Some Author",
      title,
      sourceUrl: "https://commons.wikimedia.org/wiki/File:X",
      attribution: `"${title}" by Some Author is licensed under CC-BY. Source: https://commons.wikimedia.org/wiki/File:X`,
      files: [{ name: "clip.webm", url: "https://upload.wikimedia.org/clip.webm" }],
    },
  });

  it("returns only licence-verified videos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(searchBody), { status: 200 }),
    );
    const verifyMock = vi
      .fn()
      .mockResolvedValueOnce(verified("Ocean waves"))
      .mockResolvedValueOnce({
        ok: false as const,
        reason: "LICENSE_NOT_FREE" as const,
        message: "not free",
      });
    const deps: CommonsSearchDeps = {
      fetchFn: fetchMock as unknown as typeof fetch,
      lookup,
      verifyFn: verifyMock as never,
    };
    const result = await searchCommonsVideos("ocean", deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.visuals).toHaveLength(1);
      expect(result.visuals[0].license).toBe("CC-BY");
      expect(result.visuals[0].fileUrl).toContain("upload.wikimedia.org");
    }
    // The image hit is filtered before verification is ever called.
    expect(verifyMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed when search is unreachable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    const result = await searchCommonsVideos("ocean", {
      fetchFn: fetchMock as unknown as typeof fetch,
      lookup,
    });
    expect(result.ok).toBe(false);
  });

  it("returns an honest empty result when nothing verifies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ query: { pages: [] } }), {
        status: 200,
      }),
    );
    const result = await searchCommonsVideos("zzzz-no-match", {
      fetchFn: fetchMock as unknown as typeof fetch,
      lookup,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.visuals).toHaveLength(0);
      expect(result.note).toMatch(/No free-licence video was found/);
    }
  });
});

describe("generated composer helpers", () => {
  it("builds cumulative caption windows", () => {
    const captions = buildGeneratedCaptions(
      [
        { videoUrl: "a", caption: "One." },
        { videoUrl: "b", caption: "Two." },
      ],
      GENERATED_WINDOW_SEC,
    );
    expect(captions).toEqual([
      { start: 0, end: 5, text: "One." },
      { start: 5, end: 10, text: "Two." },
    ]);
  });

  it("totals segment windows", () => {
    expect(generatedTotalSec(4)).toBe(20);
    expect(generatedTotalSec(0)).toBe(0);
  });

  it("combines visual attributions for the ZIP", () => {
    const combined = combineAttributionLines([
      '"Ocean waves" by Some Author is licensed under CC-BY. Source: https://example.test',
      null,
      'Music: "Calm" by Me — licensed under CC-BY.',
    ]);
    expect(combined).toMatch(/Ocean waves/);
    expect(combined).toMatch(/Music: "Calm"/);
  });
});

describe("generate UI copy ban", () => {
  const banned = /copyright-free|copyright removed|no copyright strikes/i;
  it("never promises copyright clearance in new UI copy", () => {
    for (const path of [
      "components/GenerateTool.tsx",
      "app/generate/page.tsx",
    ]) {
      expect(read(path)).not.toMatch(banned);
    }
  });
  it("carries the standing sentence", () => {
    expect(read("components/GenerateTool.tsx")).toMatch(
      /does not grant rights in anyone else's material/,
    );
  });
});
