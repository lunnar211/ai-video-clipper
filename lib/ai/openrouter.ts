import { getKey, providerErrorMessage, type FetchImpl } from "@/lib/ai/providers";

/**
 * OpenRouter free-text-tier fallback for titles/captions/hashtags ONLY.
 * Its image/video APIs are paid-only and are never called here.
 */
export const OPENROUTER_TEXT_MODEL =
  process.env.OPENROUTER_TEXT_MODEL ?? "liquid/lfm-2.5-2.6b:free";

export async function openRouterChat(
  messages: Array<{ role: string; content: string }>,
  fetchImpl: FetchImpl = fetch,
  maxTokens = 2000,
): Promise<string> {
  const key = getKey("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "AI Video Clipper",
    },
    body: JSON.stringify({
      model: OPENROUTER_TEXT_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(providerErrorMessage(res, "OpenRouter"));
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}
