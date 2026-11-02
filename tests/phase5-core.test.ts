/**
 * ClipForge Phase 5 — core unit tests (no network, no database).
 *
 * Covers: webhook signing + verification (incl. stale/malformed
 * rejection), backoff shape, payload sanitization, API key
 * generation/hash/verify/scopes, event bus pub/sub + isolation,
 * registry status derivation, SSO schema + status, GDPR archive
 * shape + deletion order + retained tables.
 */

import { describe, it, expect } from "vitest";
import {
  signWebhookPayload,
  verifyWebhookSignature,
  nextBackoffMs,
  sanitizeWebhookPayload,
  attemptDelivery,
} from "@/lib/integrations/webhooks";
import {
  generateApiKeySecret,
  apiKeyPrefixFor,
  hashApiKeySecret,
  apiKeyHashMatches,
  scopeSatisfies,
  extractApiKeySecret,
} from "@/lib/integrations/apikeys";
import {
  InMemoryEventBus,
  makeDomainEvent,
  DOMAIN_EVENTS,
} from "@/lib/integrations/events";
import {
  INTEGRATION_REGISTRY,
  integrationStatus,
  findIntegrationDefinition,
} from "@/lib/integrations/registry";
import { ssoConfigSchema, ssoStatusFromRow } from "@/lib/integrations/sso";
import {
  buildGdprArchive,
  GDPR_DELETION_ORDER,
  GDPR_EXPORT_COLUMNS,
} from "@/lib/integrations/gdpr";

describe("webhook signing", () => {
  it("signs and verifies a payload", () => {
    const secret = "whsec-test";
    const ts = 1_700_000_000;
    const body = JSON.stringify({ event: "post.published" });
    const sig = signWebhookPayload(secret, ts, body);
    expect(sig.startsWith("sha256=")).toBe(true);
    expect(verifyWebhookSignature(secret, ts, body, sig, ts)).toBe(true);
  });

  it("rejects a wrong secret, a tampered body, and a stale timestamp", () => {
    const ts = 1_700_000_000;
    const body = '{"event":"post.published"}';
    const sig = signWebhookPayload("correct", ts, body);
    expect(verifyWebhookSignature("wrong", ts, body, sig, ts)).toBe(false);
    expect(
      verifyWebhookSignature("correct", ts, '{"event":"x"}', sig, ts),
    ).toBe(false);
    expect(
      verifyWebhookSignature("correct", ts, body, sig, ts + 301),
    ).toBe(false);
    expect(verifyWebhookSignature("correct", ts, body, null, ts)).toBe(false);
    expect(verifyWebhookSignature("correct", ts, body, "garbage", ts)).toBe(
      false,
    );
  });

  it("accepts timestamps inside the tolerance window", () => {
    const ts = 1_700_000_000;
    const body = "{}";
    const sig = signWebhookPayload("s", ts, body);
    expect(verifyWebhookSignature("s", ts, body, sig, ts + 300)).toBe(true);
  });
});

