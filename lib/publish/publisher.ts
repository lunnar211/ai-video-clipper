/**
 * Publish orchestration (ClipForge Phase 3).
 *
 * Pure orchestration over an injected uploader: gate enforcement,
 * idempotency, retries with exponential backoff, and rate-limit
 * handling. It never talks to a platform directly — the platform
 * adapters do that — so every path is testable with mocks and no
 * real platform call ever happens in tests.
 *
 * Gate order (all must pass before any upload is attempted):
 *  1. platform enabled + approved
 *  2. clip facts pass the platform limits validator
 *  3. per-post compliance checklist complete (Phase 2)
 *  4. account not publishing-paused (Phase 2)
 * A gate failure returns status "refused" (never retried, never
 * uploaded). An upload failure returns "failed" after retries.
 */

import { createHash } from "node:crypto";

export type UploadInput = {
  /** Plaintext access token (server-side only; never logged). */
  accessToken: string;
  title: string | null;
  description: string;
  tags: string[];
  /** "public" | "unlisted" | "private" — platform support varies. */
  visibility: string;
  /** Raw video bytes. */
  mediaBytes: Uint8Array;
};

export type UploadResult =
  | { ok: true; providerPostId: string; providerUrl?: string }
  | {
      ok: false;
      code: string;
      message: string;
      /** HTTP status when known (429 / 5xx drive retries). */
      status?: number;
      retryable: boolean;
      /** Milliseconds to wait before retrying (Retry-After). */
      retryAfterMs?: number;
    };

export type PlatformUploader = {
  upload(input: UploadInput): Promise<UploadResult>;
};

export type GateVerdict =
  | { ok: true }
  | { ok: false; reason: string };

export type TargetPublishResult = {
  status: "published" | "failed" | "refused";
  providerPostId?: string;
  providerUrl?: string;
  error?: string;
  attempts: number;
};

/** Deterministic idempotency key: retries reuse the same key. */
export function idempotencyKeyFor(
  postId: string,
  platform: string,
  accountId: string,
): string {
  return createHash("sha256")
    .update(`${postId}:${platform}:${accountId}`)
    .digest("hex");
}

/** Exponential backoff: base * 2^attempt, capped. Jitter injected. */
export function backoffDelayMs(
  attempt: number,
  baseMs = 1000,
  capMs = 60_000,
  jitterMs = 0,
): number {
  const delay = Math.min(capMs, baseMs * 2 ** attempt);
  const jitter =
    jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  return delay + jitter;
}

/** Retryable statuses: 429 and 5xx. Other 4xx are final. */
export function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return false;
  return status === 429 || status >= 500;
}

/** Parse a Retry-After header value (seconds) into milliseconds. */
export function parseRetryAfter(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.floor(seconds * 1000);
}

export type PublishOneTargetDeps = {
  gates: GateVerdict;
  uploader: PlatformUploader;
  /** Max attempts (initial + retries). Default 4. */
  maxAttempts?: number;
  /** Sleep between retries (injectable; tests pass an instant sleep). */
  sleep?: (ms: number) => Promise<void>;
  /** Jitter added to backoff (tests pass 0 for determinism). */
  jitterMs?: number;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Publish one target: enforce gates, then upload with retries.
 * Never calls the uploader when a gate fails.
 */
export async function publishOneTarget(
  input: Omit<UploadInput, "accessToken"> & { accessToken: string },
  deps: PublishOneTargetDeps,
): Promise<TargetPublishResult> {
  if (!deps.gates.ok) {
    return { status: "refused", error: deps.gates.reason, attempts: 0 };
  }
  const maxAttempts = deps.maxAttempts ?? 4;
  const sleep = deps.sleep ?? defaultSleep;
  let lastError = "Upload failed.";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await deps.uploader.upload(input);
    if (result.ok) {
      return {
        status: "published",
        providerPostId: result.providerPostId,
        providerUrl: result.providerUrl,
        attempts: attempt + 1,
      };
    }
    lastError = result.message;
    const canRetry =
      result.retryable &&
      isRetryableStatus(result.status) &&
      attempt + 1 < maxAttempts;
    if (!canRetry) {
      return { status: "failed", error: lastError, attempts: attempt + 1 };
    }
    const wait =
      result.retryAfterMs ??
      backoffDelayMs(attempt, 1000, 60_000, deps.jitterMs ?? 0);
    await sleep(wait);
  }
  return { status: "failed", error: lastError, attempts: maxAttempts };
}
