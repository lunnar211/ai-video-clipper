import { expect, test } from "@playwright/test";

/**
 * ClipForge Phase 13: post without connecting.
 * No accounts, no AI calls, no real platform logins.
 * Pins: the accounts page explains the no-connect path (and never
 * implies the OAuth cards are live), the publish page points at it,
 * the activity route validates + 503s honestly without a database,
 * and the admin aggregate stays gated. The PostClip panel itself
 * only renders after a clip is rendered (which needs a real AI run),
 * so its share/deep-link behavior is pinned in vitest with a mocked
 * share API instead of here — never with a fake clip.
 */

test("accounts page explains posting without connecting", async ({
  page,
}) => {
  await page.goto("/accounts");
  await expect(
    page.getByRole("heading", { name: "Post without connecting" }),
  ).toBeVisible();
  await expect(
    page.getByText("No login is saved anywhere for that path"),
  ).toBeVisible();
  // The OAuth cards below are unchanged and still honest. In this
  // test server there is no database, so /api/accounts answers 503
  // and no cards load at all — the pin is that nothing on the page
  // claims a platform is live.
  await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
});

test("publish page points at the no-connect path", async ({ page }) => {
  await page.goto("/publish");
  await expect(
    page.getByText("Posting without connecting"),
  ).toBeVisible();
});

test("activity route rejects an invalid event", async ({ request }) => {
  const res = await request.post("/api/post-activity", {
    headers: { "x-forwarded-for": "203.0.113.101" },
    data: { clip_id: "clip-1", platform: "youtube", outcome: "published" },
  });
  expect(res.status()).toBe(400);
});

test("activity route 503s honestly without a database", async ({
  request,
}) => {
  // Distinct test IP: the per-IP limiter is shared across routes, so
  // earlier specs' POSTs from localhost would otherwise 429 this one.
  const res = await request.post("/api/post-activity", {
    headers: { "x-forwarded-for": "203.0.113.102" },
    data: { clip_id: "clip-1", platform: "share_sheet", outcome: "shared" },
  });
  expect(res.status()).toBe(503);
  const body = (await res.json()) as { error?: string };
  expect(body.error ?? "").toContain("007_clipforge_phase13");
});

test("admin activity aggregate stays gated", async ({ request }) => {
  const res = await request.get("/api/admin/post-activity");
  expect([401, 403]).toContain(res.status());
});
