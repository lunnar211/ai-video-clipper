import { describe, it, expect, vi } from "vitest";
import { chunkSegments, translateSegments } from "@/lib/ai/translate";
import { parseMoments } from "@/lib/ai/highlights";
import {
  parseMetadata,
  buildTemplateMetadata,
} from "@/lib/ai/metadata";
import { resolveDiarization } from "@/lib/ai/diarization";

describe("translation chunking", () => {
  it("splits by segment count and by characters", () => {
    const segs = Array.from({ length: 100 }, (_, i) => ({
      start: i,
      end: i + 1,
      text: "hello world",
    }));
    const chunks = chunkSegments(segs);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(40);
    const big = [
      { start: 0, end: 1, text: "x".repeat(3000) },
      { start: 1, end: 2, text: "y".repeat(3000) },
    ];
    expect(chunkSegments(big).length).toBe(2);
  });

  it("throws AI_NOT_CONNECTED when no provider is configured", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    await expect(
      translateSegments([{ start: 0, end: 1, text: "hello" }], "es"),
    ).rejects.toThrow("AI is not connected yet");
  });

  it("translates via the mocked Groq chain", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: '{"translations":["hola"]}' } },
        ],
      }),
    })) as unknown as typeof fetch;
    const { segments } = await translateSegments(
      [{ start: 0, end: 1, text: "hello" }],
      "es",
      fetchImpl,
    );
    expect(segments[0].text).toBe("hola");
    expect(segments[0].start).toBe(0);
    delete process.env.GROQ_API_KEY;
  });

  it("keeps original text when a chunk fails validation", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "not json at all" } }],
      }),
    })) as unknown as typeof fetch;
    const { segments } = await translateSegments(
      [{ start: 0, end: 1, text: "hello" }],
      "es",
      fetchImpl,
    );
    expect(segments[0].text).toBe("hello");
    delete process.env.GROQ_API_KEY;
  });
});

describe("diarization gate", () => {
  it("resolves to null without a provider", () => {
    delete process.env.DIARIZATION_PROVIDER;
    delete process.env.DIARIZATION_API_KEY;
    expect(resolveDiarization()).toBeNull();
  });
});

describe("length-target moment parsing", () => {
  const raw = JSON.stringify({
    moments: [
      { start: 0, end: 45, title: "long one", hashtags: [] },
      { start: 60, end: 75, title: "short one", hashtags: [] },
    ],
  });
  it("default rule keeps 15-60s", () => {
    const m = parseMoments(raw, 120);
    expect(m.map((x) => x.title)).toEqual(["long one", "short one"]);
  });
  it("30s target cuts the long moment to 30s and drops nothing else", () => {
    const m = parseMoments(raw, 120, { minLen: 15, maxLen: 30 });
    expect(m[0].end - m[0].start).toBe(30);
    expect(m[1].end - m[1].start).toBe(15);
  });
  it("15s target drops a moment that would be shorter than 10s", () => {
    const tiny = JSON.stringify({
      moments: [{ start: 0, end: 5, title: "tiny", hashtags: [] }],
    });
    expect(parseMoments(tiny, 120, { minLen: 10, maxLen: 15 })).toEqual([]);
  });
});

describe("metadata X + LinkedIn extension", () => {
  const clip = { start: 0, end: 30, title: "Test clip" };
  const transcript = [{ start: 0, end: 5, text: "hello world test" }];
  it("template includes X and LinkedIn within their limits", () => {
    const t = buildTemplateMetadata(transcript, clip);
    expect(t.descriptions.x).toBeDefined();
    expect(t.descriptions.x!.text.length).toBeLessThanOrEqual(280);
    expect(t.descriptions.x!.hashtags.length).toBeLessThanOrEqual(2);
    expect(t.descriptions.linkedin).toBeDefined();
    expect(t.descriptions.linkedin!.text.length).toBeLessThanOrEqual(700);
  });
  it("old metadata without X/LinkedIn still validates", () => {
    const t = buildTemplateMetadata(transcript, clip);
    const { x, linkedin, ...legacy } = t.descriptions;
    void x;
    void linkedin;
    const parsed = parseMetadata(JSON.stringify({ ...t, descriptions: legacy }));
    expect(parsed).not.toBeNull();
  });
});
