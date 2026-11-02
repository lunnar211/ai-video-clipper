/**
 * ClipForge Phase 4 — admin core tests (roles, TOTP, markers, audit,
 * metrics, alerts, break-glass, SSE, drill-down).
 *
 * All pure or mocked — no real database, platform, or paid calls.
 */

import { describe, it, expect, vi } from "vitest";
import {
  canViewConsole,
  canTakeAdminAction,
  mfaRequiredFor,
} from "@/lib/admin/roles";
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  totpCodeAt,
  verifyTotpCode,
  totpOtpauthUrl,
} from "@/lib/admin/totp";
import {
  createMfaMarker,
  verifyMfaMarker,
} from "@/lib/admin/session";
import {
  createViewAsMarker,
  verifyViewAsMarker,
  isViewAsRequest,
  VIEW_AS_COOKIE,
} from "@/lib/admin/impersonation";
import {
  sanitizeAuditMetadata,
  auditToCsv,
  auditToJson,
  recordAudit,
  listAudit,
  purgeExpiredAudit,
  auditRetentionDays,
  type AuditEntry,
} from "@/lib/admin/audit";
import {
  dauMau,
  funnel,
  queueHealth,
  costByUser,
  costByFeature,
  revenue,
  publishSuccessByPlatform,
  topErrors,
  strikeStats,
  detectAnomalies,
} from "@/lib/admin/metrics";
import {
  alertConfig,
  dispatchWebhook,
  dispatchAnomaly,
} from "@/lib/admin/alerts";
import { breakglassGrantUsable } from "@/lib/admin/breakglass";
import { formatSseEvent, sseHeaders, sseMaxSeconds } from "@/lib/admin/sse";
import { assembleDrilldown } from "@/lib/admin/users";
import { creditBalance } from "@/lib/admin/store";
import { parseTokenKey } from "@/lib/publish/tokens";

const DB = { url: "https://db.example.com", serviceKey: "service-key" };

function entry(partial: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "e1",
    actor: "user-1",
    action: "clip.rendered",
    target: null,
    metadata: null,
    ip: "1.2.3.4",
    user_agent: "test-agent",
    created_at: new Date().toISOString(),
    ...partial,
  };
}

describe("roles", () => {
  it("viewer can view but cannot act; user cannot view", () => {
    expect(canViewConsole("viewer")).toBe(true);
    expect(canTakeAdminAction("viewer")).toBe(false);
    expect(canViewConsole("user")).toBe(false);
    expect(canTakeAdminAction("owner")).toBe(true);
    expect(canTakeAdminAction("support")).toBe(false);
  });
  it("MFA is required for owner/admin only", () => {
    expect(mfaRequiredFor("owner")).toBe(true);
    expect(mfaRequiredFor("admin")).toBe(true);
    expect(mfaRequiredFor("support")).toBe(false);
    expect(mfaRequiredFor("analyst")).toBe(false);
    expect(mfaRequiredFor("viewer")).toBe(false);
  });
});

describe("totp", () => {
  // RFC 6238 SHA-1 secret "12345678901234567890" as base32.
  const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  it("base32 round-trips", () => {
    const raw = Buffer.from("hello-admin-mfa");
    expect(base32Decode(base32Encode(raw)).toString()).toBe("hello-admin-mfa");
  });
  it("matches RFC 6238 vectors (6-digit truncation)", () => {
    // t=59 → counter 1 → 287082; t=1111111109 → counter 37037036 → 081804.
    expect(totpCodeAt(SECRET, 1)).toBe("287082");
    expect(totpCodeAt(SECRET, 37037036)).toBe("081804");
  });
  it("verifies within ±1 step and rejects bad codes", () => {
    const nowMs = 59 * 1000;
    expect(verifyTotpCode(SECRET, "287082", nowMs)).toBe(true);
    expect(verifyTotpCode(SECRET, "000000", nowMs)).toBe(false);
    expect(verifyTotpCode(SECRET, "28708", nowMs)).toBe(false);
  });
  it("generates a usable secret + otpauth URL", () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(16);
    const url = totpOtpauthUrl(secret, "admin@example.com", "ClipForge");
    expect(url.startsWith("otpauth://totp/")).toBe(true);
    expect(url).toContain(`secret=${secret}`);
  });
});

describe("mfa marker", () => {
  const key = parseTokenKey(Buffer.alloc(32, 7).toString("base64")) as Buffer;
  it("round-trips, rejects tampering and expiry", () => {
    const marker = createMfaMarker("user-9", key, 1_000_000);
    expect(verifyMfaMarker(marker, key, 1_000_000 + 1000)).toBe("user-9");
    expect(verifyMfaMarker(marker + "x", key, 1_000_000)).toBe(null);
    expect(
      verifyMfaMarker(marker, key, 1_000_000 + 13 * 60 * 60 * 1000),
    ).toBe(null);
  });
});

