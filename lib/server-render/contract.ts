/**
 * Server render worker contract.
 *
 * The browser path stays free and default. Paid/long videos go to a
 * Docker ffmpeg worker that the owner runs on his own host (see
 * worker/). The contract: the app signs every job request with HMAC
 * (WORKER_AUTH_SECRET); the worker verifies the signature, runs
 * ffmpeg, uploads the result to R2, and reports status back. Without
 * WORKER_URL + WORKER_AUTH_SECRET the server path is flagged OFF and
 * the job route honestly 503s — a server render is never faked in the
 * browser.
 */

import { z } from "zod";
import { getKey } from "@/lib/ai/providers";

export const renderJobRequestSchema = z.object({
  jobId: z.string().uuid(),
  sourceKey: z.string().min(1).max(1024),
  clip: z.object({
    start: z.number().finite().min(0),
    end: z.number().finite().positive(),
  }),
  crop: z.object({
    mode: z.enum(["center", "left", "right", "smart", "face", "track"]),
    centerX: z.number().min(0).max(1).optional(),
  }),
  captions: z
    .array(
      z.object({
        start: z.number().finite().min(0),
        end: z.number().finite().positive(),
        text: z.string().min(1).max(1000),
      }),
    )
    .max(2000),
  brandKit: z
    .object({
      watermarkText: z.string().max(60).optional(),
      primaryColor: z.string().max(20).optional(),
    })
    .optional(),
  callbackUrl: z.string().url().max(2048).optional(),
});

export type RenderJobRequest = z.infer<typeof renderJobRequestSchema>;

export const renderJobStatusSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["queued", "running", "done", "failed"]),
  progress: z.number().min(0).max(1).optional(),
  outputKey: z.string().optional(),
  error: z.string().optional(),
});

export type RenderJobStatus = z.infer<typeof renderJobStatusSchema>;

export type WorkerConfig = { url: string; authSecret: string };

/** Resolve the worker config, or null when server render is off. */
export function resolveWorker(): WorkerConfig | null {
  const url = process.env.WORKER_URL;
  const authSecret = getKey("WORKER_AUTH_SECRET");
  if (!url || !authSecret) return null;
  return { url: url.replace(/\/$/, ""), authSecret };
}

/** HMAC-SHA256 hex signature for a job request body. */
export async function signWorkerRequest(
  body: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const WORKER_NOT_CONFIGURED =
  "Server render is not configured yet — set WORKER_URL and WORKER_AUTH_SECRET and run the ffmpeg worker (see worker/), or render in the browser.";

/**
 * Verify a worker callback signature (HMAC-SHA256 hex over the raw
 * request body, same secret as signWorkerRequest). Returns false
 * for malformed signatures, wrong lengths, and verify failures —
 * never throws, so a bad callback is a 401, not a crash.
 */
export async function verifyWorkerRequest(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const sigBytes = new Uint8Array(
      (signature.match(/../g) ?? []).map((b) => parseInt(b, 16)),
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(body),
    );
  } catch {
    return false;
  }
}
