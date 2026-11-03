import { describe, it, expect } from "vitest";
import {
  presignR2,
  parseUploadId,
  buildCompleteXml,
  resolveR2Config,
} from "@/lib/storage/r2";
import { isPrivateIp, hostAllowed } from "@/lib/imports/ssrf";
import {
  buildAttribution,
  ccImportSchema,
} from "@/lib/imports/index";
import { CC_VERIFY_HOSTS } from "@/lib/imports/cc-verify";
import { enqueueJob } from "@/lib/queue/index";
import {
  signWorkerRequest,
  resolveWorker,
  renderJobRequestSchema,
} from "@/lib/server-render/contract";
import { newShareToken } from "@/lib/share";

const fakeR2 = {
  accountId: "testaccount",
  accessKeyId: "testkey",
  secretAccessKey: "testsecret",
  bucket: "testbucket",
};

describe("R2 presigning", () => {
  it("builds a SigV4 presigned URL with all required params", async () => {
    const url = await presignR2(fakeR2, "PUT", "uploads/a/video.mp4", {
      now: new Date("2026-11-02T00:00:00Z"),
      uploadId: "up1",
      partNumber: 2,
    });
    expect(url).toContain("https://testaccount.r2.cloudflarestorage.com/testbucket/uploads/a/video.mp4?");
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Credential=testkey%2F20261102");
    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("uploadId=up1");
    expect(url).toContain("partNumber=2");
  });
  it("parses UploadId XML and builds complete XML with quoted ETags", () => {
    expect(
      parseUploadId("<Init><UploadId>abc-123</UploadId></Init>"),
    ).toBe("abc-123");
    expect(parseUploadId("<Init></Init>")).toBeNull();
    const xml = buildCompleteXml([
      { partNumber: 2, etag: "bbb" },
      { partNumber: 1, etag: '"aaa"' },
    ]);
    expect(xml).toContain("<PartNumber>1</PartNumber>");
    // ETag quotes are literal in XML content (S3 expects "aaa", not &quot;).
    expect(xml).toContain('<ETag>"aaa"</ETag>');
    expect(xml).toContain('<ETag>"bbb"</ETag>');
    expect(xml.indexOf("<PartNumber>1")).toBeLessThan(
      xml.indexOf("<PartNumber>2"),
    );
  });
  it("resolves null without R2 env", () => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET;
    expect(resolveR2Config()).toBeNull();
  });
});

describe("SSRF guard", () => {
  it("flags private ranges", () => {
    expect(isPrivateIp("10.0.0.5")).toBe(true);
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("169.254.10.20")).toBe(true);
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("93.184.216.34")).toBe(false);
  });
  it("matches wildcard hosts", () => {
    expect(hostAllowed("commons.wikimedia.org", CC_VERIFY_HOSTS)).toBe(true);
    expect(hostAllowed("upload.wikimedia.org", CC_VERIFY_HOSTS)).toBe(true);
    expect(hostAllowed("evil-wikimedia.org", CC_VERIFY_HOSTS)).toBe(false);
    expect(hostAllowed("archive.org", CC_VERIFY_HOSTS)).toBe(true);
  });
});

describe("imports", () => {
  it("builds CC attribution text", () => {
    const a = buildAttribution(
      "Sunset",
      "Jane Doe",
      "CC-BY",
      "https://upload.wikimedia.org/x",
    );
    expect(a).toContain('"Sunset" by Jane Doe is licensed under CC-BY');
    expect(a).toContain("Source: https://upload.wikimedia.org/x");
  });
  it("rejects unknown licences", () => {
    const r = ccImportSchema.safeParse({
      source: "cc-licensed",
      url: "https://upload.wikimedia.org/x",
      license: "CC-NC",
      author: "Jane",
    });
    expect(r.success).toBe(false);
  });
});

describe("queue + worker contract", () => {
  it("queue reports not-configured without Inngest keys", async () => {
    delete process.env.INNGEST_EVENT_KEY;
    const r = await enqueueJob({ type: "render", payload: {} });
    expect(r).toEqual({
      queued: false,
      reason: expect.stringContaining("not configured"),
    });
  });
  it("worker signatures are deterministic hex", async () => {
    const a = await signWorkerRequest('{"jobId":"x"}', "secret");
    const b = await signWorkerRequest('{"jobId":"x"}', "secret");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    const c = await signWorkerRequest('{"jobId":"y"}', "secret");
    expect(c).not.toBe(a);
  });
  it("worker resolves null without config", () => {
    delete process.env.WORKER_URL;
    delete process.env.WORKER_AUTH_SECRET;
    expect(resolveWorker()).toBeNull();
  });
  it("render job schema rejects bad crop modes", () => {
    const r = renderJobRequestSchema.safeParse({
      jobId: "not-a-uuid",
      sourceKey: "k",
      clip: { start: 0, end: 10 },
      crop: { mode: "diagonal" },
      captions: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("share tokens", () => {
  it("generates 24-char hex tokens", () => {
    expect(newShareToken()).toMatch(/^[0-9a-f]{24}$/);
    expect(newShareToken()).not.toBe(newShareToken());
  });
});
