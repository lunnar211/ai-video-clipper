/**
 * TOTP (RFC 6238) for admin MFA (ClipForge Phase 4).
 *
 * Pure functions, no dependencies: base32 encode/decode + HMAC-SHA1
 * time codes. Secrets are stored ENCRYPTED (see lib/publish/tokens.ts
 * envelope encryption) and are never logged. The enrolment flow shows
 * the secret to the enrolling admin exactly once so they can scan it
 * into an authenticator app — that display is the point of setup, not
 * a leak; the secret is never returned again afterwards.
 */

import { createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  while (out.length % 8 !== 0) out += "=";
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A fresh random secret, base32, for enrolment. */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

/** The 6-digit code for one time step. Counter = floor(unix / 30). */
export function totpCodeAt(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * Verify a user-supplied code, accepting ±1 time step of clock skew.
 * Comparison is exact-match on fixed-length digit strings.
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  nowMs = Date.now(),
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
  return (
    totpCodeAt(secret, counter - 1) === code ||
    totpCodeAt(secret, counter) === code ||
    totpCodeAt(secret, counter + 1) === code
  );
}

/** otpauth:// URL for authenticator apps (shown once at enrolment). */
export function totpOtpauthUrl(
  secret: string,
  account: string,
  issuer: string,
): string {
  const label = `${issuer}:${account}`;
  return (
    `otpauth://totp/${encodeURIComponent(label)}` +
    `?secret=${secret}&issuer=${encodeURIComponent(issuer)}` +
    `&algorithm=SHA1&digits=6&period=30`
  );
}
