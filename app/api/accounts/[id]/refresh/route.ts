import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  resolveOAuthConfig,
  refreshAccessToken,
} from "@/lib/publish/oauth";
import { createEnvTokenCrypto } from "@/lib/publish/tokens";
import {
  resolvePublishDb,
  getAccountRow,
  updateAccountTokens,
  toPublicAccount,
} from "@/lib/publish/store";

export const runtime = "nodejs";

/**
 * Refresh a connected account's tokens (ClipForge Phase 3).
 *
 * Decrypts the stored refresh token, exchanges it, and stores the
 * new encrypted tokens. The response carries the status-only account
 * view — never tokens. Without a refresh token, 400; without OAuth
 * config or the token key, 503.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const { id } = await params;
  const db = resolvePublishDb();
  if (!db) {
    return NextResponse.json(
      { error: "Publishing needs database setup." },
      { status: 503 },
    );
  }
  const row = await getAccountRow(db, id);
  if (!row) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 },
    );
  }
  if (!row.refresh_token_enc) {
    return NextResponse.json(
      { error: "This account has no refresh token to refresh with." },
      { status: 400 },
    );
  }
  const config = resolveOAuthConfig(row.platform);
  if (!config) {
    return NextResponse.json(
      { error: "OAuth is not configured for this platform." },
      { status: 503 },
    );
  }
  const crypto = createEnvTokenCrypto();
  if (!crypto) {
    return NextResponse.json(
      { error: "Token encryption is not configured." },
      { status: 503 },
    );
  }
  let tokens;
  try {
    const refreshToken = crypto.decrypt(row.refresh_token_enc);
    tokens = await refreshAccessToken(row.platform, config, refreshToken);
  } catch {
    return NextResponse.json(
      { error: "Token refresh failed at the provider." },
      { status: 502 },
    );
  }
  const expiresAt = tokens.expiresInSec
    ? new Date(Date.now() + tokens.expiresInSec * 1000).toISOString()
    : row.token_expires_at;
  await updateAccountTokens(db, id, {
    access_token_enc: crypto.encrypt(tokens.accessToken),
    refresh_token_enc: tokens.refreshToken
      ? crypto.encrypt(tokens.refreshToken)
      : row.refresh_token_enc,
    token_expires_at: expiresAt,
    token_key_id: crypto.keyId,
  });
  const updated = await getAccountRow(db, id);
  return NextResponse.json({
    refreshed: true,
    account: updated ? toPublicAccount(updated) : null,
  });
}
