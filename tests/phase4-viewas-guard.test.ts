/**
 * ClipForge Phase 4 — view-as write guards.
 *
 * A valid view-as cookie must make publish post creation, publish-now,
 * and billing checkout refuse with 403 — before any work happens.
 * A request without the cookie passes the guard (it then fails later
 * on unrelated setup, which proves the guard did not fire).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createViewAsMarker, VIEW_AS_COOKIE } from "@/lib/admin/impersonation";
import { parseTokenKey } from "@/lib/publish/tokens";
import { POST as createPost } from "@/app/api/publish/posts/route";
import { POST as checkout } from "@/app/api/billing/checkout/route";

const TOKEN_KEY = Buffer.alloc(32, 13).toString("base64");

function viewAsCookie(): string {
  const key = parseTokenKey(TOKEN_KEY) as Buffer;
  return `${VIEW_AS_COOKIE}=${createViewAsMarker(
    {
      adminId: "admin-1",
      targetUserId: "user-2",
      reason: "Support investigation needed",
    },
    key,
  )}`;
}

beforeEach(() => {
  process.env.PUBLISH_TOKEN_KEY = TOKEN_KEY;
});

describe("view-as write guards", () => {
  it("publish post creation refuses view-as with 403", async () => {
    const res = await createPost(
      new Request("http://localhost/api/publish/posts", {
        method: "POST",
        headers: {
          cookie: viewAsCookie(),
          "x-forwarded-for": "203.0.113.1",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("read-only");
  });

  it("billing checkout refuses view-as with 403", async () => {
    const res = await checkout(
      new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: {
          cookie: viewAsCookie(),
          "x-forwarded-for": "203.0.113.2",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("read-only");
  });

  it("requests without a view-as cookie pass the guard", async () => {
    const res = await createPost(
      new Request("http://localhost/api/publish/posts", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.3" },
        body: JSON.stringify({}),
      }),
    );
    // 400 (invalid body) proves the guard did not fire; 403 would
    // mean the guard misfired.
    expect(res.status).toBe(400);
  });
});
