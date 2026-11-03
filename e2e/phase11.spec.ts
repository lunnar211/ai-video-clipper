import { expect, test } from "@playwright/test";

/**
 * Phase 11 — CC-verified paste import specs.
 *
 * The paste entry must exist on the homepage hero (both boxes) and
 * on /create; a non-allowlisted host is refused by the real route
 * (no mocks needed — the host check runs before any fetch); licence
 * and load flows are covered with route interception, never with
 * real source fetches or real AI calls. Signed out throughout.
 */

test("homepage hero boxes both offer a paste-a-link tab", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#hero-upload")).toHaveCount(1);
  await expect(page.locator("#see-it-work-upload")).toHaveCount(1);
  // Both boxes start in upload mode; each has its own paste tab.
  const tabs = page.getByRole("tab", { name: "Paste a link" });
  await expect(tabs).toHaveCount(2);
  await tabs.first().click();
  await expect(page.locator("#hero-upload-link")).toBeVisible();
  await expect(
    page.getByText("Paste a Wikimedia Commons or Internet Archive link"),
  ).toBeVisible();
});

test("hero paste tab hands the link to the clipper for verification", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paste a link" }).first().click();
  await page.fill(
    "#hero-upload-link",
    "https://commons.wikimedia.org/wiki/File:Example_video.mp4",
  );
  await page.getByRole("button", { name: "Continue in the clipper" }).click();
  await expect(page).toHaveURL(/\/create/);
  // The tool's paste panel auto-verifies the handed-over link: the
  // check runs against the real route, which refuses nothing here
  // before the network — so either the licence panel or a network
  // error appears, but the paste panel itself must be present.
  await expect(
    page.getByRole("heading", { name: "Paste a video link" }),
  ).toBeVisible();
  await expect(page.locator("#cc-paste-url")).toHaveValue(
    "https://commons.wikimedia.org/wiki/File:Example_video.mp4",
  );
});

test("create page routes a YouTube link to the own-YouTube flow (Phase 14)", async ({
  page,
}) => {
  await page.goto("/create");
  await expect(
    page.getByRole("heading", { name: "Paste a video link" }),
  ).toBeVisible();
  await page.fill(
    "#cc-paste-url",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  await page.getByRole("button", { name: "Check licence" }).click();
  // No longer the generic allow-list refusal: the CC box routes
  // YouTube links to the own-YouTube flow below.
  await expect(
    page.getByText("YouTube links don't go through this box"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Your YouTube video flow below/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Only Wikimedia Commons and Internet Archive links"),
  ).toHaveCount(0);
});

test("create page shows a mocked non-free licence refusal", async ({
  page,
}) => {
  await page.route("**/api/imports/cc-verify", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error:
          "That file's licence does not allow reuse here (it restricts commercial use, derivatives, or all rights are reserved).",
        reason: "LICENSE_NOT_FREE",
      }),
    });
  });
  await page.goto("/create");
  await page.fill(
    "#cc-paste-url",
    "https://commons.wikimedia.org/wiki/File:Example_video.mp4",
  );
  await page.getByRole("button", { name: "Check licence" }).click();
  await expect(
    page.getByText("That file's licence does not allow reuse here"),
  ).toBeVisible();
});

test("mocked verified link loads a file into the tool", async ({ page }) => {
  await page.route("**/api/imports/cc-verify", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "verified",
        license: "CC-BY-SA",
        author: "Jane Doe",
        title: "Example video.mp4",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Example_video.mp4",
        attribution:
          '"Example video.mp4" by Jane Doe is licensed under CC-BY-SA. Source: https://commons.wikimedia.org/wiki/File:Example_video.mp4',
        files: [
          {
            name: "Example_video.mp4",
            url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Example_video.mp4",
          },
        ],
      }),
    });
  });
  // The browser file load itself is intercepted too: a minimal MP4
  // header so the tool's magic-byte sniff accepts it as video.
  const header = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from("ftypisom"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
  ]);
  await page.route("https://upload.wikimedia.org/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "video/mp4",
      body: header,
    });
  });
  await page.goto("/create");
  await page.fill(
    "#cc-paste-url",
    "https://commons.wikimedia.org/wiki/File:Example_video.mp4",
  );
  await page.getByRole("button", { name: "Check licence" }).click();
  await expect(
    page.getByText("Licence verified — free to reuse."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load this video" }).click();
  await expect(page.getByText("Example_video.mp4 — 0.0 MB")).toBeVisible();
  await expect(
    page.getByText("Loaded from a verified free licence"),
  ).toBeVisible();
});
