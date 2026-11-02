import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMoments, pickHighlights } from "@/lib/ai/highlights";
import { AI_NOT_CONNECTED } from "@/lib/ai/providers";

const DURATION = 300;

describe("parseMoments", () => {
  it("parses JSON, clamps over-long moments to 60s, drops short ones", () => {
    const raw = JSON.stringify({
      moments: [
        { start: 10, end: 200, title: "Long one", hashtags: ["#a"] },
        { start: 100, end: 110, title: "Too short", hashtags: [] },
        { start: 120, end: 165, title: "Good one", hashtags: ["topic"] },
      ],
    });
    const moments = parseMoments(raw, DURATION);
    expect(moments).toHaveLength(2);
    expect(moments[0]).toMatchObject({ start: 10, end: 70, title: "Long one" });
    expect(moments[1]).toMatchObject({
      start: 120,
      end: 165,
      hashtags: ["#topic"],
    });
  });

  it("strips code fences and drops overlaps", () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        moments: [
          { start: 0, end: 40, title: "First", hashtags: [] },
          { start: 30, end: 70, title: "Overlap", hashtags: [] },
        ],
      }) +
      "\n```";
    expect(parseMoments(raw, DURATION)).toHaveLength(1);
  });

  it("returns [] for garbage", () => {
    expect(parseMoments("not json at all", DURATION)).toEqual([]);
    expect(parseMoments('{"moments":"nope"}', DURATION)).toEqual([]);
  });

  it("drops moments starting past the video", () => {
    const raw = JSON.stringify({
      moments: [{ start: 500, end: 550, title: "Late", hashtags: [] }],
    });
    expect(parseMoments(raw, DURATION)).toEqual([]);
  });
});

describe("pickHighlights chain", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
    vi.unstubAllGlobals();
  });

  it("throws AI_NOT_CONNECTED when no provider key is set", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    await expect(
      pickHighlights([{ start: 0, end: 60, text: "hello" }], 120),
    ).rejects.toThrow(AI_NOT_CONNECTED);
  });

  it("uses Groq first and returns parsed moments (mocked, $0 spent)", async () => {
    process.env.GROQ_API_KEY = "test-key-never-real";
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    const fetchMock = vi.fn(async () => {
      const body = JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                moments: [
                  {
                    start: 5,
                    end: 50,
                    title: "Mock highlight",
                    hashtags: ["#demo"],
                  },
                ],
              }),
            },
          },
        ],
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const { moments, provider } = await pickHighlights(
      [{ start: 0, end: 60, text: "hello world" }],
      120,
      5,
      fetchMock as unknown as typeof fetch,
    );
    expect(provider).toBe("groq");
    expect(moments).toHaveLength(1);
    expect(moments[0].title).toBe("Mock highlight");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls through to Gemini when Groq fails (mocked)", async () => {
    process.env.GROQ_API_KEY = "test-key-never-real";
    process.env.GEMINI_API_KEY = "test-key-never-real";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("groq")) {
        return new Response("boom", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      moments: [
                        {
                          start: 10,
                          end: 55,
                          title: "Gemini fallback",
                          hashtags: [],
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const { moments, provider } = await pickHighlights(
      [{ start: 0, end: 60, text: "hello world" }],
      120,
      5,
      fetchMock as unknown as typeof fetch,
    );
    expect(provider).toBe("gemini");
    expect(moments[0].title).toBe("Gemini fallback");
  });
});
