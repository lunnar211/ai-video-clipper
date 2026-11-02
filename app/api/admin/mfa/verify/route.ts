import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { adminIdentity } from "@/lib/admin/guard";
import { ACTION_ROLES } from "@/lib/admin/roles";
import { resolveAdminDb } from "@/lib/admin/store";
import { getMfaRow, setMfaVerified } from "@/lib/admin/store";
import { verifyTotpCode } from "@/lib/admin/totp";
import { createEnvTokenCrypto, parseTokenKey } from "@/lib/publish/tokens";
import { emitAuditSafe } from "@/lib/admin/audit";
import {
  createMfaMarker,
  MFA_MARKER_COOKIE,
  MFA_MARKER_TTL_MS,
} from "@/lib/admin/session";

const VerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

/**
 * POST /api/admin/mfa/verify — verify a TOTP code and start a verified
 * MFA session (12-hour marker cookie). Uses the identity-only gate:
 * verification is what creates the verified session, so it cannot
 * require one. Wrong codes return 401 without revealing state.
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
  const parsed = VerifySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid code" },
      { status: 400 },
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
    const row = await getMfaRow(db, session.userId);
    if (!row) {
      return NextResponse.json(
        { error: "MFA is not set up yet. Enrol first." },
        { status: 400 },
      );
    }
    let secret: string;
    try {
      secret = crypto.decrypt(row.secret_enc);
    } catch {
      return NextResponse.json(
        { error: "MFA is not configured yet (key mismatch)." },
        { status: 503 },
      );
    }
    if (!verifyTotpCode(secret, parsed.data.code)) {
      return NextResponse.json(
        { error: "That code is not valid. Try the current code." },
        { status: 401 },
      );
    }
    await setMfaVerified(db, session.userId);
    await emitAuditSafe({
      actor: session.userId,
      action: "admin.mfa_verify",
      target: session.userId,
      metadata: null,
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    const markerKey = parseTokenKey(process.env.PUBLISH_TOKEN_KEY);
    if (!markerKey) {
      return NextResponse.json(
        { error: "MFA is not configured yet (token key missing)." },
        { status: 503 },
      );
    }
    const res = NextResponse.json({ verified: true });
    res.cookies.set(
      MFA_MARKER_COOKIE,
      createMfaMarker(session.userId, markerKey),
      {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(MFA_MARKER_TTL_MS / 1000),
    });
    return res;
  } catch {
    return NextResponse.json(
      { error: "MFA verification failed. Check the admin database configuration." },
      { status: 500 },
    );
  }
}
