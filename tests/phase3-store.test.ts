import { describe, it, expect, vi } from "vitest";
import {
  createAccountRow,
  getAccountRow,
  toPublicAccount,
  createPostRow,
  createTargetRows,
  updateTargetRow,
  upsertAnalyticsRow,
  type PublishAccountRow,
} from "@/lib/publish/store";
import { createEnvTokenCrypto } from "@/lib/publish/tokens";

const db = { url: "https://example.supabase.co", serviceKey: "srv" };

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

// Test-only encrypted token shape (matches EncryptedToken).
const enc = {
  ciphertextB64: "AAA",
  ivB64: "BBB",
  authTagB64: "CCC",
  keyId: "env-v1",
};

describe("publish store helpers (mocked PostgREST)", () => {
  it("creates accounts and strips them to status-only views", async () => {
    const row = {
      id: "a1",
      user_id: null,
      platform: "youtube",
      account_label: "YouTube account",
      scopes: ["https://www.googleapis.com/auth/youtube.upload"],
      access_token_enc: enc,
      refresh_token_enc: null,
      token_expires_at: null,
      token_key_id: "env-v1",
      status: "connected",
      created_at: "2026-11-02T00:00:00Z",
      updated_at: "2026-11-02T00:00:00Z",
    };
    const created = await createAccountRow(
      db,
      {
        user_id: null,
        platform: "youtube",
        account_label: "YouTube account",
        scopes: row.scopes,
        access_token_enc: enc,
        refresh_token_enc: null,
        token_expires_at: null,
        token_key_id: "env-v1",
        status: "connected",
      },
      mockFetch([row]),
    );
    expect(created.id).toBe("a1");
    const pub = toPublicAccount(created as PublishAccountRow);
    expect(pub).not.toHaveProperty("access_token_enc");
    expect(pub.platform).toBe("youtube");
    const found = await getAccountRow(db, "a1", mockFetch([row]));
    expect(found?.id).toBe("a1");
    const missing = await getAccountRow(db, "nope", mockFetch([]));
    expect(missing).toBeNull();
  });
  it("creates posts + targets and upserts analytics", async () => {
    const post = {
      id: "p1",
      user_id: null,
      clip_ref: "clip-1",
      project_id: "proj-1",
      media_key: "tmp/publish/p1",
      title: null,
      schedule_at: null,
      timezone: null,
      pre_publish: null,
      checklist_post_ref: "draft-1",
      status: "draft",
      created_at: "2026-11-02T00:00:00Z",
      updated_at: "2026-11-02T00:00:00Z",
    };
    const createdPost = await createPostRow(
      db,
      {
        user_id: null,
        clip_ref: "clip-1",
        project_id: "proj-1",
        media_key: "tmp/publish/p1",
        title: null,
        schedule_at: null,
        timezone: null,
        pre_publish: null,
        checklist_post_ref: "draft-1",
        status: "draft",
      },
      mockFetch([post]),
    );
    expect(createdPost.id).toBe("p1");
    const target = {
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
    const targets = await createTargetRows(
      db,
      [
        {
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
        },
      ],
      mockFetch([target]),
    );
    expect(targets[0].id).toBe("t1");
    await updateTargetRow(
      db,
      "t1",
      { status: "published", provider_post_id: "vid-1" },
      mockFetch({}),
    );
    const analytics = await upsertAnalyticsRow(
      db,
      {
        post_id: "p1",
        target_id: "t1",
        platform: "youtube",
        views: 10,
        likes: 1,
        comments: 0,
      },
      mockFetch([
        {
          id: "an1",
          post_id: "p1",
          target_id: "t1",
          platform: "youtube",
          views: 10,
          likes: 1,
          comments: 0,
          synced_at: "2026-11-02T00:00:00Z",
        },
      ]),
    );
    expect(analytics.views).toBe(10);
  });
  it("never writes plaintext tokens (encrypt-then-store round trip)", () => {
    const crypto = createEnvTokenCrypto({
      PUBLISH_TOKEN_KEY: Buffer.alloc(32).toString("base64"),
    } as unknown as NodeJS.ProcessEnv)!;
    const stored = crypto.encrypt("real-access-token");
    expect(JSON.stringify(stored)).not.toContain("real-access-token");
    expect(crypto.decrypt(stored)).toBe("real-access-token");
  });
});
