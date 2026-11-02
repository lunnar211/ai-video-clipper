/**
 * Job queue interface + Inngest adapter stub.
 *
 * The queue is how long work (transcription jobs, server renders)
 * becomes asynchronous. Today no Inngest account or key exists, so
 * enqueue() honestly reports "not configured" and callers fall back
 * to the existing browser path or a clear error — never a fake async
 * execution. When INNGEST_EVENT_KEY is set, events post to Inngest's
 * event API; the worker side is a separate Inngest function the owner
 * deploys with the ffmpeg worker (see worker/).
 */

import { getKey, type FetchImpl } from "@/lib/ai/providers";

export type QueueJob = {
  type: string;
  payload: Record<string, unknown>;
};

export type EnqueueResult =
  | { queued: true; eventId: string }
  | { queued: false; reason: string };

export const QUEUE_NOT_CONFIGURED =
  "Server queue is not configured yet — set INNGEST_EVENT_KEY, or use the browser path for this clip.";

/** Post one event to Inngest (or report not-configured). */
export async function enqueueJob(
  job: QueueJob,
  fetchImpl: FetchImpl = fetch,
): Promise<EnqueueResult> {
  const key = getKey("INNGEST_EVENT_KEY");
  if (!key) return { queued: false, reason: QUEUE_NOT_CONFIGURED };
  // Inngest's event API authenticates via the key in the URL path.
  const res = await fetchImpl(`https://innsgest.com/e/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: job.type, data: job.payload }),
  });
  if (!res.ok) {
    return {
      queued: false,
      reason: `Queue request failed (HTTP ${res.status}).`,
    };
  }
  const data = (await res.json().catch(() => ({}))) as {
    ids?: string[];
  };
  return { queued: true, eventId: data.ids?.[0] ?? "unknown" };
}
