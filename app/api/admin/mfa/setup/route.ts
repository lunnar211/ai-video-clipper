import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { adminIdentity } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import { getMfaRow, upsertMfaRow } from "@/lib/admin/store";
import {
  generateTotpSecret,
  totpOtpauthUrl,
} from "@/lib/admin/totp";
import { createEnvTokenCrypto } from "@/lib/publish/tokens";
import { emitAuditSafe } from "@/lib/admin/audit";
import { mfaIssuer } from "@/lib/admin/session";

/**
 * POST /api/admin/mfa/setup — start TOTP enrolment for an owner/admin.
 * Returns the secret + otpauth URL ONCE (the point of TOTP setup);
 * the secret is stored ENCRYPTED and never returned again. Re-enrolling
 * replaces the previous secret and clears verification. Uses the
 * identity-only gate (setup precedes MFA verification by design).
 * 503 when the database or the token key is not configured.
 */
export async function POST(req: Request) {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429 },
    );
  }
  const { session, errorResponse } = await adminIdentity(req, ACTION_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "The admin database is not configured yet." },
      { status: 503 },
    );
  }
  const crypto = createEnvTokenCrypto();
  if (!crypto) {
    return NextResponse.json(
      { error: "MFA is not configured yet (token key missing)." },
      { status: 503 },
    );
  }
  try {
    const secret = generateTotpSecret();
    const existing = await getMfaRow(db, session.userId);
    await upsertMfaRow(db, {
      user_id: session.userId,
      secret_enc: crypto.encrypt(secret),
      key_id: crypto.keyId,
      verified_at: null,
    });
    await emitAuditSafe({
      actor: session.userId,
      action: "admin.mfa_setup",
      target: session.userId,
      metadata: { re_enrolled: existing !== null },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({
      secret,
      otpauthUrl: totpOtpauthUrl(secret, session.userId, mfaIssuer()),
      note: "Scan this secret into your authenticator app now — it is shown only once.",
    });
  } catch {
    return NextResponse.json(
      { error: "MFA setup failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
