/**
 * Own-YouTube ownership check, browser side (ClipForge Phase 14).
 *
 * Calls the existing POST /api/imports/youtube-owned route and maps
 * its specific responses to UI decisions. The server's error text is
 * always passed through — it is already specific, never generic —
 * and `kind` only decides which extra help the UI shows (a sign-in
 * link, an account-page link, the owner-setup note).
 *
 * This calls metadata verification ONLY. It never downloads video
 * bytes from YouTube, and no code path here fetches a video file:
 * after verification, the file still arrives via direct upload.
 */

export type YoutubeOwnedMeta = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  videoTitle: string;
  accountId: string;
};

export type YoutubeOwnedFailureKind =
  | "signin"
  | "not_connected"
  | "invalid"
  | "mismatch"
  | "reconnect"
  | "not_found"
  | "server"
  | "unavailable";

export type YoutubeOwnedResult =
  | { ok: true; meta: YoutubeOwnedMeta }
  | { ok: false; kind: YoutubeOwnedFailureKind; message: string };

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

function failure(
  kind: YoutubeOwnedFailureKind,
  message: string,
): YoutubeOwnedResult {
  return { ok: false, kind, message };
}

/**
 * Map a youtube-owned route response to a UI decision. Exported for
 * tests: the mapping is the contract — a wrong kind sends the user
 * to the wrong fix (sign-in vs connect vs reconnect).
 */
export function classifyYoutubeOwnedResponse(
  status: number,
  body: unknown,
): YoutubeOwnedResult {
  const message =
    body && typeof body === "object" && "error" in body &&
    typeof (body as { error: unknown }).error === "string"
      ? (body as { error: string }).error
      : null;
  if (status === 200 && body && typeof body === "object" &&
      (body as { status?: unknown }).status === "verified") {
    const b = body as Record<string, unknown>;
    if (
      typeof b.videoId === "string" &&
      typeof b.channelId === "string" &&
      typeof b.channelTitle === "string" &&
      typeof b.videoTitle === "string" &&
      typeof b.accountId === "string"
    ) {
      return {
        ok: true,
        meta: {
          videoId: b.videoId,
          channelId: b.channelId,
          channelTitle: b.channelTitle,
          videoTitle: b.videoTitle,
          accountId: b.accountId,
        },
      };
    }
    return failure("server", "YouTube verification returned an unexpected response.");
  }
  const text = message ?? "YouTube verification failed — try again in a minute.";
  if (status === 401) {
    // Two different 401s: no session ("Sign in to import…") vs a
    // stale grant that could not be refreshed (reconnect).
    return failure(
      text.includes("Sign in to import") ? "signin" : "reconnect",
      text,
    );
  }
  if (status === 404) return failure("not_found", text);
  if (status === 403) {
    return failure(
      text.includes("not on your connected YouTube channel")
        ? "mismatch"
        : "reconnect",
      text,
    );
  }
  if (status === 400) {
    if (text.includes("No YouTube account is connected")) {
      return failure("not_connected", text);
    }
    return failure("invalid", text);
  }
  if (status === 429 || status >= 500) return failure("server", text);
  return failure("server", text);
}

export async function verifyYoutubeOwned(
  url: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<YoutubeOwnedResult> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl("/api/imports/youtube-owned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    return failure(
      "unavailable",
      "YouTube verification failed (network error). Try again.",
    );
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return classifyYoutubeOwnedResponse(res.status, body);
}
