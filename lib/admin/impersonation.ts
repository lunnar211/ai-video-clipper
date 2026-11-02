/**
 * View-only impersonation ("view as") (ClipForge Phase 4).
 *
 * An admin (owner/admin) may start a view-as session for a target
 * user with a MANDATORY reason. The session is a signed marker cookie:
 * it proves an admin started viewing, carries no tokens, and grants
 * NO write power. Write routes (publish post creation, billing
 * checkout) refuse any request carrying a valid view-as marker.
 * Start and end are both audit-logged. The marker expires quickly
 * and the admin console shows a banner while it is active.
 *
 * Honest scope: view-as means the console renders the target user's
 * drill-down data with the banner on. It is NOT a full session
 * takeover — the admin never becomes the user, never sees the user's
 * tokens, and can never publish or bill as them.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { parseTokenKey } from "@/lib/publish/tokens";

export const VIEW_AS_COOKIE = "clipforge_view_as";
export const VIEW_AS_TTL_MS = 2 * 60 * 60 * 1000;

export const viewAsStartSchema = z.object({
  targetUserId: z.string().min(1).max(200),
  reason: z.string().min(10).max(500),
});

export type ViewAsMarker = {
  adminId: string;
  targetUserId: string;
  reason: string;
  expiresAt: number;
};

function markerKey(): Buffer | null {
  return parseTokenKey(process.env.PUBLISH_TOKEN_KEY);
}

export function createViewAsMarker(
  marker: Omit<ViewAsMarker, "expiresAt">,
  key: Buffer,
  nowMs = Date.now(),
): string {
  const payload = JSON.stringify({ ...marker, expiresAt: nowMs + VIEW_AS_TTL_MS });
  const sig = createHmac("sha256", key).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyViewAsMarker(
  value: string,
  key: Buffer,
  nowMs = Date.now(),
): ViewAsMarker | null {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const dot = decoded.lastIndexOf(".");
    if (dot === -1) return null;
    const payload = decoded.slice(0, dot);
    const sig = decoded.slice(dot + 1);
    const expected = createHmac("sha256", key).update(payload).digest("hex");
    if (sig.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
    const parsed = JSON.parse(payload) as ViewAsMarker;
    if (
      typeof parsed.adminId !== "string" ||
      typeof parsed.targetUserId !== "string" ||
      typeof parsed.reason !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt < nowMs
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readCookie(name: string, cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * Parse a valid view-as marker from a request's Cookie header, or
 * null. Routes use this to refuse writes during view-as sessions.
 * `key` overrides the env key (tests); otherwise PUBLISH_TOKEN_KEY.
 */
export function getViewAsMarker(req: Request, key?: Buffer): ViewAsMarker | null {
  const cryptoKey = key ?? markerKey();
  if (!cryptoKey) return null;
  const raw = readCookie(VIEW_AS_COOKIE, req.headers.get("cookie"));
  if (!raw) return null;
  return verifyViewAsMarker(raw, cryptoKey);
}

/** True when the request carries a valid view-as session. */
export function isViewAsRequest(req: Request, key?: Buffer): boolean {
  return getViewAsMarker(req, key) !== null;
}
