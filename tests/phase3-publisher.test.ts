import { describe, it, expect, vi } from "vitest";
import {
  idempotencyKeyFor,
  backoffDelayMs,
  isRetryableStatus,
  parseRetryAfter,
  publishOneTarget,
  type PlatformUploader,
} from "@/lib/publish/publisher";
import { stubUploader } from "@/lib/publish/adapters/stubs";

const input = {
  accessToken: "tok",
  title: "T",
  description: "D",
  tags: [],
  visibility: "unlisted",
  mediaBytes: new Uint8Array([1, 2, 3]),
};

describe("publisher primitives", () => {
  it("idempotency keys are deterministic per post+platform+account", () => {
    expect(idempotencyKeyFor("p", "youtube", "a")).toBe(
      idempotencyKeyFor("p", "youtube", "a"),
    );
    expect(idempotencyKeyFor("p", "youtube", "a")).not.toBe(
      idempotencyKeyFor("p", "youtube", "b"),
    );
  });
  it("backoff doubles and caps; retryable statuses are 429/5xx", () => {
    expect(backoffDelayMs(0, 1000, 60_000, 0)).toBe(1000);
    expect(backoffDelayMs(2, 1000, 60_000, 0)).toBe(4000);
    expect(backoffDelayMs(10, 1000, 60_000, 0)).toBe(60_000);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(undefined)).toBe(false);
    expect(parseRetryAfter("5")).toBe(5000);
    expect(parseRetryAfter("junk")).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });
});

describe("publishOneTarget gates + retries", () => {
  it("refuses without calling the uploader when a gate fails", async () => {
    const upload = vi.fn();
    const res = await publishOneTarget(input, {
      gates: { ok: false, reason: "Checklist incomplete." },
      uploader: { upload } as PlatformUploader,
    });
    expect(res.status).toBe("refused");
    expect(res.attempts).toBe(0);
    expect(upload).not.toHaveBeenCalled();
  });
  it("retries on 429 honoring Retry-After, then succeeds", async () => {
    const sleeps: number[] = [];
    const upload = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        code: "UPLOAD_FAILED",
        message: "rate limited",
        status: 429,
        retryable: true,
        retryAfterMs: 2000,
      })
      .mockResolvedValueOnce({
        ok: true,
        providerPostId: "vid-1",
        providerUrl: "https://www.youtube.com/shorts/vid-1",
      });
    const res = await publishOneTarget(input, {
      gates: { ok: true },
      uploader: { upload },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(res.status).toBe("published");
    expect(res.providerPostId).toBe("vid-1");
    expect(res.attempts).toBe(2);
    expect(sleeps).toEqual([2000]);
  });
  it("fails fast on non-retryable 400 and stops after max attempts on 500", async () => {
    const bad = await publishOneTarget(input, {
      gates: { ok: true },
      uploader: {
        upload: async () => ({
          ok: false as const,
          code: "UPLOAD_FAILED",
          message: "bad request",
          status: 400,
          retryable: false,
        }),
      },
      sleep: async () => {},
    });
    expect(bad.status).toBe("failed");
    expect(bad.attempts).toBe(1);
    let calls = 0;
    const flaky = await publishOneTarget(input, {
      gates: { ok: true },
      uploader: {
        upload: async () => {
          calls += 1;
          return {
            ok: false as const,
            code: "UPLOAD_FAILED",
            message: "server error",
            status: 500,
            retryable: true,
          };
        },
      },
      maxAttempts: 3,
      sleep: async () => {},
      jitterMs: 0,
    });
    expect(flaky.status).toBe("failed");
    expect(calls).toBe(3);
  });
  it("stub platforms never produce a fake post id", async () => {
    const res = await publishOneTarget(input, {
      gates: { ok: true },
      uploader: stubUploader("tiktok"),
      sleep: async () => {},
    });
    expect(res.status).toBe("failed");
    expect(res.providerPostId).toBeUndefined();
    expect(res.error).toMatch(/not implemented yet/);
  });
});
