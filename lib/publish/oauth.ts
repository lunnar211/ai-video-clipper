/**
 * OAuth helpers (ClipForge Phase 3).
 *
 * Pure helpers over each platform's OAuth endpoints. They perform real
 * HTTP only when called with real credentials; tests always inject a
 * mocked fetch. Tokens are returned to the caller (which encrypts them
 * immediately) and are NEVER logged here.
 *
 * Per-platform env vars (names only — values live in Vercel):
 *   <PREFIX>_CLIENT_ID, <PREFIX>_CLIENT_SECRET, and optionally
 *   <PREFIX>_REDIRECT_URI. Without them the platform reports "setup
 *   needed" and connect is refused honestly.
 * Prefixes: YOUTUBE, TIKTOK, INSTAGRAM, FACEBOOK, X, LINKEDIN.
 * The redirect URI defaults to
 *   <NEXT_PUBLIC_SITE_URL>/api/accounts/<platform>/callback
 * when no platform-specific redirect env var is set.
 */

import { randomBytes, createHash } from "node:crypto";
import type { FetchImpl } from "@/lib/ai/providers";
import { PLATFORMS, type PlatformId } from "./platforms";

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

const PREFIX: Record<PlatformId, string> = {
  youtube: "YOUTUBE",
  tiktok: "TIKTOK",
  instagram: "INSTAGRAM",
  facebook: "FACEBOOK",
  x: "X",
  linkedin: "LINKEDIN",
};

/** Resolve a platform's OAuth config, or null when not configured. */
export function resolveOAuthConfig(
  platform: PlatformId,
  env: NodeJS.ProcessEnv = process.env,
): OAuthConfig | null {
  const prefix = PREFIX[platform];
  // NOTE: read from the passed env, not process.env, so tests can
  // inject config without mutating the process environment.
  const read = (name: string): string | null => {
    const value = env[name];
    return value && value.trim().length > 0 ? value.trim() : null;
  };
  const clientId = read(`${prefix}_CLIENT_ID`);
  const clientSecret = read(`${prefix}_CLIENT_SECRET`);
  if (!clientId || !clientSecret) return null;
  const site = (env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const redirectUri =
    read(`${prefix}_REDIRECT_URI`) ??
    (site ? `${site}/api/accounts/${platform}/callback` : "");
  if (!redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

/** PKCE pair (S256) for platforms that require it (X). */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

/** Build the provider authorization URL for a connect flow. */
export function buildAuthUrl(
  platform: PlatformId,
  config: OAuthConfig,
  state: string,
  opts: { codeChallenge?: string } = {},
): string {
  const def = PLATFORMS[platform];
  const url = new URL(def.authUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", def.scopes.join(" "));
  url.searchParams.set("state", state);
  if (platform === "youtube") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }
  if (platform === "tiktok") {
    url.searchParams.set("client_key", config.clientId);
  }
  if (platform === "x" && opts.codeChallenge) {
    url.searchParams.set("code_challenge", opts.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresInSec: number | null;
  scope: string | null;
};

async function postForm(
  url: string,
  params: Record<string, string>,
  fetchImpl: FetchImpl,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const body = new URLSearchParams(params);
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

function asTokenSet(json: Record<string, unknown>): TokenSet {
  return {
    accessToken: String(json.access_token ?? ""),
    refreshToken:
      json.refresh_token != null ? String(json.refresh_token) : null,
    expiresInSec:
      json.expires_in != null ? Number(json.expires_in) : null,
    scope: json.scope != null ? String(json.scope) : null,
  };
}

/**
 * Exchange an authorization code for tokens. Throws on provider error
 * (message carries the status only, never tokens).
 */
export async function exchangeCode(
  platform: PlatformId,
  config: OAuthConfig,
  code: string,
  extra: { codeVerifier?: string } = {},
  fetchImpl: FetchImpl = fetch,
): Promise<TokenSet> {
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  };
  if (platform === "tiktok") {
    params.client_key = config.clientId;
  }
  if (extra.codeVerifier) params.code_verifier = extra.codeVerifier;
  const res = await postForm(PLATFORMS[platform].tokenUrl, params, fetchImpl);
  if (!res.ok || typeof res.json !== "object" || res.json === null) {
    throw new Error(
      `${platform} token exchange failed (HTTP ${res.status})`,
    );
  }
  const tokens = asTokenSet(res.json as Record<string, unknown>);
  if (!tokens.accessToken) {
    throw new Error(`${platform} token exchange returned no access token`);
  }
  return tokens;
}

/** Refresh an access token. Throws on provider error. */
export async function refreshAccessToken(
  platform: PlatformId,
  config: OAuthConfig,
  refreshToken: string,
  fetchImpl: FetchImpl = fetch,
): Promise<TokenSet> {
  const params: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  };
  if (platform === "tiktok") {
    params.client_key = config.clientId;
  }
  const res = await postForm(PLATFORMS[platform].tokenUrl, params, fetchImpl);
  if (!res.ok || typeof res.json !== "object" || res.json === null) {
    throw new Error(`${platform} token refresh failed (HTTP ${res.status})`);
  }
  const tokens = asTokenSet(res.json as Record<string, unknown>);
  if (!tokens.accessToken) {
    throw new Error(`${platform} token refresh returned no access token`);
  }
  return tokens;
}

/**
 * Revoke a token at the provider. Best-effort: returns false (never
 * throws) when the provider has no revoke endpoint or the call fails —
 * the caller still deletes the stored row.
 */
export async function revokeToken(
  platform: PlatformId,
  config: OAuthConfig,
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<boolean> {
  const def = PLATFORMS[platform];
  if (!def.revokeUrl) return false;
  try {
    const params: Record<string, string> = { token };
    if (platform === "linkedin") {
      params.client_id = config.clientId;
      params.client_secret = config.clientSecret;
    }
    if (platform === "tiktok") {
      params.client_key = config.clientId;
      params.token = token;
    }
    const res = await postForm(def.revokeUrl, params, fetchImpl);
    return res.ok;
  } catch {
    return false;
  }
}
