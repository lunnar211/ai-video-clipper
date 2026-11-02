import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  PLATFORMS,
  PLATFORM_IDS,
  type PlatformId,
} from "@/lib/publish/platforms";
import {
  exchangeCode,
  resolveOAuthConfig,
} from "@/lib/publish/oauth";
import { createEnvTokenCrypto } from "@/lib/publish/tokens";
import {
  resolvePublishDb,
  createAccountRow,
  toPublicAccount,
} from "@/lib/publish/store";

export const runtime = "nodejs";

function isPlatform(value: string): value is PlatformId {
  return (PLATFORM_IDS as readonly string[]).includes(value);
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) out[key] = decodeURIComponent(rest.join("="));
  }
  return out;
}

function redirectTo(req: Request, path: string): Response {
  return NextResponse.redirect(new URL(path, new URL(req.url).origin));
}

/**
 * OAuth callback (ClipForge Phase 3).
 *
 * Verifies the state cookie, exchanges the code, encrypts the tokens
 * immediately, and stores ONLY the encrypted record. Any failure
 * redirects to /accounts with an error reason — tokens never appear
 * in responses, logs, or redirect URLs.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> },
): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const { platform } = await params;
  if (!isPlatform(platform)) {
    return redirectTo(req, "/accounts?error=unknown_platform");
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) {
    return redirectTo(
      req,
      `/accounts?error=${encodeURIComponent(`provider_${error}`)}`,
    );
  }
  const cookies = parseCookies(req.headers.get("cookie"));
  if (
    !code ||
    !state ||
    cookies.publish_oauth_state !== state ||
    cookies.publish_oauth_platform !== platform
  ) {
    return redirectTo(req, "/accounts?error=state_mismatch");
  }
  const config = resolveOAuthConfig(platform);
  if (!config) {
    return redirectTo(req, "/accounts?error=oauth_not_configured");
  }
  const crypto = createEnvTokenCrypto();
  if (!crypto) {
    return redirectTo(req, "/accounts?error=token_key_not_configured");
  }
  let tokens;
  try {
    tokens = await exchangeCode(platform, config, code, {
      codeVerifier: cookies.publish_oauth_verifier,
    });
  } catch {
    return redirectTo(req, "/accounts?error=exchange_failed");
  }
  const db = resolvePublishDb();
  if (!db) {
    return redirectTo(req, "/accounts?error=db_not_configured");
  }
  const expiresAt = tokens.expiresInSec
    ? new Date(Date.now() + tokens.expiresInSec * 1000).toISOString()
    : null;
  const row = await createAccountRow(db, {
    user_id: null,
    platform,
    account_label: `${PLATFORMS[platform].label} account`,
    scopes: PLATFORMS[platform].scopes,
    access_token_enc: crypto.encrypt(tokens.accessToken),
    refresh_token_enc: tokens.refreshToken
      ? crypto.encrypt(tokens.refreshToken)
      : null,
    token_expires_at: expiresAt,
    token_key_id: crypto.keyId,
    status: "connected",
  });
  void toPublicAccount(row);
  const res = redirectTo(req, `/accounts?connected=${platform}`);
  res.headers.append(
    "Set-Cookie",
    "publish_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
  );
  res.headers.append(
    "Set-Cookie",
    "publish_oauth_platform=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
  );
  res.headers.append(
    "Set-Cookie",
    "publish_oauth_verifier=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
  );
  return res;
}
