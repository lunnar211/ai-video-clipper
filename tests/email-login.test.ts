/**
 * Email + password sign-in tests (owner-requested addition).
 *
 * Mocked Supabase client only — no real auth calls, no real database,
 * no password values anywhere (test passwords are dummy strings used
 * solely to exercise validation and call shapes). Covers: input
 * validation, wrong-password rejection, unconfirmed-email handling,
 * the sign-out route clearing the httpOnly MFA marker cookie, and —
 * with the server Supabase client mocked — that admin gating is
 * UNCHANGED for email-signed-in users (plain 'user' role blocked,
 * owner still needs enrolled + verified MFA).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

const mockHolder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/auth/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => mockHolder.current),
}));

import {
  EmailSignInSchema,
  normalizeEmail,
  signInWithEmailPassword,
  validNextPath,
  type EmailSignInClient,
} from "@/lib/auth/email-login";
import {
  CONSOLE_ROLES,
  canViewConsole,
  mfaRequiredFor,
} from "@/lib/admin/roles";
import {
  MFA_MARKER_COOKIE,
  createMfaMarker,
  getAdminSession,
  requireAdminSession,
} from "@/lib/admin/session";
import { parseTokenKey } from "@/lib/publish/tokens";
import { POST as signOut } from "@/app/api/auth/sign-out/route";

function makeMockClient(
  userRow: Record<string, unknown> | null,
  mfaRow: Record<string, unknown> | null,
): EmailSignInClient & {
  auth: { getUser: () => Promise<unknown> };
  from: (table: string) => unknown;
} {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1", email: "owner@example.com" } },
      }),
      signInWithPassword: async () => ({
        data: { user: { id: "user-1" }, session: { token: "x" } },
        error: null,
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: table === "clipper_users" ? userRow : mfaRow,
          }),
        }),
      }),
    }),
  } as never;
}

describe("email sign-in input", () => {
  it("accepts a valid email + password", () => {
    expect(
      EmailSignInSchema.safeParse({
        email: "owner@example.com",
        password: "dummy-password-for-test",
      }).success,
    ).toBe(true);
  });

  it("rejects a bad email, an empty password, and overlong values", () => {
    expect(
      EmailSignInSchema.safeParse({ email: "not-an-email", password: "x" })
        .success,
    ).toBe(false);
    expect(
      EmailSignInSchema.safeParse({ email: "a@b.co", password: "" }).success,
    ).toBe(false);
    expect(
      EmailSignInSchema.safeParse({
        email: `${"a".repeat(250)}@example.com`,
        password: "x",
      }).success,
    ).toBe(false);
    expect(
      EmailSignInSchema.safeParse({
        email: "a@b.co",
        password: "x".repeat(129),
      }).success,
    ).toBe(false);
  });

  it("normalizes email by trimming and lowercasing", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("only allows internal redirect targets", () => {
    expect(validNextPath(null)).toBe("/");
    expect(validNextPath("")).toBe("/");
    expect(validNextPath("//evil.example.com")).toBe("/");
    expect(validNextPath("https://evil.example.com")).toBe("/");
    expect(validNextPath("/admin")).toBe("/admin");
    expect(validNextPath("/admin/mfa")).toBe("/admin/mfa");
  });
});

describe("signInWithEmailPassword (mocked Supabase client)", () => {
  it("succeeds on a valid session and normalizes the email", async () => {
    const calls: { email: string; password: string }[] = [];
    const client: EmailSignInClient = {
      auth: {
        signInWithPassword: async (args) => {
          calls.push(args);
          return {
            data: { user: { id: "user-1" }, session: { token: "x" } },
            error: null,
          };
        },
      },
    };
    const result = await signInWithEmailPassword(client, {
      email: "  Owner@Example.COM ",
      password: "dummy-password-for-test",
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      { email: "owner@example.com", password: "dummy-password-for-test" },
    ]);
  });

  it("rejects wrong credentials with Supabase's message", async () => {
    const client: EmailSignInClient = {
      auth: {
        signInWithPassword: async () => ({
          data: { user: null, session: null },
          error: { message: "Invalid login credentials" },
        }),
      },
    };
    const result = await signInWithEmailPassword(client, {
      email: "owner@example.com",
      password: "wrong-password-for-test",
    });
    expect(result).toEqual({ ok: false, error: "Invalid login credentials" });
  });

  it("asks for email confirmation when there is no session", async () => {
    const client: EmailSignInClient = {
      auth: {
        signInWithPassword: async () => ({
          data: { user: { id: "user-1" }, session: null },
          error: null,
        }),
      },
    };
    const result = await signInWithEmailPassword(client, {
      email: "owner@example.com",
      password: "dummy-password-for-test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/confirm/i);
    }
  });

  it("never calls Supabase for invalid input", async () => {
    const signIn = vi.fn();
    const client: EmailSignInClient = {
      auth: { signInWithPassword: signIn },
    };
    const result = await signInWithEmailPassword(client, {
      email: "bad",
      password: "dummy-password-for-test",
    });
    expect(result.ok).toBe(false);
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe("sign-out route clears the MFA marker", () => {
  it("returns ok and expires the httpOnly marker cookie", async () => {
    const res = await signOut(
      new Request("http://localhost/api/auth/sign-out", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedOut: true });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${MFA_MARKER_COOKIE}=`);
    expect(cookie).toMatch(/Max-Age=0/i);
  });

  it("rejects a non-object body", async () => {
    const res = await signOut(
      new Request("http://localhost/api/auth/sign-out", {
        method: "POST",
        body: JSON.stringify([1]),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("admin gating is unchanged for email-signed-in users", () => {
  const OLD_KEY = process.env.PUBLISH_TOKEN_KEY;

  beforeEach(() => {
    delete process.env.PUBLISH_TOKEN_KEY;
  });

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.PUBLISH_TOKEN_KEY;
    else process.env.PUBLISH_TOKEN_KEY = OLD_KEY;
    mockHolder.current = null;
  });

  it("plain 'user' role still cannot view the console", () => {
    expect(CONSOLE_ROLES).not.toContain("user");
    expect(canViewConsole("user")).toBe(false);
    expect(mfaRequiredFor("user")).toBe(false);
    expect(mfaRequiredFor("owner")).toBe(true);
    expect(mfaRequiredFor("support")).toBe(false);
  });

  it("a 'user' row resolves to role 'user' and is refused console access", async () => {
    mockHolder.current = makeMockClient(
      { role: "user", status: "active", publishing_paused: false },
      null,
    );
    const session = await getAdminSession("");
    expect(session?.role).toBe("user");
    const gate = await requireAdminSession(["owner", "admin"], "");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.status).toBe(403);
  });

  it("an owner without MFA enrolment is still refused with setup required", async () => {
    // A key must exist so the guard reaches the enrolment check (with
    // no key at all it honestly reports 503 setup-needed instead).
    process.env.PUBLISH_TOKEN_KEY = randomBytes(32).toString("base64");
    mockHolder.current = makeMockClient(
      { role: "owner", status: "active", publishing_paused: false },
      null,
    );
    const gate = await requireAdminSession(["owner", "admin"], "");
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.status).toBe(403);
      expect(gate.mfaSetupRequired).toBe(true);
    }
  });

  it("an owner with enrolled + verified MFA still passes (guard intact)", async () => {
    const key = randomBytes(32).toString("base64");
    process.env.PUBLISH_TOKEN_KEY = key;
    const marker = createMfaMarker(
      "user-1",
      parseTokenKey(key) as Buffer,
    );
    mockHolder.current = makeMockClient(
      { role: "owner", status: "active", publishing_paused: false },
      { verified_at: "2026-01-01T00:00:00Z" },
    );
    const gate = await requireAdminSession(
      ["owner", "admin"],
      `${MFA_MARKER_COOKIE}=${marker}`,
    );
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.session.role).toBe("owner");
      expect(gate.session.mfaVerified).toBe(true);
    }
  });
});