describe("webhook backoff + sanitization + delivery", () => {
  it("grows exponentially and caps at 60s", () => {
    const zero = () => 0;
    expect(nextBackoffMs(0, zero)).toBe(1000);
    expect(nextBackoffMs(1, zero)).toBe(2000);
    expect(nextBackoffMs(5, zero)).toBe(32000);
    expect(nextBackoffMs(10, zero)).toBe(60000);
  });

  it("strips secret-like keys at any depth", () => {
    const clean = sanitizeWebhookPayload({
      targetId: "p1",
      api_key: "nope",
      nested: { access_token: "nope", ok: 1 },
      transcript: "never",
    });
    expect(clean).toEqual({ targetId: "p1", nested: { ok: 1 } });
  });

  it("attemptDelivery reports 2xx as delivered and failures honestly", async () => {
    const ok = await attemptDelivery(
      "https://example.com/hook",
      "secret",
      "post.published",
      { targetId: "p1" },
      (async () => new Response("ok", { status: 200 })) as never,
    );
    expect(ok.ok).toBe(true);
    expect(ok.status).toBe(200);
    const failed = await attemptDelivery(
      "https://example.com/hook",
      "secret",
      "post.published",
      { targetId: "p1" },
      (async () => new Response("err", { status: 500 })) as never,
    );
    expect(failed.ok).toBe(false);
    expect(failed.status).toBe(500);
    const down = await attemptDelivery(
      "https://example.com/hook",
      "secret",
      "post.published",
      { targetId: "p1" },
      (async () => {
        throw new Error("network down");
      }) as never,
    );
    expect(down.ok).toBe(false);
    expect(down.error).toBe("network down");
  });

  it("delivery sends the signature + timestamp headers", async () => {
    let seen: Record<string, string> = {};
    await attemptDelivery(
      "https://example.com/hook",
      "secret",
      "clip.ready",
      { targetId: "c1" },
      (async (_url: unknown, init?: RequestInit) => {
        seen = (init?.headers ?? {}) as Record<string, string>;
        return new Response("ok", { status: 200 });
      }) as never,
    );
    expect(seen["X-ClipForge-Signature"]?.startsWith("sha256=")).toBe(true);
    expect(seen["X-ClipForge-Timestamp"]).toMatch(/^\d+$/);
  });
});

describe("API keys", () => {
  it("generates prefixed secrets, hashes, and verifies timing-safely", () => {
    const secret = generateApiKeySecret();
    expect(secret.startsWith("cf_")).toBe(true);
    expect(secret.length).toBe(27);
    const hash = hashApiKeySecret(secret);
    expect(apiKeyHashMatches(secret, hash)).toBe(true);
    expect(apiKeyHashMatches(`${secret}x`, hash)).toBe(false);
    expect(apiKeyHashMatches("cf_other", hash)).toBe(false);
    expect(apiKeyPrefixFor(secret)).toBe(`cf_${secret.slice(3, 11)}`);
  });

  it("enforces the scope hierarchy", () => {
    expect(scopeSatisfies(["read"], "read")).toBe(true);
    expect(scopeSatisfies(["read"], "write")).toBe(false);
    expect(scopeSatisfies(["write"], "read")).toBe(true);
    expect(scopeSatisfies(["write"], "write")).toBe(true);
    expect(scopeSatisfies(["admin"], "write")).toBe(true);
    expect(scopeSatisfies([], "read")).toBe(false);
  });

  it("extracts keys from Bearer and X-ClipForge-Key headers", () => {
    const bearer = new Request("https://x.test", {
      headers: { authorization: "Bearer cf_abc" },
    });
    expect(extractApiKeySecret(bearer)).toBe("cf_abc");
    const header = new Request("https://x.test", {
      headers: { "x-clipforge-key": "cf_xyz" },
    });
    expect(extractApiKeySecret(header)).toBe("cf_xyz");
    const none = new Request("https://x.test");
    expect(extractApiKeySecret(none)).toBe(null);
  });
});

describe("event bus", () => {
  it("delivers to subscribers and isolates failures", async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe("post.published", () => {
      seen.push("a");
    });
    bus.subscribe("post.published", () => {
      throw new Error("subscriber blew up");
    });
    bus.subscribe("post.published", () => {
      seen.push("b");
    });
    bus.subscribe("clip.ready", () => {
      seen.push("wrong-event");
    });
    await bus.publish(makeDomainEvent("post.published", { targetId: "p1" }));
    expect(seen).toEqual(["a", "b"]);
    expect(bus.listenerCount("post.published")).toBe(3);
    const unsub = bus.subscribe("clip.ready", () => {
      seen.push("c");
    });
    unsub();
    expect(bus.listenerCount("clip.ready")).toBe(1);
  });

  it("covers every webhook event name", () => {
    for (const name of [
      "project.created",
      "clip.ready",
      "post.published",
      "post.failed",
      "strike.created",
      "billing.event",
    ] as const) {
      expect(DOMAIN_EVENTS).toContain(name);
    }
  });
});

