/**
 * ClipForge Phase 4 — audit wiring helper tests.
 *
 * scheduleAudit is the additive call wired into Phase 1–3 flows: it
 * must POST to the audit table when a database is configured and do
 * nothing (never throw, never break the caller) when it is not.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { scheduleAudit, emitAuditSafe } from "@/lib/admin/audit";

const tick = () => new Promise((r) => setTimeout(r, 10));

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("scheduleAudit", () => {
  it("posts to the audit table when a database is configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    const seen: { url: string; body: string }[] = [];
    const fetchMock = vi.fn(async (url: unknown, init?: { body?: unknown }) => {
      seen.push({ url: String(url), body: String(init?.body ?? "") });
      return { ok: true, json: async () => [{ id: "audit-1" }] };
    });
    vi.stubGlobal("fetch", fetchMock);
    scheduleAudit({
      actor: "guest",
      action: "upload.created",
      target: "uploads/abc/video.mp4",
      metadata: { sizeBytes: 123 },
      ip: "1.2.3.4",
      user_agent: "test",
    });
    await tick();
    expect(fetchMock).toHaveBeenCalled();
    expect(seen[0]?.url).toContain("clipper_audit_log");
    const body = JSON.parse(seen[0]?.body ?? "{}") as {
      action: string;
      actor: string;
    };
    expect(body.action).toBe("upload.created");
    expect(body.actor).toBe("guest");
  });

  it("does nothing and never throws without a database", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [],
    }) as never);
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      emitAuditSafe({
        actor: "guest",
        action: "upload.created",
        target: null,
        metadata: null,
        ip: null,
        user_agent: null,
      }),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
