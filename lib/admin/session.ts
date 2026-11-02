/**
 * Admin session resolution (ClipForge Phase 4).
 *
 * Resolves the signed-in admin from the Supabase session + the
 * clipper_users row (role, status), plus MFA state: whether the admin
 * has enrolled TOTP, and whether this session carries a verified MFA
 * marker cookie. Never throws for a missing session or database —
 * callers map null to honest 401/503 responses.
 *
 * MFA marker: HMAC-SHA256 over `userId.expiry`, keyed by the same
 * server key as publish-token encryption (PUBLISH_TOKEN_KEY). The
 * marker proves a TOTP code was verified recently; it carries no
 * secret material. Without PUBLISH_TOKEN_KEY, MFA is unavailable and
 * owner/admin console access honestly reports setup needed.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { parseTokenKey } from "@/lib/publish/tokens";
import type { AdminRole } from "./roles";
import { mfaRequiredFor } from "./roles";

export const MFA_MARKER_COOKIE = "clipforge_admin_mfa";
export const MFA_MARKER_TTL_MS = 12 * 60 * 60 * 1000;

/** Issuer shown in authenticator apps (default "ClipForge"). */
export function mfaIssuer(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.ADMIN_MFA_ISSUER?.trim() || "ClipForge";
}

export type AdminSession = {
  userId: string;
  email: string | null;
  role: AdminRole;
  status: string;
  publishingPaused: boolean;
  mfaEnrolled: boolean;
  mfaVerified: boolean;
};

export function createMfaMarker(
  userId: string,
  key: Buffer,
  nowMs = Date.now(),
): string {
  const expiry = nowMs + MFA_MARKER_TTL_MS;
  const payload = `${userId}.${expiry}`;
  const sig = createHmac("sha256", key).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyMfaMarker(
  value: string,
  key: Buffer,
  nowMs = Date.now(),
): string | null {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 3) return null;
    const [userId, expiryRaw, sig] = parts;
    const expiry = Number.parseInt(expiryRaw, 10);
    if (!Number.isFinite(expiry) || expiry < nowMs) return null;
    const expected = createHmac("sha256", key)
      .update(`${userId}.${expiry}`)
      .digest("hex");
    if (sig.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
    return userId;
  } catch {
    return null;
  }
}

function readCookieHeader(name: string, cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export type SessionRequirement =
  | { ok: true; session: AdminSession }
  | {
      ok: false;
      status: 401 | 403 | 503;
      error: string;
      mfaSetupRequired?: boolean;
    };

/**
 * Resolve the admin session for a route. `cookieHeader` lets routes
 * pass the request's Cookie header (test-friendly); when omitted the
 * server cookie store is consulted instead.
 */
export async function getAdminSession(
  cookieHeader?: string | null,
): Promise<AdminSession | null> {
  let client;
  try {
    client = await createSupabaseServerClient();
  } catch {
    return null;
  }
  if (!client) return null;
  let user;
  try {
    const res = await client.auth.getUser();
    user = res.data.user;
  } catch {
    return null;
  }
  if (!user) return null;
  type UserRow = {
    role?: string;
    status?: string;
    publishing_paused?: boolean;
  };
  let row: UserRow | null = null;
  try {
    const res = await client
      .from("clipper_users")
      .select("role,status,publishing_paused")
      .eq("id", user.id)
      .single();
    row = res.data as unknown as UserRow | null;
  } catch {
    return null;
  }
  if (!row) return null;
  const key = parseTokenKey(process.env.PUBLISH_TOKEN_KEY);
  let mfaVerified = false;
  if (key) {
    try {
      let marker: string | null = null;
      if (cookieHeader !== undefined) {
        marker = readCookieHeader(MFA_MARKER_COOKIE, cookieHeader);
      } else {
        const { cookies } = await import("next/headers");
        const store = await cookies();
        marker = store.get(MFA_MARKER_COOKIE)?.value ?? null;
      }
      if (marker) mfaVerified = verifyMfaMarker(marker, key) === user.id;
    } catch {
      mfaVerified = false;
    }
  }
  // MFA enrolment state lives in clipper_admin_mfa; a missing table or
  // row simply means "not enrolled" (never an error to the caller).
  let mfaEnrolled = false;
  try {
    const res = await client
      .from("clipper_admin_mfa")
      .select("verified_at")
      .eq("user_id", user.id)
      .single();
    const mfaRow = res.data as unknown as { verified_at?: string | null } | null;
    mfaEnrolled = Boolean(mfaRow?.verified_at);
  } catch {
    mfaEnrolled = false;
  }
  return {
    userId: user.id,
    email: user.email ?? null,
    role: (row.role ?? "user") as AdminRole,
    status: row.status ?? "active",
    publishingPaused: row.publishing_paused ?? false,
    mfaEnrolled,
    mfaVerified,
  };
}

/**
 * Enforce console access: signed-in + allowed role + (for owner/admin)
 * a verified MFA session. Returns a verdict routes map to responses.
 * MFA infra missing while the role requires it → 503 setup-needed.
 */
export async function requireAdminSession(
  allowedRoles: AdminRole[],
  cookieHeader?: string | null,
): Promise<SessionRequirement> {
  const session = await getAdminSession(cookieHeader);
  if (!session) {
    return {
      ok: false,
      status: 401,
      error: "Sign in with an admin account to use the admin console.",
    };
  }
  if (session.status === "suspended") {
    return { ok: false, status: 403, error: "This account is suspended." };
  }
  if (!allowedRoles.includes(session.role)) {
    return {
      ok: false,
      status: 403,
      error: "This role cannot use the admin console.",
    };
  }
  if (mfaRequiredFor(session.role)) {
    const key = parseTokenKey(process.env.PUBLISH_TOKEN_KEY);
    if (!key) {
      return {
        ok: false,
        status: 503,
        error:
          "Admin MFA is not configured yet (server encryption key missing). Set PUBLISH_TOKEN_KEY, then enrol MFA.",
      };
    }
    if (!session.mfaEnrolled) {
      return {
        ok: false,
        status: 403,
        error: "Admin MFA enrolment is required before using the console.",
        mfaSetupRequired: true,
      };
    }
    if (!session.mfaVerified) {
      return {
        ok: false,
        status: 403,
        error: "Verify your authenticator code to continue this admin session.",
        mfaSetupRequired: false,
      };
    }
  }
  return { ok: true, session };
}
