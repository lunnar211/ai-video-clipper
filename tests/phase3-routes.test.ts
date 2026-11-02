import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET as accountsGet } from "@/app/api/accounts/route";
import { GET as connectGet } from "@/app/api/accounts/[platform]/connect/route";
import { POST as createPost } from "@/app/api/publish/posts/route";
import { GET as queueGet } from "@/app/api/publish/queue/route";
import { POST as publishPost } from "@/app/api/publish/posts/[id]/publish/route";
import { createEnvTokenCrypto } from "@/lib/publish/tokens";
import { resetRateLimits } from "@/lib/rate-limit";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PUBLISH_YOUTUBE_ENABLED",
  "YOUTUBE_APP_APPROVED",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "PUBLISH_TOKEN_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];
const savedEnv: Record<string, string | undefined> = {};
const originalFetch = globalThis.fetch;

const ticks = {
  declaration: true,
  musicLicence: true,
  fingerprintReviewed: true,
  platformRules: true,
};
const prePublish = {
  projectId: "proj-1",
  declarationAccepted: true,
  fingerprintScanned: true,
  fingerprintDetected: false,
  licenceProof: null,
  platformRulesAcknowledged: true,
};

function setEnv(pairs: Record<string, string>) {
  for (const [k, v] of Object.entries(pairs)) process.env[k] = v;
}
function req(body: unknown, ip: string) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}
function getReq(ip: string) {
  return new Request("http://localhost/api/test", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("publish/accounts routes (mocked providers)", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    resetRateLimits();
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("accounts GET without a database answers 503 honestly", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await accountsGet(getReq("10.0.0.1"));
    expect(res.status).toBe(503);
  });
  it("connect without OAuth credentials answers 503, with credentials returns an auth URL", async () => {
    setEnv({
      PUBLISH_YOUTUBE_ENABLED: "true",
      YOUTUBE_APP_APPROVED: "true",
      NEXT_PUBLIC_SITE_URL: "https://clipper.example",
    });
    delete process.env.YOUTUBE_CLIENT_ID;
    const noCfg = await connectGet(getReq("10.0.0.2"), {
      params: Promise.resolve({ platform: "youtube" }),
    });
    expect(noCfg.status).toBe(503);
    setEnv({
      YOUTUBE_CLIENT_ID: "client-id",
      YOUTUBE_CLIENT_SECRET: "client-secret",
    });
    const ok = await connectGet(getReq("10.0.0.3"), {
      params: Promise.resolve({ platform: "youtube" }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { authUrl?: string };
    expect(body.authUrl).toContain("accounts.google.com");
    expect(body.authUrl).toContain("client-id");
  });
  it("posts POST rejects an invalid body with 400 and without a database with 503", async () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "srv",
      PUBLISH_YOUTUBE_ENABLED: "true",
      YOUTUBE_APP_APPROVED: "true",
    });
    const bad = await createPost(req({ clipRef: "" }, "10.0.0.4"));
    expect(bad.status).toBe(400);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const noDb = await createPost(
      req(
        {
          clipRef: "clip-1",
          projectId: "proj-1",
          checklistPostRef: "draft-1",
          clipFacts: { durationSec: 45, sizeBytes: 1000, aspect: "9:16" },
          prePublish: {
            projectId: "proj-1",
            declarationAccepted: true,
            fingerprintScanned: true,
            fingerprintDetected: false,
            licenceProof: null,
            platformRulesAcknowledged: true,
          },
          targets: [
            {
              platform: "youtube",
              accountId: "a1",
              description: "D",
              tags: [],
              visibility: "unlisted",
            },
          ],
        },
        "10.0.0.5",
      ),
    );
    expect(noDb.status).toBe(503);
  });
  it("posts POST refuses when no checklist record exists, and creates when it does", async () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "srv",
      PUBLISH_YOUTUBE_ENABLED: "true",
      YOUTUBE_APP_APPROVED: "true",
    });
    const checklistRow = {
      id: "c1",
      post_ref: "draft-1",
      ticks,
      created_at: "2026-11-02T00:00:00Z",
      updated_at: "2026-11-02T00:00:00Z",
    };
    const postRow = {
      id: "p1",
      user_id: null,
      clip_ref: "clip-1",
      project_id: "proj-1",
      media_key: null,
      title: null,
      schedule_at: null,
      timezone: null,
      pre_publish: prePublish,
      checklist_post_ref: "draft-1",
      status: "draft",
      created_at: "2026-11-02T00:00:00Z",
      updated_at: "2026-11-02T00:00:00Z",
    };
    const targetRow = {
      id: "t1",
      post_id: "p1",
      platform: "youtube",
      account_id: "a1",
      title: null,
      description: "D",
      tags: [],
      visibility: "unlisted",
      idempotency_key: "k",
      status: "pending",
      provider_post_id: null,
      provider_url: null,
      error: null,
      attempts: 0,
      created_at: "2026-11-02T00:00:00Z",
      updated_at: "2026-11-02T00:00:00Z",
    };
    const body = {
      clipRef: "clip-1",
      projectId: "proj-1",
      checklistPostRef: "draft-1",
      clipFacts: { durationSec: 45, sizeBytes: 1000, aspect: "9:16" },
      prePublish,
      targets: [
        {
          platform: "youtube",
          accountId: "a1",
          description: "D",
          tags: [],
          visibility: "unlisted",
        },
      ],
    };
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes("clipper_checklists")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      return { ok: true, status: 200, json: async () => [] };
    }) as unknown as typeof fetch;
    const refused = await createPost(req(body, "10.0.0.6"));
    expect(refused.status).toBe(400);
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes("clipper_checklists")) {
        return { ok: true, status: 200, json: async () => [checklistRow] };
      }
      if (url.includes("publish_posts")) {
        return { ok: true, status: 200, json: async () => [postRow] };
      }
      if (url.includes("publish_targets")) {
        return { ok: true, status: 200, json: async () => [targetRow] };
      }
      return { ok: true, status: 200, json: async () => [] };
    }) as unknown as typeof fetch;
    const created = await createPost(req(body, "10.0.0.7"));
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { post?: { id: string } };
    expect(createdBody.post?.id).toBe("p1");
  });
  it("queue GET without a database answers 503", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await queueGet(getReq("10.0.0.8"));
    expect(res.status).toBe(503);
  });
  it("publish route: 503 without a database, 404 for a missing post, 200 happy path on YouTube", async () => {
    const noDb = await publishPost(
      req(
        { clipFacts: { durationSec: 45, sizeBytes: 1000, aspect: "9:16" } },
        "10.0.0.9",
      ),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(noDb.status).toBe(503);

    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "srv",
      PUBLISH_YOUTUBE_ENABLED: "true",
      YOUTUBE_APP_APPROVED: "true",
      YOUTUBE_CLIENT_ID: "client-id",
      YOUTUBE_CLIENT_SECRET: "client-secret",
      PUBLISH_TOKEN_KEY: Buffer.alloc(32).toString("base64"),
      R2_ACCOUNT_ID: "acct",
      R2_ACCESS_KEY_ID: "ak",
      R2_SECRET_ACCESS_KEY: "sk",
      R2_BUCKET: "bucket",
    });
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    })) as unknown as typeof fetch;
    const missing = await publishPost(
      req(
        { clipFacts: { durationSec: 45, sizeBytes: 1000, aspect: "9:16" } },
        "10.0.0.10",
      ),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(missing.status).toBe(404);

    const crypto = createEnvTokenCrypto(process.env)!;
    const postRow = {
      id: "p1",
      user_id: null,
      clip_ref: "clip-1",
      project_id: "proj-1",
      media_key: "tmp/publish/p1",
      title: null,
      schedule_at: null,
      timezone: null,
      pre_publish: prePublish,
      checklist_post_ref: "draft-1",
      status: "draft",
      created_at: "2026-11-02T00:00:00Z",
      updated_at: "2026-11-02T00:00:00Z",
    };
    const targetRow = {
      id: "t1",
      post_id: "p1",
      platform: "youtube",
      account_id: "a1",
      title: null,
      description: "D",
      tags: [],
      visibility: "unlisted",
      idempotency_key: "k",
      status: "pending",
      provider_post_id: null,
      provider_url: null,
      error: null,
      attempts: 0,
      created_at: "2026-11-02T00:00:00Z",
      updated_at: "2026-11-02T00:00:00Z",
    };
    const accountRow = {
      id: "a1",
      user_id: null,
      platform: "youtube",
      account_label: "YouTube account",
      scopes: ["https://www.googleapis.com/auth/youtube.upload"],
      access_token_enc: crypto.encrypt("tok"),
      refresh_token_enc: null,
      token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      token_key_id: "env-v1",
      status: "connected",
      created_at: "2026-11-02T00:00:00Z",
      updated_at: "2026-11-02T00:00:00Z",
    };
    const checklistRow = {
      id: "c1",
      post_ref: "draft-1",
      ticks,
      created_at: "2026-11-02T00:00:00Z",
      updated_at: "2026-11-02T00:00:00Z",
    };
    // Stateful target mock: the publish route re-reads targets after
    // updating them, so PATCH must change what later GETs return.
    const targetState = { ...targetRow };
    globalThis.fetch = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? "GET";
      if (url.includes("googleapis.com")) {
        return { ok: true, status: 200, json: async () => ({ id: "vid-1" }) };
      }
      if (url.includes("r2.cloudflarestorage.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          arrayBuffer: async () => new ArrayBuffer(8),
        };
      }
      if (url.includes("clipper_checklists")) {
        return { ok: true, status: 200, json: async () => [checklistRow] };
      }
      if (url.includes("publish_accounts")) {
        return { ok: true, status: 200, json: async () => [accountRow] };
      }
      if (url.includes("publish_targets")) {
        if (method === "GET") {
          return { ok: true, status: 200, json: async () => [targetState] };
        }
        try {
          Object.assign(targetState, JSON.parse(init?.body ?? "{}"));
        } catch {
          // Keep prior state on an unparsable body.
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (url.includes("publish_posts")) {
        return {
          ok: true,
          status: 200,
          json: async () => (method === "GET" ? [postRow] : {}),
        };
      }
      return { ok: true, status: 200, json: async () => [{}] };
    }) as unknown as typeof fetch;
    const published = await publishPost(
      req(
        { clipFacts: { durationSec: 45, sizeBytes: 1000, aspect: "9:16" } },
        "10.0.0.11",
      ),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(published.status).toBe(200);
    const publishedBody = (await published.json()) as {
      status?: string;
      targets?: Array<{ platform: string; status: string }>;
    };
    expect(publishedBody.status).toBe("published");
    expect(publishedBody.targets?.[0]).toMatchObject({
      platform: "youtube",
      status: "published",
    });
  });
});
