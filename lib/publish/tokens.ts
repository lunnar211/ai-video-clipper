/**
 * Token encryption (ClipForge Phase 3).
 *
 * OAuth tokens are encrypted at rest with envelope encryption:
 * - The encryption interface (`TokenCrypto`) is provider-agnostic.
 * - The shipped adapter uses AES-256-GCM with a server-side key from
 *   PUBLISH_TOKEN_KEY (base64, 32 bytes). The record carries a key id
 *   so keys can rotate: decrypt with the old key, encrypt with the new.
 * - Production hardening (a later slice, not this one): move the key
 *   into a KMS (Google Cloud KMS / AWS KMS) and have the adapter call
 *   it instead of reading an env var. The interface does not change.
 *
 * NEVER log a plaintext token, a ciphertext, or a key. These helpers
 * log nothing. Callers must not log tokens either.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedToken = {
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
  keyId: string;
};

export type TokenCrypto = {
  keyId: string;
  encrypt(plaintext: string): EncryptedToken;
  decrypt(record: EncryptedToken): string;
};

/** Parse a base64 32-byte key, or null when missing/invalid. */
export function parseTokenKey(raw: string | null | undefined): Buffer | null {
  if (!raw) return null;
  try {
    const key = Buffer.from(raw.trim(), "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

/** Env-key AES-GCM adapter, or null when PUBLISH_TOKEN_KEY is absent. */
export function createEnvTokenCrypto(
  env: NodeJS.ProcessEnv = process.env,
): TokenCrypto | null {
  const key = parseTokenKey(env.PUBLISH_TOKEN_KEY);
  if (!key) return null;
  const keyId = env.PUBLISH_TOKEN_KEY_ID?.trim() || "env-v1";
  return {
    keyId,
    encrypt(plaintext: string): EncryptedToken {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      return {
        ciphertextB64: ciphertext.toString("base64"),
        ivB64: iv.toString("base64"),
        authTagB64: cipher.getAuthTag().toString("base64"),
        keyId,
      };
    },
    decrypt(record: EncryptedToken): string {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(record.ivB64, "base64"),
      );
      decipher.setAuthTag(Buffer.from(record.authTagB64, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(record.ciphertextB64, "base64")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}

/** Re-encrypt a record under a new key (rotation). */
export function rotateEncryptedToken(
  record: EncryptedToken,
  oldCrypto: TokenCrypto,
  newCrypto: TokenCrypto,
): EncryptedToken {
  return newCrypto.encrypt(oldCrypto.decrypt(record));
}

/** True when the token is expired or expires within the skew window. */
export function tokenNeedsRefresh(
  expiresAt: string | null,
  now = Date.now(),
  skewMs = 60_000,
): boolean {
  if (!expiresAt) return false;
  const exp = Date.parse(expiresAt);
  if (Number.isNaN(exp)) return true;
  return exp - now <= skewMs;
}
