import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  resolveOAuthConfig,
  revokeToken,
} from "@/lib/publish/oauth";
import { createEnvTokenCrypto } from "@/lib/publish/tokens";
import { scheduleAudit } from "@/lib/admin/audit";
import {
  resolvePublishDb,
  getAccountRow,
  deleteAccountRow,
} from "@/lib/publish/store";

export const runtime = "nodejs";

/**
 * Disconnect a social account (ClipForge Phase 3).
 *
 * Revokes the token at the provider (best-effort — a failed revoke
 * never blocks the disconnect) and then deletes the stored row, so
 * no token material remains. Without a database, 503 honestly.
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
  let revoked = false;
  const config = resolveOAuthConfig(row.platform);
  const crypto = createEnvTokenCrypto();
  if (config && crypto) {
    try {
      const accessToken = crypto.decrypt(row.access_token_enc);
      revoked = await revokeToken(row.platform, config, accessToken);
    } catch {
      revoked = false;
    }
  }
  await deleteAccountRow(db, id);
  // Audit only: the deleted row's tokens are never logged.
  scheduleAudit({
    actor: "guest",
    action: "account.unlinked",
    target: id,
    metadata: { platform: row.platform, revoked },
    ip: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ disconnected: true, revoked });
}
