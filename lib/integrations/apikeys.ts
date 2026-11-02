/**
 * Public API keys (ClipForge Phase 5).
 *
 * Keys are `cf_` + 24 random alphanumeric characters. Only the
 * SHA-256 hash is stored (clipper_api_keys.key_hash); the secret is
 * shown ONCE at creation and never returned again — list responses
 * carry only the prefix, scopes, revocation, and last-used time.
 * Verification is timing-safe over the hash, and revoked keys never
 * verify. Per-key rate limits reuse the in-memory limiter pattern
 * (lib/rate-limit): default 120 requests/minute per key, overridable
 * with INTEGRATION_API_KEY_RATE_LIMIT.
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export const API_KEY_PREFIX = "cf_";

export const API_KEY_SCOPES = ["read", "write", "admin"] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** Per-key rate limit in requests/minute (default 120). */
export function apiKeyRateLimitPerMinute(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number.parseInt(env.INTEGRATION_API_KEY_RATE_LIMIT ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 120;
}

/** Generate a new key secret (never stored; shown once at creation). */
export function generateApiKeySecret(
  random: (size: number) => Buffer = randomBytes,
): string {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = random(24);
  let secret = API_KEY_PREFIX;
  for (const byte of bytes) {
    secret += alphabet[byte % alphabet.length];
  }
  return secret;
}

/** Public prefix shown in the console: "cf_" + first 8 secret chars. */
export function apiKeyPrefixFor(secret: string): string {
  return `${API_KEY_PREFIX}${secret.slice(API_KEY_PREFIX.length, API_KEY_PREFIX.length + 8)}`;
}

/** SHA-256 hex hash of a key secret (the only stored form). */
export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Timing-safe hash comparison (length-mismatched candidates fail closed). */
export function apiKeyHashMatches(
  candidateSecret: string,
  storedHash: string,
): boolean {
  const candidate = hashApiKeySecret(candidateSecret);
  if (candidate.length !== storedHash.length) return false;
  try {
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(storedHash));
  } catch {
    return false;
  }
}

/** Scope hierarchy: admin implies write implies read. */
export function scopeSatisfies(
  granted: ApiKeyScope[],
  required: ApiKeyScope,
): boolean {
  if (granted.includes("admin")) return true;
  if (required === "read") return granted.includes("read") || granted.includes("write");
  if (required === "write") return granted.includes("write");
  return false;
}

/** Extract a key secret from `Authorization: Bearer <key>` or X-ClipForge-Key. */
export function extractApiKeySecret(req: Request): string | null {
  const bearer = req.headers.get("authorization");
  if (bearer && bearer.toLowerCase().startsWith("bearer ")) {
    const token = bearer.slice(7).trim();
    if (token) return token;
  }
  const headerKey = req.headers.get("x-clipforge-key");
  if (headerKey && headerKey.trim()) return headerKey.trim();
  return null;
}
