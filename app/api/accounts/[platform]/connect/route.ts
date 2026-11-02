import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  PLATFORMS,
  PLATFORM_IDS,
  platformStatus,
  type PlatformId,
} from "@/lib/publish/platforms";
import {
  buildAuthUrl,
  createPkcePair,
  resolveOAuthConfig,
} from "@/lib/publish/oauth";

export const runtime = "nodejs";

function isPlatform(value: string): value is PlatformId {
  return (PLATFORM_IDS as readonly string[]).includes(value);
}

function cookieHeader(
  name: string,
  value: string,
  req: Request,
): string {
  const secure =
    new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return (
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; ` +
    `SameSite=Lax; Max-Age=600${secure}`
  );
}

/**
 * Start an OAuth connect flow (ClipForge Phase 3).
 *
 * Returns the provider authorization URL; the UI navigates to it.
 * Without OAuth credentials, 503 with the setup reason. When the
 * platform flag is off, the response says so instead of an auth URL.
 * State (+ PKCE verifier for X) is stored in short-lived httpOnly
 * cookies and verified by the callback route.
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
    return NextResponse.json(
      { error: `Unknown platform: ${platform}.` },
      { status: 400 },
    );
  }
  const config = resolveOAuthConfig(platform);
  if (!config) {
    return NextResponse.json(
      {
        error:
          `${PLATFORMS[platform].label} OAuth is not configured yet — ` +
          `set the ${platform.toUpperCase()}_CLIENT_ID and ` +
          `${platform.toUpperCase()}_CLIENT_SECRET env vars, then retry.`,
      },
      { status: 503 },
    );
  }
  const status = platformStatus(platform);
  if (status === "disabled") {
    return NextResponse.json({
      platform,
      status,
      authUrl: null,
      reason:
        `${PLATFORMS[platform].label} publishing is not enabled. ` +
        `Set ${PLATFORMS[platform].flagEnv}=true to enable it.`,
    });
  }
  const state = randomBytes(16).toString("hex");
  const pkce = platform === "x" ? createPkcePair() : null;
  const authUrl = buildAuthUrl(platform, config, state, {
    codeChallenge: pkce?.challenge,
  });
  const res = NextResponse.json({ platform, status, authUrl });
  res.headers.append(
    "Set-Cookie",
    cookieHeader("publish_oauth_state", state, req),
  );
  res.headers.append(
    "Set-Cookie",
    cookieHeader("publish_oauth_platform", platform, req),
  );
  if (pkce) {
    res.headers.append(
      "Set-Cookie",
      cookieHeader("publish_oauth_verifier", pkce.verifier, req),
    );
  }
  return res;
}
