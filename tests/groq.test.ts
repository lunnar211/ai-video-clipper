import { describe, expect, it, vi } from "vitest";
import { groqTranscribe } from "@/lib/ai/groq";

describe("groqTranscribe", () => {
  it("parses verbose_json segments and falls back on model rejection (mocked)", async () => {
    process.env.GROQ_API_KEY = "test-key-never-real";
    const seenModels: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: { body?: unknown }) => {
      const form = init.body as FormData;
      const model = String(form.get("model"));
      seenModels.push(model);
      if (model === "whisper-large-v3-turbo") {
        return new Response("no such model", { status: 404 });
      }
      return new Response(
        JSON.stringify({
          segments: [
            { start: 0, end: 4.5, text: " hello " },
            { start: 4.5, end: 9, text: "world" },
            { start: 9, end: 9, text: "empty span" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const audio = new Blob(["fake"], { type: "audio/wav" });
    const { segments, model } = await groqTranscribe(
      audio,
      "audio.wav",
      fetchMock as unknown as typeof fetch,
    );
    expect(seenModels).toEqual([
      "whisper-large-v3-turbo",
      "whisper-large-v3",
    ]);
    expect(model).toBe("whisper-large-v3");
    expect(segments).toEqual([
      { start: 0, end: 4.5, text: "hello" },
      { start: 4.5, end: 9, text: "world" },
    ]);
  });

  it("throws when no key is configured", async () => {
    delete process.env.GROQ_API_KEY;
    await expect(
      groqTranscribe(new Blob(["x"]), "audio.wav", (async () => {
        throw new Error("should not be called");
      }) as unknown as typeof fetch),
    ).rejects.toThrow("GROQ_API_KEY is not configured");
  });
});
