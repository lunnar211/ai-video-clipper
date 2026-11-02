import { describe, it, expect, vi } from "vitest";
import {
  parseAcrCloudResponse,
  acrCloudSignature,
  AcrCloudFingerprintProvider,
  AuddFingerprintProvider,
  NOT_SCANNED,
} from "@/lib/rights/fingerprint";

describe("ACRCloud adapter (documented shape, mocked network)", () => {
  it("parses a match and a no-match body", () => {
    const match = parseAcrCloudResponse({
      status: { code: 0, msg: "Success" },
      metadata: {
        music: [
          {
            title: "Test Song",
            artists: [{ name: "Singer" }],
            album: { name: "Album" },
            label: "Label",
          },
        ],
      },
    });
    expect(match.detected).toBe(true);
    expect(match.match?.title).toBe("Test Song");
    expect(match.match?.artist).toBe("Singer");
    expect(parseAcrCloudResponse({ status: { code: 0 }, metadata: {} }).detected).toBe(false);
  });
  it("throws on a non-zero status code (never a silent pass)", () => {
    expect(() =>
      parseAcrCloudResponse({ status: { code: 3001, msg: "No result" } }),
    ).toThrow(/ACRCloud error 3001/);
  });
  it("builds a deterministic HMAC-SHA1 signature", () => {
    const sig = acrCloudSignature("secret", {
      method: "POST",
      uri: "/v1/identify",
      accessKey: "key",
      dataType: "audio",
      signatureVersion: "1",
      timestamp: "1700000000",
    });
    expect(sig).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(
      acrCloudSignature("secret", {
        method: "POST",
        uri: "/v1/identify",
        accessKey: "key",
        dataType: "audio",
        signatureVersion: "1",
        timestamp: "1700000000",
      }),
    ).toBe(sig);
  });
  it("returns a scanned result through the mocked provider", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: { code: 0, msg: "Success" },
        metadata: { music: [{ title: "T", artists: [{ name: "A" }] }] },
      }),
    })) as unknown as typeof fetch;
    const provider = new AcrCloudFingerprintProvider("key", "secret", "identify-eu-west-1.acrcloud.com", fetchImpl);
    const result = await provider.scan(new Blob(["x"]), "sample.wav");
    expect(result.scanned).toBe(true);
    expect(result.provider).toBe("acrcloud");
    expect(result.detected).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("surfaces provider HTTP failures as errors, not clean results", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const provider = new AcrCloudFingerprintProvider("key", "secret", "h", fetchImpl);
    await expect(provider.scan(new Blob(["x"]), "sample.wav")).rejects.toThrow(/HTTP 401/);
  });
});

describe("provider selection honesty", () => {
  it("reports not-scanned when no provider is configured", async () => {
    // Hermetic: blank the keys even if the shell happens to carry them.
    vi.stubEnv("AUDD_API_TOKEN", "");
    vi.stubEnv("ACRCLOUD_ACCESS_KEY", "");
    vi.stubEnv("ACRCLOUD_ACCESS_SECRET", "");
    try {
      const provider = new AuddFingerprintProvider(() => {
        throw new Error("must not be called without a key");
      });
      const result = await provider.scan(new Blob(["x"]), "sample.wav");
      expect(result).toEqual(NOT_SCANNED);
      expect(result.scanned).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
