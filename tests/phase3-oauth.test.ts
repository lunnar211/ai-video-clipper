import { describe, it, expect, vi } from "vitest";
import {
  buildAuthUrl,
  createPkcePair,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  resolveOAuthConfig,
  type OAuthConfig,
} from "@/lib/publish/oauth";

const cfg: OAuthConfig = {
  clientId: "cid",
  clientSecret: "csecret",
  redirectUri: "https://example.com/api/accounts/youtube/callback",
};

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("OAuth helpers (mocked HTTP only)", () => {
  it("resolves config only when id + secret + redirect exist", () => {
    const env = {
      YOUTUBE_CLIENT_ID: "id",
      YOUTUBE_CLIENT_SECRET: "sec",
      NEXT_PUBLIC_SITE_URL: "https://example.com",
    } as unknown as NodeJS.ProcessEnv;
    const resolved = resolveOAuthConfig("youtube", env);
    expect(resolved?.redirectUri).toBe(
      "https://example.com/api/accounts/youtube/callback",
    );
    expect(
      resolveOAuthConfig("youtube", {} as NodeJS.ProcessEnv),
    ).toBeNull();
  });
  it("builds auth URLs with minimal scopes + offline access for YouTube", () => {
    const url = new URL(buildAuthUrl("youtube", cfg, "state-1"));
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/youtube.upload",
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("state-1");
    const { verifier, challenge } = createPkcePair();
    const xUrl = new URL(
      buildAuthUrl(
        "x",
        { ...cfg, redirectUri: "https://example.com/x" },
        "s",
        { codeChallenge: challenge },
      ),
    );
    expect(xUrl.searchParams.get("code_challenge")).toBe(challenge);
    expect(xUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(verifier.length).toBeGreaterThan(20);
  });
  it("exchanges, refreshes, and revokes with mocked fetch", async () => {
    const tokenBody = {
      access_token: "at",
      refresh_token: "rt",
      expires_in: 3600,
      scope: "x",
    };
    let sentBody = "";
    const f = vi.fn(async (_url: string, opts: { body?: unknown } = {}) => {
      sentBody = String(opts.body ?? "");
      return {
        ok: true,
        status: 200,
        json: async () => tokenBody,
      };
    });
    const tokens = await exchangeCode(
      "youtube",
      cfg,
      "code-1",
      {},
      f as unknown as typeof fetch,
    );
    expect(tokens.accessToken).toBe("at");
    expect(tokens.refreshToken).toBe("rt");
    const sent = sentBody;
    expect(sent).toContain("grant_type=authorization_code");
    expect(sent).not.toContain("access_token");
    const refreshed = await refreshAccessToken(
      "youtube",
      cfg,
      "rt",
      mockFetch({ access_token: "at2", expires_in: 3600 }),
    );
    expect(refreshed.accessToken).toBe("at2");
    expect(refreshed.refreshToken).toBeNull();
    expect(await revokeToken("youtube", cfg, "at", mockFetch({}))).toBe(
      true,
    );
    // No revoke endpoint → false without any fetch call.
    const noFetch = vi.fn();
    expect(
      await revokeToken(
        "facebook",
        cfg,
        "at",
        noFetch as unknown as typeof fetch,
      ),
    ).toBe(false);
    expect(noFetch).not.toHaveBeenCalled();
    // Provider error → throw (status only, no tokens in message).
    await expect(
      exchangeCode("youtube", cfg, "bad", {}, mockFetch({}, false, 400)),
    ).rejects.toThrow("HTTP 400");
  });
});
