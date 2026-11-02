/**
 * Admin hard gate + login redirect tests (login-build addition).
 *
 * Covers, with the server Supabase client mocked and no live calls:
 * - adminLayoutGate(): the pure verdict the /admin layout applies
 *   BEFORE rendering any console UI (no session -> /signin, signed-in
 *   without a console role or suspended -> /, console role -> allowed).
 * - The Supabase Auth callback: `next` is validated to an internal
 *   path only, so an absolute or protocol-relative `next` can never
 *   bounce a user to another site (the open-redirect hole the old
 *   raw-`next` code had). Sign-in callers pass redirectTo = their own
 *   origin + /auth/callback (window.location.origin in both the
 *   Google button and the email page); the allowlist entry itself
 *   lives in the Supabase dashboard, not in code.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockHolder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/auth/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => mockHolder.current),
}));

import { adminLayoutGate } from "@/lib/admin/guard";
import type { AdminSession } from "@/lib/admin/session";
import { GET as authCallback } from "@/app/auth/callback/route";

function session(
  overrides: Partial<AdminSession>,
): AdminSession {
  return {
    userId: "user-1",
    email: "owner@example.com",
    role: "owner",
    status: "active",
    publishingPaused: false,
    mfaEnrolled: true,
    mfaVerified: true,
    ...overrides,
  };
}

describe("adminLayoutGate", () => {
  it("redirects a visitor with no session to /signin", () => {
    expect(adminLayoutGate(null)).toEqual({
      allowed: false,
      redirectTo: "/signin",
    });
  });

  it("redirects a signed-in user without a console role home", () => {
    expect(adminLayoutGate(session({ role: "user" }))).toEqual({
      allowed: false,
      redirectTo: "/",
    });
  });

  it("redirects a suspended admin home", () => {
    expect(
      adminLayoutGate(session({ role: "owner", status: "suspended" })),
    ).toEqual({ allowed: false, redirectTo: "/" });
  });

  it("allows console roles through (MFA stays an API-route check)", () => {
    for (const role of [
      "owner",
      "admin",
      "support",
      "analyst",
      "viewer",
    ] as const) {
      expect(adminLayoutGate(session({ role }))).toEqual({
        allowed: true,
        redirectTo: null,
      });
    }
  });
});

describe("auth callback redirect safety", () => {
  beforeEach(() => {
    mockHolder.current = null;
  });

  function fakeClient(exchangeError: string | null) {
    return {
      auth: {
        exchangeCodeForSession: async () => ({
          error: exchangeError ? { message: exchangeError } : null,
        }),
        getUser: async () => ({
          data: { user: { id: "user-1" } },
        }),
      },
    };
  }

  it("redirects an internal next target on the same origin", async () => {
    mockHolder.current = fakeClient(null);
    const res = await authCallback(
      new Request("http://localhost/auth/callback?code=abc&next=/admin"),
    );
    expect(res.headers.get("Location")).toBe("http://localhost/admin");
  });

  it("falls back home for an absolute off-site next target", async () => {
    mockHolder.current = fakeClient(null);
    const res = await authCallback(
      new Request(
        "http://localhost/auth/callback?code=abc&next=https://evil.example.com/admin",
      ),
    );
    expect(res.headers.get("Location")).toBe("http://localhost/");
  });

  it("falls back home for a protocol-relative next target", async () => {
    mockHolder.current = fakeClient(null);
    const res = await authCallback(
      new Request(
        "http://localhost/auth/callback?code=abc&next=//evil.example.com",
      ),
    );
    expect(res.headers.get("Location")).toBe("http://localhost/");
  });

  it("defaults home when next is absent", async () => {
    mockHolder.current = fakeClient(null);
    const res = await authCallback(
      new Request("http://localhost/auth/callback?code=abc"),
    );
    expect(res.headers.get("Location")).toBe("http://localhost/");
  });

  it("keeps the auth-error redirect on-site", async () => {
    mockHolder.current = fakeClient("bad code");
    const res = await authCallback(
      new Request("http://localhost/auth/callback?code=abc"),
    );
    expect(res.headers.get("Location")).toBe(
      "http://localhost/?auth_error=bad%20code",
    );
  });

  it("reports honestly when Supabase is not configured", async () => {
    mockHolder.current = null;
    const res = await authCallback(
      new Request("http://localhost/auth/callback?code=abc"),
    );
    expect(res.status).toBe(503);
  });
});