describe("view-as marker", () => {
  const key = parseTokenKey(Buffer.alloc(32, 9).toString("base64")) as Buffer;
  it("round-trips and rejects tampering/expiry", () => {
    const marker = createViewAsMarker(
      { adminId: "admin-1", targetUserId: "user-2", reason: "Support investigation" },
      key,
      5_000_000,
    );
    const parsed = verifyViewAsMarker(marker, key, 5_000_000 + 1000);
    expect(parsed?.targetUserId).toBe("user-2");
    expect(verifyViewAsMarker(marker, key, 5_000_000 + 3 * 60 * 60 * 1000)).toBe(null);
  });
  it("isViewAsRequest reads the cookie header", () => {
    const nowMs = Date.now();
    const marker = createViewAsMarker(
      { adminId: "a", targetUserId: "u", reason: "Support investigation" },
      key,
      nowMs,
    );
    const req = new Request("http://localhost/api/test", {
      headers: { cookie: `${VIEW_AS_COOKIE}=${marker}` },
    });
    expect(isViewAsRequest(req, key)).toBe(true);
    const plain = new Request("http://localhost/api/test");
    expect(isViewAsRequest(plain, key)).toBe(false);
  });
});

describe("audit", () => {
  it("sanitizer drops token/secret/transcript keys at any depth", () => {
    const out = sanitizeAuditMetadata({
      ok: 1,
      access_token: "should-vanish",
      nested: { transcript: "should-vanish", keep: "yes" },
      password: "should-vanish",
    });
    expect(out).toEqual({ ok: 1, nested: { keep: "yes" } });
  });
  it("recordAudit POSTs once and listAudit GETs", async () => {
    const calls: { method: string; url: string }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url });
      return {
        ok: true,
        json: async () => [entry({ id: "audit-1" })],
      } as Response;
    });
    await recordAudit(
      DB,
      { actor: "u1", action: "clip.rendered", target: "clip:1", metadata: {}, ip: null, user_agent: null },
      fetchMock as never,
    );
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(calls[0].url).toContain("clipper_audit_log");
    await listAudit(DB, { action: "clip.rendered" }, fetchMock as never);
    expect(calls.some((c) => c.method === "GET")).toBe(true);
  });
  it("purge deletes only old rows and writes a purge entry", async () => {
    const calls: { method: string; url: string }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url });
      if ((init?.method ?? "GET") === "DELETE") {
        return { ok: true, json: async () => [{ id: "old-1" }] } as Response;
      }
      return { ok: true, json: async () => [entry({ id: "purge-entry" })] } as Response;
    });
    const out = await purgeExpiredAudit(DB, "admin-1", Date.parse("2026-11-02T00:00:00Z"), fetchMock as never);
    const del = calls.find((c) => c.method === "DELETE");
    expect(del?.url).toContain("created_at=lt.");
    expect(out.deleted).toBe(1);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
  it("CSV/JSON exports carry every field", () => {
    const rows = [entry({ id: "a1", action: "auth.login" })];
    expect(auditToCsv(rows).split("\n")[0]).toContain("actor,action");
    expect(auditToCsv(rows)).toContain("a1");
    expect(JSON.parse(auditToJson(rows))[0].id).toBe("a1");
  });
  it("retention defaults to 365 and honours env", () => {
    expect(auditRetentionDays({})).toBe(365);
    expect(auditRetentionDays({ ADMIN_AUDIT_RETENTION_DAYS: "90" })).toBe(90);
  });
});

describe("metrics", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  const recent = (action: string, actor: string, minsAgo: number, cost?: number) =>
    entry({
      action,
      actor,
      created_at: new Date(now - minsAgo * 60 * 1000).toISOString(),
      metadata: cost !== undefined ? { cost_usd: cost } : null,
    });
  it("dau/mau, funnel, queue health", () => {
    const rows = [
      recent("clip.rendered", "u1", 10),
      recent("post.published", "u1", 20),
      recent("clip.rendered", "u2", 60 * 24 * 10),
    ];
    expect(dauMau(rows, now)).toEqual({ dau: 1, mau: 2 });
    expect(
      funnel(
        [{ id: "u1", plan: "pro", created_at: "" }, { id: "u2", plan: "free", created_at: "" }],
        rows,
      ),
    ).toEqual({ signups: 2, firstClip: 2, firstPublish: 1, paid: 1 });
    expect(queueHealth([{ status: "queued", created_at: "" }], [{ status: "scheduled" }])).toEqual({
      "render.queued": 1,
      "post.scheduled": 1,
    });
  });
  it("cost aggregates only from recorded cost_usd", () => {
    const rows = [
      recent("ai.job_run", "u1", 5, 0.4),
      recent("clip.rendered", "u1", 6, 0.1),
      recent("clip.rendered", "u2", 7),
    ];
    expect(costByUser(rows)).toEqual({ u1: 0.5 });
    expect(costByFeature(rows)).toEqual({ ai: 0.4, clip: 0.1 });
  });
  it("revenue never invents MRR", () => {
    const rev = revenue([{ id: "u1", plan: "pro", created_at: "" }]);
    expect(rev.planCounts).toEqual({ pro: 1 });
    expect(rev.mrrAvailable).toBe(false);
    expect(rev.mrrUsd).toBe(null);
  });
  it("publish success, top errors, strikes, anomalies", () => {
    expect(
      publishSuccessByPlatform([
        { platform: "youtube", status: "published", error: null },
        { platform: "youtube", status: "failed", error: "quota" },
      ]),
    ).toEqual({ youtube: { attempted: 2, published: 1, rate: 0.5 } });
    expect(
      topErrors([recent("post.failed", "u1", 5)], [{ platform: "youtube", status: "failed", error: "quota" }], 10),
    ).toEqual([{ error: "quota", count: 1 }]);
    expect(strikeStats([{ status: "upheld", created_at: "" }])).toEqual({ upheld: 1 });
    const anomalies = detectAnomalies(
      [...Array.from({ length: 150 }, () => recent("clip.rendered", "spammer", 5))],
      100,
      5,
      now,
    );
    expect(anomalies.some((a) => a.rule === "unusual_volume")).toBe(true);
    const ipRows = ["u0", "u1", "u2", "u3", "u4", "u5"].map((actor) =>
      entry({ actor, ip: "9.9.9.9", created_at: new Date(now - 1000).toISOString() }),
    );
    expect(detectAnomalies(ipRows, 100, 5, now).some((a) => a.rule === "many_accounts_per_ip")).toBe(true);
  });
});

