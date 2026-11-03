import { expect, test } from "@playwright/test";

/**
 * Phase 14 — own-YouTube paste UI specs.
 *
 * The Phase 8 youtube-owned API had no UI, so a user pasting their
 * own YouTube link dead-ended in the CC box's generic refusal. These
 * specs pin the fix: the YouTube flow exists on /create, the CC box
 * routes YouTube links to it, and each API failure shows its own
 * specific message. All API responses are intercepted — no real
 * YouTube calls, no test accounts, no secrets. Signed out throughout
 * (the 401 case is the honest signed-out state).
 */

test("create page shows the Your YouTube video flow", async ({ page }) => {
  await page.goto("/create");
  await expect(
    page.getByRole("heading", { name: "Your YouTube video" }),
  ).toBeVisible();
  await expect(page.locator("#yt-owned-url")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verify ownership" }),
  ).toBeVisible();
  await expect(
    page.getByText("never downloaded from YouTube", { exact: false }),
  ).toBeVisible();
});

test("CC box routes a youtu.be link without calling cc-verify", async ({
  page,
}) => {
  let ccCalls = 0;
  await page.route("**/api/imports/cc-verify", async (route) => {
    ccCalls += 1;
    await route.abort();
  });
  await page.goto("/create");
  await page.fill("#cc-paste-url", "https://youtu.be/gml6derYB2k?si=TT9-XKca8S");
  await page.getByRole("button", { name: "Check licence" }).click();
  await expect(
    page.getByText("YouTube links don't go through this box"),
  ).toBeVisible();
  expect(ccCalls).toBe(0);
});

test("own-YouTube flow shows the mismatch message for a 403", async ({
  page,
}) => {
  await page.route("**/api/imports/youtube-owned", async (route) => {
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error:
          "That video is not on your connected YouTube channel — only your own videos can be imported.",
      }),
    });
  });
  await page.goto("/create");
  await page.fill(
    "#yt-owned-url",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  await page.getByRole("button", { name: "Verify ownership" }).click();
  await expect(
    page.getByText("That video is not on your connected YouTube channel"),
  ).toBeVisible();
});

test("own-YouTube flow shows sign-in help for a 401", async ({ page }) => {
  await page.route("**/api/imports/youtube-owned", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Sign in to import from your own YouTube channel.",
      }),
    });
  });
  await page.goto("/create");
  await page.fill(
    "#yt-owned-url",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  await page.getByRole("button", { name: "Verify ownership" }).click();
  await expect(
    page.getByRole("link", { name: "Sign in first" }),
  ).toBeVisible();
});

test("own-YouTube flow shows the verified banner and Studio step", async ({
  page,
}) => {
  await page.route("**/api/imports/youtube-owned", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "verified",
        videoId: "dQw4w9WgXcQ",
        channelId: "UC123",
        channelTitle: "My Channel",
        videoTitle: "My Video",
        accountId: "acc-1",
        note: "Ownership verified. Upload the file itself via direct upload; the server never downloads video bytes.",
      }),
    });
  });
  await page.goto("/create");
  await page.fill(
    "#yt-owned-url",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  await page.getByRole("button", { name: "Verify ownership" }).click();
  await expect(page.getByText("Ownership verified.")).toBeVisible();
  // The banner sentence, not the bare channel name: since Phase 15
  // the rights panel also states the verified channel, so the bare
  // name legitimately appears twice on the page.
  await expect(
    page.getByText("is on your connected channel"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /upload that file above/ }),
  ).toBeVisible();
});

test("hero paste tab links to the YouTube flow and routes YouTube links", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paste a link" }).first().click();
  await expect(
    page.getByRole("link", { name: "Verify ownership in the clipper" }).first(),
  ).toBeVisible();
  await page.fill(
    "#hero-upload-link",
    "https://youtu.be/dQw4w9WgXcQ",
  );
  await page.getByRole("button", { name: "Continue in the clipper" }).click();
  await expect(page).toHaveURL(/\/create#your-youtube-video/);
});
