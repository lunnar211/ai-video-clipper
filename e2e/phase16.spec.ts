import { expect, test } from "@playwright/test";

/**
 * Phase 16 — one smooth own-YouTube journey specs.
 *
 * The verify → Studio-download → upload steps used to live in
 * three separate places, and the hero paste dropped its link, so
 * the journey felt broken even though every step worked. These
 * specs pin the join: steps stay visible with states that advance,
 * the hero link arrives pre-filled and verifies on arrival, the
 * verified record attaches to the uploaded project, and every
 * error box carries its fix as a link. All API responses are
 * intercepted — no real YouTube calls, no test accounts, no
 * secrets. The upload fixture is a 12-byte MP4-header buffer, so
 * the header sniff passes without a real video file.
 */

const VERIFIED_BODY = {
  status: "verified",
  videoId: "dQw4w9WgXcQ",
  channelId: "UC123",
  channelTitle: "My Channel",
  videoTitle: "My Video",
  accountId: "acc-1",
  note: "Ownership verified. Upload the file itself via direct upload; the server never downloads video bytes.",
};

// Minimal MP4 header: "ftyp" at offset 4, so sniffHeader reads "video".
const MP4_HEADER = Buffer.from([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0,
]);

test("create page shows the guided journey with step 1 current", async ({
  page,
}) => {
  await page.goto("/create");
  const list = page.getByRole("list", {
    name: "Your YouTube video journey",
  });
  await expect(list).toBeVisible();
  await expect(
    list.getByText("Step 1 — Verify your YouTube link"),
  ).toBeVisible();
  await expect(
    list.getByText("Step 2 — Download your own video from YouTube Studio"),
  ).toBeVisible();
  await expect(list.getByText("Step 3 — Upload that file here")).toBeVisible();
  await expect(
    list.getByText("paste your own YouTube link below"),
  ).toBeVisible();
});

test("verified flow advances the steps and attaches on upload", async ({
  page,
}) => {
  await page.route("**/api/imports/youtube-owned", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(VERIFIED_BODY),
    });
  });
  await page.goto("/create");
  await page.fill(
    "#yt-owned-url",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  await page.getByRole("button", { name: "Verify ownership" }).click();
  const list = page.getByRole("list", {
    name: "Your YouTube video journey",
  });
  await expect(
    list.getByText("Done — “My Video” is on your connected channel"),
  ).toBeVisible();
  await expect(
    list.getByText("open Content, use the ⋮ menu on this video"),
  ).toBeVisible();
  await page.setInputFiles("#yt-journey-upload", {
    name: "studio-download.mp4",
    mimeType: "video/mp4",
    buffer: MP4_HEADER,
  });
  await expect(
    list.getByText("Done — uploaded: studio-download.mp4."),
  ).toBeVisible();
  await expect(
    list.getByText("Your verified source record is attached to this project"),
  ).toBeVisible();
  await expect(
    page.getByText('ownership verified on channel "My Channel"'),
  ).toBeVisible();
});

test("upload without verification stays honestly unverified", async ({
  page,
}) => {
  await page.goto("/create");
  await page.setInputFiles("#yt-journey-upload", {
    name: "studio-download.mp4",
    mimeType: "video/mp4",
    buffer: MP4_HEADER,
  });
  const list = page.getByRole("list", {
    name: "Your YouTube video journey",
  });
  await expect(
    list.getByText("This file was uploaded without verification"),
  ).toBeVisible();
  await expect(
    page.getByText("Source not recorded — unverified"),
  ).toBeVisible();
});

test("every YouTube error box carries its fix as a link", async ({
  page,
}) => {
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

  await page.route("**/api/imports/youtube-owned", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error:
          "No YouTube account is connected for this user — connect it from the account page while signed in, then retry.",
      }),
    });
  });
  await page.getByRole("button", { name: "Verify ownership" }).click();
  await expect(
    page.getByRole("link", {
      name: "Connect your YouTube channel on the account page",
    }),
  ).toBeVisible();

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
  await page.getByRole("button", { name: "Verify ownership" }).click();
  const fallback = page.getByRole("link", {
    name: "upload a video file directly",
  });
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute("href", "#upload-dropzone");
});

test("hero YouTube paste arrives pre-filled and verifies on arrival", async ({
  page,
}) => {
  await page.route("**/api/imports/youtube-owned", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Sign in to import from your own YouTube channel.",
      }),
    });
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Paste a link" }).first().click();
  await page.fill("#hero-upload-link", "https://youtu.be/dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Continue in the clipper" }).click();
  await expect(page).toHaveURL(/\/create#your-youtube-video/);
  // The link survived the handoff: the box is pre-filled, and the
  // check already ran on arrival (signed-out 401 help is showing).
  await expect(page.locator("#yt-owned-url")).toHaveValue(
    "https://youtu.be/dQw4w9WgXcQ",
  );
  await expect(
    page.getByRole("link", { name: "Sign in first" }),
  ).toBeVisible();
});
