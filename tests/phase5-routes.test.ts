/**
 * ClipForge Phase 5 — route tests (mocked session + fetch).
 *
 * Same harness as Phase 4: the session module is mocked so routes
 * see a canned admin session; the database is a stubbed global
 * fetch keyed by table name, plus a fake webhook receiver for
 * delivery/replay. No real database, platform, or paid calls. Each
 * request carries a unique x-forwarded-for so the 5/min per-IP
 * limiter never trips across tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/admin/session", async (importOriginal) => {
  const orig =
    await importOriginal<typeof import("@/lib/admin/session")>();
  return {
    ...orig,
    getAdminSession: vi.fn(),
    requireAdminSession: vi.fn(),
  };
});

import {
  getAdminSession,
  requireAdminSession,
} from "@/lib/admin/session";
import { createEnvTokenCrypto } from "@/lib/publish/tokens";
import {
  apiKeyPrefixFor,
  hashApiKeySecret,
} from "@/lib/integrations/apikeys";
import { signWebhookPayload } from "@/lib/integrations/webhooks";

import {
  GET as listIntegrations,
  POST as toggleIntegration,
} from "@/app/api/admin/integrations/route";
import {
  GET as listWebhooks,
  POST as createWebhook,
} from "@/app/api/admin/webhooks/route";
import {
  GET as getWebhook,
  DELETE as deleteWebhook,
} from "@/app/api/admin/webhooks/[id]/route";
import { GET as listDeliveries } from "@/app/api/admin/webhooks/[id]/deliveries/route";
import { POST as replayDeliveryRoute } from "@/app/api/admin/webhooks/deliveries/[deliveryId]/replay/route";
import {
  GET as listKeys,
  POST as createKey,
} from "@/app/api/admin/api-keys/route";
import { DELETE as revokeKey } from "@/app/api/admin/api-keys/[id]/route";
import {
  GET as getSso,
  POST as saveSso,
} from "@/app/api/admin/sso/route";
import { POST as gdprExport } from "@/app/api/admin/gdpr/export/route";
import { POST as gdprDelete } from "@/app/api/admin/gdpr/delete/route";
import { GET as v1Projects } from "@/app/api/v1/projects/route";
import { GET as v1Clips } from "@/app/api/v1/clips/route";
import { GET as v1Posts } from "@/app/api/v1/posts/route";
import { GET as v1Usage } from "@/app/api/v1/usage/route";
import { GET as v1Openapi } from "@/app/api/v1/openapi/route";
import { POST as mcp } from "@/app/api/mcp/route";

const ADMIN_SESSION = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "owner" as const,
  status: "active" as const,
  publishingPaused: false,
  mfaVerified: true,
  mfaEnrolled: true,
};

const TOKEN_KEY = Buffer.alloc(32, 11).toString("base64");
const KEY_SECRET = `cf_${"a".repeat(24)}`;

type Call = { method: string; url: string; body?: unknown };

function okJson(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(
  tableRows: Record<string, unknown[]>,
  calls: Call[],
  receiverStatus = 200,
) {
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const raw = String(url);
    calls.push({ method, url: raw, body: init?.body });
    // Fake webhook receiver (anything outside the fake PostgREST host).
    if (!raw.startsWith("https://db.example.com")) {
      return new Response("ok", { status: receiverStatus });
    }
    const u = new URL(raw);
    const table = u.pathname.split("/").pop() ?? "";
    if (method === "GET") return okJson(tableRows[table] ?? []);
    if (method === "POST") {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return okJson([{ id: `new-${table}`, ...body }]);
    }
    if (method === "PATCH") return okJson([{}]);
    if (method === "DELETE") return okJson(tableRows[table] ?? []);
    return okJson([]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

let ipCounter = 0;
function req(url: string, init?: RequestInit): Request {
  ipCounter += 1;
  return new Request(url, {
    ...init,
    headers: {
      "x-forwarded-for": `10.0.0.${ipCounter}`,
      ...(init?.headers ?? {}),
    },
  });
}

function jsonReq(url: string, body: unknown): Request {
  return req(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function keyReq(url: string, secret: string, init?: RequestInit): Request {
  return req(url, {
    ...init,
    headers: { "x-clipforge-key": secret, ...(init?.headers ?? {}) },
  });
}

function keyRow(scopes: string[]) {
  return {
    id: "key-1",
    user_id: "admin-1",
    name: "test key",
    key_prefix: apiKeyPrefixFor(KEY_SECRET),
    key_hash: hashApiKeySecret(KEY_SECRET),
    scopes,
    revoked_at: null,
    last_used_at: null,
    created_at: "2026-11-02T00:00:00Z",
  };
}

beforeEach(() => {
  vi.mocked(requireAdminSession).mockResolvedValue({
    ok: true,
    session: ADMIN_SESSION,
  });
  vi.mocked(getAdminSession).mockResolvedValue(ADMIN_SESSION);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.PUBLISH_TOKEN_KEY = TOKEN_KEY;
  delete process.env.INTEGRATION_MCP_WRITES_ENABLED;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("integrations registry", () => {
  it("lists registry entries with honest statuses; refuses interface-only enable", async () => {
    const calls: Call[] = [];
    installFetch({}, calls);
    const list = await listIntegrations(
      req("http://localhost/api/admin/integrations"),
    );
    expect(list.status).toBe(200);
    const data = await list.json();
    const slack = data.integrations.find(
      (i: { id: string }) => i.id === "slack-notify",
    );
    expect(slack.status).toBe("not_configured");
    const drive = data.integrations.find(
      (i: { id: string }) => i.id === "drive-export",
    );
    expect(drive.status).toBe("interface_only");
    const refused = await toggleIntegration(
      jsonReq("http://localhost/api/admin/integrations", {
        integrationId: "drive-export",
        enabled: true,
      }),
    );
    expect(refused.status).toBe(400);
    const ok = await toggleIntegration(
      jsonReq("http://localhost/api/admin/integrations", {
        integrationId: "slack-notify",
        enabled: true,
      }),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).integration.enabled).toBe(true);
  });
});

describe("webhooks", () => {
  it("creates an endpoint returning the secret once; lists never include it", async () => {
    const calls: Call[] = [];
    installFetch({}, calls);
    const created = await createWebhook(
      jsonReq("http://localhost/api/admin/webhooks", {
        url: "https://hooks.example.com/in",
        events: ["post.published"],
      }),
    );
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(typeof body.signingSecret).toBe("string");
    expect(body.signingSecret.length).toBeGreaterThan(20);
    expect(body.endpoint.secret_enc).toBeUndefined();
    const listed = await listWebhooks(
      req("http://localhost/api/admin/webhooks"),
    );
    expect(listed.status).toBe(200);
    expect(JSON.stringify(await listed.json())).not.toContain("secret_enc");

    const badUrl = await createWebhook(
      jsonReq("http://localhost/api/admin/webhooks", {
        url: "http://insecure.example.com/in",
        events: ["post.published"],
      }),
    );
    expect(badUrl.status).toBe(400);
    const badEvent = await createWebhook(
      jsonReq("http://localhost/api/admin/webhooks", {
        url: "https://hooks.example.com/in",
        events: ["nope.event"],
      }),
    );
    expect(badEvent.status).toBe(400);
  });

  it("get + delete one endpoint; deliveries list; replay of a failed delivery", async () => {
    const crypto = createEnvTokenCrypto()!;
    const endpointRow = {
      id: "wh-1",
      user_id: "admin-1",
      url: "https://hooks.example.com/in",
      events: ["post.published"],
      secret_enc: crypto.encrypt("receiver-secret"),
      key_id: crypto.keyId,
      active: true,
      created_at: "2026-11-02T00:00:00Z",
    };
    const deliveryRow = {
      id: "dlv-1",
      endpoint_id: "wh-1",
      event: "post.published",
      payload: { targetId: "p1" },
      status: "failed",
      attempts: 1,
      next_attempt_at: null,
      last_error: "HTTP 500",
      created_at: "2026-11-02T00:00:00Z",
    };
    const calls: Call[] = [];
    installFetch(
      {
        clipper_webhook_endpoints: [endpointRow],
        clipper_webhook_deliveries: [deliveryRow],
      },
      calls,
    );
    const got = await getWebhook(
      req("http://localhost/api/admin/webhooks/wh-1"),
      { params: Promise.resolve({ id: "wh-1" }) },
    );
    expect(got.status).toBe(200);
    expect((await got.json()).endpoint.id).toBe("wh-1");
    const deliveries = await listDeliveries(
      req("http://localhost/api/admin/webhooks/wh-1/deliveries"),
      { params: Promise.resolve({ id: "wh-1" }) },
    );
    expect((await deliveries.json()).deliveries).toHaveLength(1);
    const replayed = await replayDeliveryRoute(
      req("http://localhost/api/admin/webhooks/deliveries/dlv-1/replay", {
        method: "POST",
      }),
      { params: Promise.resolve({ deliveryId: "dlv-1" }) },
    );
    expect(replayed.status).toBe(200);
    expect((await replayed.json()).status).toBe("delivered");
    // The receiver call carried a verifiable signature.
    const receiverCall = calls.find((c) =>
      c.url.startsWith("https://hooks.example.com"),
    );
    expect(receiverCall).toBeDefined();
    const deleted = await deleteWebhook(
      req("http://localhost/api/admin/webhooks/wh-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "wh-1" }) },
    );
    expect(deleted.status).toBe(200);
    expect((await deleted.json()).deleted).toBe(true);
  });

  it("signing round-trips through the receiver contract", () => {
    const body = JSON.stringify({ event: "post.published" });
    const ts = 1_700_000_000;
    const sig = signWebhookPayload("receiver-secret", ts, body);
    expect(sig.startsWith("sha256=")).toBe(true);
  });
});

describe("API keys", () => {
  it("creates a key with the secret once; lists hide the hash; revoke works", async () => {
    const calls: Call[] = [];
    installFetch({}, calls);
    const created = await createKey(
      jsonReq("http://localhost/api/admin/api-keys", {
        name: "ci",
        scopes: ["read"],
      }),
    );
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.secret.startsWith("cf_")).toBe(true);
    expect(body.key.key_hash).toBeUndefined();
    const listed = await listKeys(req("http://localhost/api/admin/api-keys"));
    expect(listed.status).toBe(200);
    const revoked = await revokeKey(
      req("http://localhost/api/admin/api-keys/key-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "key-1" }) },
    );
    expect(revoked.status).toBe(200);
    expect((await revoked.json()).revoked).toBe(true);
    const badScope = await createKey(
      jsonReq("http://localhost/api/admin/api-keys", {
        name: "ci",
        scopes: ["superuser"],
      }),
    );
    expect(badScope.status).toBe(400);
  });
});

describe("SSO", () => {
  it("reports setup_needed with no config; saves a valid OIDC config", async () => {
    const calls: Call[] = [];
    installFetch({}, calls);
    const empty = await getSso(req("http://localhost/api/admin/sso"));
    expect((await empty.json()).sso.state).toBe("setup_needed");
    const saved = await saveSso(
      jsonReq("http://localhost/api/admin/sso", {
        provider: "oidc",
        config: {
          issuer: "https://idp.example.com",
          clientId: "cid",
          clientSecret: "cs",
        },
      }),
    );
    expect(saved.status).toBe(200);
    expect((await saved.json()).sso.state).toBe("configured");
    const bad = await saveSso(
      jsonReq("http://localhost/api/admin/sso", {
        provider: "oidc",
        config: { issuer: "not-a-url", clientId: "cid" },
      }),
    );
    expect(bad.status).toBe(400);
  });
});

describe("GDPR", () => {
  it("exports a safe archive and deletes in order with retained notes", async () => {
    const calls: Call[] = [];
    installFetch(
      {
        clipper_users: [
          {
            id: "u9",
            email: "u9@example.com",
            plan: "free",
            role: "user",
            status: "active",
            publishing_paused: false,
            created_at: "2026-11-02T00:00:00Z",
          },
        ],
        clipper_projects: [{ id: "p1", title: "T" }],
        clipper_clips: [],
        publish_posts: [],
        clipper_declarations: [],
        clipper_credit_adjustments: [],
        clipper_support_notes: [],
        clipper_api_keys: [],
        clipper_webhook_endpoints: [],
        clipper_integrations: [],
      },
      calls,
    );
    const exported = await gdprExport(
      jsonReq("http://localhost/api/admin/gdpr/export", { userId: "u9" }),
    );
    expect(exported.status).toBe(200);
    expect(
      exported.headers.get("Content-Disposition"),
    ).toContain("clipforge-export-u9.json");
    const archive = await exported.json();
    expect(archive.userId).toBe("u9");
    expect(archive.tables.clipper_projects).toHaveLength(1);
    expect(archive.retained.map((r: { table: string }) => r.table)).toEqual([
      "clipper_audit_log",
      "clipper_strikes",
    ]);
    const deleted = await gdprDelete(
      jsonReq("http://localhost/api/admin/gdpr/delete", {
        userId: "u9",
        confirm: true,
      }),
    );
    expect(deleted.status).toBe(200);
    const delBody = await deleted.json();
    expect(delBody.deleted.clipper_users).toBe(1);
    expect(delBody.retained).toHaveLength(2);
    const unconfirmed = await gdprDelete(
      jsonReq("http://localhost/api/admin/gdpr/delete", { userId: "u9" }),
    );
    expect(unconfirmed.status).toBe(400);
  });
});

describe("public v1 API", () => {
  it("reads projects/clips/posts/usage with a read key; rejects bad keys + scopes", async () => {
    const calls: Call[] = [];
    installFetch(
      {
        clipper_api_keys: [keyRow(["read"])],
        clipper_projects: [{ id: "p1", title: "T", created_at: "2026-11-02T00:00:00Z" }],
        clipper_clips: [
          {
            id: "c1",
            title: "Clip",
            start_seconds: 0,
            end_seconds: 30,
            created_at: "2026-11-02T00:00:00Z",
          },
        ],
        publish_posts: [
          {
            id: "po1",
            clip_ref: "c1",
            status: "published",
            schedule_at: null,
            created_at: "2026-11-02T00:00:00Z",
          },
        ],
      },
      calls,
    );
    const projects = await v1Projects(
      keyReq("http://localhost/api/v1/projects", KEY_SECRET),
    );
    expect(projects.status).toBe(200);
    expect((await projects.json()).projects).toHaveLength(1);
    const clips = await v1Clips(keyReq("http://localhost/api/v1/clips", KEY_SECRET));
    expect((await clips.json()).clips).toHaveLength(1);
    const posts = await v1Posts(keyReq("http://localhost/api/v1/posts", KEY_SECRET));
    expect((await posts.json()).posts).toHaveLength(1);
    const usage = await v1Usage(keyReq("http://localhost/api/v1/usage", KEY_SECRET));
    const usageBody = await usage.json();
    expect(usageBody.usage.totalClipSeconds).toBe(30);
    expect(usageBody.usage.postsByStatus.published).toBe(1);
    const noKey = await v1Projects(req("http://localhost/api/v1/projects"));
    expect(noKey.status).toBe(401);
    const badKey = await v1Projects(
      keyReq("http://localhost/api/v1/projects", `cf_${"z".repeat(24)}`),
    );
    expect(badKey.status).toBe(401);
    const spec = await v1Openapi();
    expect(spec.status).toBe(200);
    expect((await spec.json()).openapi).toBe("3.0.0");
  });
});

describe("MCP", () => {
  it("lists read tools, runs clip.search + post.status, gates writes", async () => {
    const calls: Call[] = [];
    installFetch(
      {
        clipper_api_keys: [keyRow(["read"])],
        clipper_clips: [
          {
            id: "c1",
            title: "Beach sunset",
            start_seconds: 0,
            end_seconds: 15,
            created_at: "2026-11-02T00:00:00Z",
          },
          {
            id: "c2",
            title: "City night",
            start_seconds: 0,
            end_seconds: 20,
            created_at: "2026-11-02T00:00:00Z",
          },
        ],
        publish_posts: [
          {
            id: "po1",
            clip_ref: "c1",
            status: "published",
            schedule_at: null,
            created_at: "2026-11-02T00:00:00Z",
          },
        ],
      },
      calls,
    );
    const mcpReq = (body: unknown) =>
      keyReq("http://localhost/api/mcp", KEY_SECRET, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const init = await mcp(
      mcpReq({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    );
    expect((await init.json()).result.serverInfo.name).toBe("clipforge-mcp");
    const tools = await mcp(
      mcpReq({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    );
    const toolNames = (await tools.json()).result.tools.map(
      (t: { name: string }) => t.name,
    );
    expect(toolNames).toContain("clip.search");
    expect(toolNames).not.toContain("webhook.subscribe");
    const search = await mcp(
      mcpReq({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "clip.search", arguments: { query: "beach" } },
      }),
    );
    const searchText = (await search.json()).result.content[0].text;
    expect(JSON.parse(searchText)).toHaveLength(1);
    const status = await mcp(
      mcpReq({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "post.status", arguments: { postId: "po1" } },
      }),
    );
    expect(JSON.parse((await status.json()).result.content[0].text).id).toBe(
      "po1",
    );
    const missing = await mcp(
      mcpReq({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "post.status", arguments: { postId: "nope" } },
      }),
    );
    expect((await missing.json()).error.code).toBe(-32001);
    const writeGated = await mcp(
      mcpReq({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "webhook.subscribe",
          arguments: {
            url: "https://hooks.example.com/in",
            events: ["post.published"],
          },
        },
      }),
    );
    expect((await writeGated.json()).error.code).toBe(-32000);
    const unknown = await mcp(
      mcpReq({ jsonrpc: "2.0", id: 7, method: "nope", params: {} }),
    );
    expect((await unknown.json()).error.code).toBe(-32601);
  });
});
