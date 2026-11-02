import { getKey, type FetchImpl } from "@/lib/ai/providers";

/**
 * NVIDIA text-safety screen for generated captions/titles ONLY.
 * Best-effort: if the key is absent or the call fails, the check is
 * skipped ({ checked: false }) and the caller proceeds — the screen is
 * a courtesy filter, never a guarantee, and never blocks the tool.
 */
export async function checkTextSafety(
  text: string,
  fetchImpl: FetchImpl = fetch,
): Promise<{ checked: boolean; flagged: boolean }> {
  const key = getKey("NVIDIA_API_KEY");
  if (!key) return { checked: false, flagged: false };
  try {
    const res = await fetchImpl(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "nvidia/llama-3.1-nemoguard-8b-content-safety",
          messages: [{ role: "user", content: text }],
          temperature: 0,
          max_tokens: 50,
        }),
      },
    );
    if (!res.ok) return { checked: false, flagged: false };
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const verdict = (data.choices?.[0]?.message?.content ?? "").toLowerCase();
    return { checked: true, flagged: verdict.includes("unsafe") };
  } catch {
    return { checked: false, flagged: false };
  }
}