describe("alerts", () => {
  it("config defaults + env overrides", () => {
    expect(alertConfig({})).toMatchObject({ volumeThresholdPerHour: 100, ipUsersThreshold: 5 });
    expect(alertConfig({ ADMIN_ALERT_VOLUME_THRESHOLD: "50" }).volumeThresholdPerHour).toBe(50);
  });
  it("dispatch is inert without URLs and posts when configured", async () => {
    const noUrl = await dispatchAnomaly(
      { rule: "unusual_volume", severity: "warning", detail: "x" },
      alertConfig({}),
    );
    expect(noUrl[0]).toEqual({ sent: false, reason: "No alert webhook URL configured" });
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    const sent = await dispatchWebhook("https://hooks.example.com/x", { text: "hi" }, fetchMock as never);
    expect(sent.sent).toBe(true);
    const failed = await dispatchWebhook("https://hooks.example.com/x", { text: "hi" }, (async () => ({ ok: false, status: 500 }) as Response) as never);
    expect(failed).toEqual({ sent: false, reason: "Webhook HTTP 500" });
  });
});

describe("break-glass + sse + drill-down", () => {
  it("grant usability respects use + expiry", () => {
    expect(breakglassGrantUsable({ used_at: null, expires_at: new Date(Date.now() + 60000).toISOString() })).toBe(true);
    expect(breakglassGrantUsable({ used_at: "2026-01-01T00:00:00Z", expires_at: new Date(Date.now() + 60000).toISOString() })).toBe(false);
    expect(breakglassGrantUsable({ used_at: null, expires_at: new Date(Date.now() - 1000).toISOString() })).toBe(false);
  });
  it("SSE frames + headers + max-seconds env", () => {
    expect(sseHeaders()["Content-Type"]).toBe("text/event-stream");
    expect(formatSseEvent({ id: "e1", action: "auth.login", actor: "u1", created_at: "2026-01-01T00:00:00Z" })).toContain("data:");
    expect(sseMaxSeconds({})).toBe(60);
    expect(sseMaxSeconds({ ADMIN_SSE_MAX_SECONDS: "0" })).toBe(0);
  });
  it("drill-down sums clip minutes and credit balance", () => {
    const out = assembleDrilldown({
      user: { id: "u1", email: "a@b.c", plan: "free", role: "user", status: "active", publishing_paused: false, created_at: "" },
      projects: [],
      clips: [
        { id: "c1", title: "t", start_seconds: 0, end_seconds: 60, created_at: "" },
        { id: "c2", title: "t", start_seconds: 10, end_seconds: 40, created_at: "" },
      ],
      posts: [],
      accounts: [],
      declarationCount: 1,
      fingerprintScanCount: 0,
      strikeCount: 0,
      upheldStrikeCount: 0,
      supportNotes: [],
      creditAdjustments: [
        { id: "a1", user_id: "u1", admin_id: "ad", delta_clips: 5, reason: "goodwill", created_at: "" },
        { id: "a2", user_id: "u1", admin_id: "ad", delta_clips: -2, reason: "correction", created_at: "" },
      ],
    });
    expect(out.usageMinutes).toBe(1.5);
    expect(out.creditBalanceClips).toBe(3);
    expect(out.accounts).toEqual([]);
  });
  it("creditBalance sums deltas", () => {
    expect(creditBalance([{ delta_clips: 3 } as never, { delta_clips: -1 } as never])).toBe(2);
  });
});