describe("integration registry", () => {
  it("never claims a connection without credentials", () => {
    const slack = findIntegrationDefinition("slack-notify");
    expect(slack).not.toBe(null);
    expect(integrationStatus(slack!, null, {})).toBe("not_configured");
    expect(
      integrationStatus(
        slack!,
        null,
        { SLACK_ALERT_WEBHOOK_URL: "https://hooks.slack.test/x" },
      ),
    ).toBe("configured");
    expect(
      integrationStatus(
        slack!,
        { integrationId: "slack-notify", enabled: false },
        { SLACK_ALERT_WEBHOOK_URL: "https://hooks.slack.test/x" },
      ),
    ).toBe("disabled");
  });

  it("marks drive-export interface-only forever", () => {
    const drive = findIntegrationDefinition("drive-export");
    expect(drive).not.toBe(null);
    expect(
      integrationStatus(drive!, null, {
        DRIVE_EXPORT_CLIENT_ID: "id",
        DRIVE_EXPORT_CLIENT_SECRET: "secret",
      }),
    ).toBe("interface_only");
  });

  it("registers exactly the honest built-ins", () => {
    expect(INTEGRATION_REGISTRY.map((d) => d.id).sort()).toEqual([
      "drive-export",
      "generic-webhook",
      "slack-notify",
    ]);
  });
});

describe("SSO config", () => {
  it("validates OIDC and SAML shapes, rejects bad ones", () => {
    expect(
      ssoConfigSchema.safeParse({
        provider: "oidc",
        config: {
          issuer: "https://idp.example.com",
          clientId: "cid",
          clientSecret: "cs",
        },
      }).success,
    ).toBe(true);
    expect(
      ssoConfigSchema.safeParse({
        provider: "oidc",
        config: { issuer: "not-a-url", clientId: "cid" },
      }).success,
    ).toBe(false);
    expect(
      ssoConfigSchema.safeParse({
        provider: "saml",
        config: {
          entityId: "e",
          ssoUrl: "https://idp.example.com/sso",
          certificate: "cert",
        },
      }).success,
    ).toBe(true);
  });

  it("reports setup_needed until a config exists", () => {
    const empty = ssoStatusFromRow(null);
    expect(empty.state).toBe("setup_needed");
    expect(empty.configured).toBe(false);
    const saved = ssoStatusFromRow({ provider: "oidc", enabled: true });
    expect(saved.state).toBe("configured");
    expect(saved.provider).toBe("oidc");
  });
});

describe("GDPR", () => {
  it("builds an archive with safe tables and retained notes", () => {
    const archive = buildGdprArchive("u1", {
      clipper_users: [{ id: "u1", email: "u@example.com" }],
      clipper_projects: [],
    });
    expect(archive.userId).toBe("u1");
    expect(archive.tables.clipper_users).toHaveLength(1);
    expect(archive.retained.map((r) => r.table)).toEqual([
      "clipper_audit_log",
      "clipper_strikes",
    ]);
  });

  it("deletes children before the user row, and exports safe columns only", () => {
    expect(GDPR_DELETION_ORDER[0]).toBe("clipper_api_keys");
    expect(GDPR_DELETION_ORDER[GDPR_DELETION_ORDER.length - 1]).toBe(
      "clipper_users",
    );
    expect(GDPR_EXPORT_COLUMNS.clipper_api_keys).not.toContain("key_hash");
    expect(GDPR_EXPORT_COLUMNS.clipper_webhook_endpoints).not.toContain(
      "secret",
    );
    expect(GDPR_EXPORT_COLUMNS.clipper_integrations).not.toContain(
      "config_enc",
    );
  });
});
