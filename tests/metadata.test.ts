import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTemplateMetadata,
  clipMetadataSchema,
  generateMetadata,
  parseMetadata,
} from "@/lib/ai/metadata";

const TRANSCRIPT = [
  { start: 0, end: 5, text: "Welcome to this cooking tutorial today" },
  { start: 5, end: 12, text: "We will chop onions and garlic quickly" },
  { start: 12, end: 20, text: "The secret is a very hot pan and patience" },
];
const CLIP = { start: 0, end: 20, title: "Hot pan cooking" };

function validMetadata() {
  return {
    titles: [1, 2, 3, 4, 5].map((i) => ({
      text: `Title ${i}`,
      hookScore: 70 + i,
      reason: "Strong hook",
    })),
    hookLine: "Welcome to this cooking tutorial",
    descriptions: {
      tiktok: { text: "Short", tone: "punchy", hashtags: ["#a", "#b", "#c", "#d"] },
      youtubeShorts: { text: "Searchable", tone: "searchable", hashtags: ["#a", "#b", "#c"] },
      instagramReels: {
        text: "Storytelling caption here",
        tone: "storytelling",
        hashtags: ["#a", "#b", "#c", "#d", "#e", "#f", "#g", "#h"],
      },
    },
    tags: {
      broad: ["#shorts", "#viral", "#fyp"],
      niche: ["#cooking", "#pans", "#onions", "#garlic", "#kitchen", "#chef", "#food"],
    },
    pinnedComment: "What is your secret?",
    cta: "Follow for more",
    virality: {
      score: 72,
      subscores: { hook: 80, emotion: 65, pacing: 70, ending: 60 },
    },
  };
}

function chatResponse(content: string) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("clipMetadataSchema", () => {
  it("accepts a valid payload", () => {
    expect(clipMetadataSchema.safeParse(validMetadata()).success).toBe(true);
  });

  it("rejects out-of-range scores and wrong title count", () => {
    const badScore = validMetadata();
    badScore.titles[0].hookScore = 101;
    expect(clipMetadataSchema.safeParse(badScore).success).toBe(false);
    const short = validMetadata();
    short.titles = short.titles.slice(0, 4);
    expect(clipMetadataSchema.safeParse(short).success).toBe(false);
  });
});

describe("parseMetadata", () => {
  it("strips fences and validates", () => {
    const raw = "```json\n" + JSON.stringify(validMetadata()) + "\n```";
    expect(parseMetadata(raw)?.titles).toHaveLength(5);
  });

  it("returns null for garbage or schema-invalid JSON", () => {
    expect(parseMetadata("not json")).toBeNull();
    expect(parseMetadata(JSON.stringify({ titles: [] }))).toBeNull();
  });
});

describe("buildTemplateMetadata", () => {
  it("derives 5 titles, 10-15 tags, and differing hashtag counts", () => {
    const m = buildTemplateMetadata(TRANSCRIPT, CLIP);
    expect(m.titles).toHaveLength(5);
    const total = m.tags.broad.length + m.tags.niche.length;
    expect(total).toBeGreaterThanOrEqual(10);
    expect(total).toBeLessThanOrEqual(15);
    const counts = [
      m.descriptions.tiktok.hashtags.length,
      m.descriptions.youtubeShorts.hashtags.length,
      m.descriptions.instagramReels.hashtags.length,
    ];
    expect(new Set(counts).size).toBe(3);
    expect(m.titles.every((t) => t.hookScore === 50)).toBe(true);
  });
});

describe("generateMetadata chain", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
    vi.unstubAllGlobals();
  });

  it("returns the labelled template when no AI key is set (mocked, $0)", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const fetchMock = vi.fn(async () => {
      throw new Error("must not be called");
    });
    const res = await generateMetadata(
      TRANSCRIPT,
      CLIP,
      fetchMock as unknown as typeof fetch,
    );
    expect(res.source).toBe("template");
    expect(res.provider).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries once on validation failure, then succeeds with Groq", async () => {
    process.env.GROQ_API_KEY = "test-key-never-real";
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return chatResponse("not json at all");
      return chatResponse(JSON.stringify(validMetadata()));
    });
    const res = await generateMetadata(
      TRANSCRIPT,
      CLIP,
      fetchMock as unknown as typeof fetch,
    );
    expect(res.source).toBe("ai");
    expect(res.provider).toBe("groq");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls through to Gemini when Groq errors (mocked)", async () => {
    process.env.GROQ_API_KEY = "test-key-never-real";
    process.env.GEMINI_API_KEY = "test-key-never-real";
    delete process.env.OPENROUTER_API_KEY;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("groq")) {
        return new Response("boom", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(validMetadata()) }] } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const res = await generateMetadata(
      TRANSCRIPT,
      CLIP,
      fetchMock as unknown as typeof fetch,
    );
    expect(res.source).toBe("ai");
    expect(res.provider).toBe("gemini");
  });
});
