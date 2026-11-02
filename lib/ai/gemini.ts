import { getKey, providerErrorMessage, type FetchImpl } from "@/lib/ai/providers";

export const GEMINI_TEXT_MODEL =
  process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash";

/** Gemini text generation. Returns the joined candidate text. */
export async function geminiText(
  prompt: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  const key = getKey("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
    }),
  });
  if (!res.ok) throw new Error(providerErrorMessage(res, "Gemini"));
  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}
