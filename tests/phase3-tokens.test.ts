import { describe, it, expect } from "vitest";
import {
  createEnvTokenCrypto,
  parseTokenKey,
  rotateEncryptedToken,
  tokenNeedsRefresh,
} from "@/lib/publish/tokens";

// 32 zero bytes, base64 — a TEST key only, never a real secret.
const TEST_KEY = Buffer.alloc(32).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 7).toString("base64");

describe("token encryption (AES-GCM envelope)", () => {
  it("round-trips and fails closed on tampering or wrong key", () => {
    const crypto = createEnvTokenCrypto({
      PUBLISH_TOKEN_KEY: TEST_KEY,
    } as unknown as NodeJS.ProcessEnv);
    expect(crypto).not.toBeNull();
    const enc = crypto!.encrypt("secret-token-value");
    expect(enc.ciphertextB64).not.toContain("secret-token-value");
    expect(enc.keyId).toBe("env-v1");
    expect(crypto!.decrypt(enc)).toBe("secret-token-value");
    expect(() =>
      crypto!.decrypt({ ...enc, ciphertextB64: "AAAA" }),
    ).toThrow();
    const other = createEnvTokenCrypto({
      PUBLISH_TOKEN_KEY: OTHER_KEY,
    } as unknown as NodeJS.ProcessEnv)!;
    expect(() => other.decrypt(enc)).toThrow();
  });
  it("rotates to a new key id and rejects bad keys", () => {
    const oldC = createEnvTokenCrypto({
      PUBLISH_TOKEN_KEY: TEST_KEY,
    } as unknown as NodeJS.ProcessEnv)!;
    const newC = createEnvTokenCrypto({
      PUBLISH_TOKEN_KEY: OTHER_KEY,
      PUBLISH_TOKEN_KEY_ID: "env-v2",
    } as unknown as NodeJS.ProcessEnv)!;
    const rotated = rotateEncryptedToken(
      oldC.encrypt("tok"),
      oldC,
      newC,
    );
    expect(rotated.keyId).toBe("env-v2");
    expect(newC.decrypt(rotated)).toBe("tok");
    expect(createEnvTokenCrypto({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(parseTokenKey("short")).toBeNull();
    expect(parseTokenKey(Buffer.alloc(16).toString("base64"))).toBeNull();
  });
  it("detects expiry with a skew window", () => {
    const now = Date.parse("2026-11-02T00:00:00Z");
    expect(
      tokenNeedsRefresh("2026-11-02T00:00:30Z", now, 60_000),
    ).toBe(true);
    expect(
      tokenNeedsRefresh("2026-11-02T01:00:00Z", now, 60_000),
    ).toBe(false);
    expect(tokenNeedsRefresh(null, now)).toBe(false);
    expect(tokenNeedsRefresh("not-a-date", now)).toBe(true);
  });
});
