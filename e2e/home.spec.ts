import { expect, test } from "@playwright/test";

/**
 * Marketing homepage specs (ClipForge Phase 7).
 * No accounts, no AI calls, no uploads to any server.
 */

test("homepage shows every marketing section", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Turn a video you own into vertical clips",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "See what captioned clips look like" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Everything the clipper does, in one place",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Three steps to a posted clip" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Plans at a glance" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Questions, answered honestly" }),
  ).toBeVisible();
});

test("hero call to action opens the clipper", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Open the clipper" }).first().click();
  await expect(page).toHaveURL(/\/create/);
  await expect(
    page.getByRole("heading", { name: "Create clips" }),
  ).toBeVisible();
});

test("hero upload hands a file to the tool", async ({ page }) => {
  await page.goto("/");
  // Minimal MP4 header ("ftyp" at offset 4) so the tool's magic-byte
  // sniff accepts it as video; no real frames are needed for the
  // handoff assertion (the file name appears once the tool takes it).
  const header = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from("ftypisom"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
  ]);
  await page.setInputFiles("#hero-upload", {
    name: "demo.mp4",
    mimeType: "video/mp4",
    buffer: header,
  });
  await expect(page).toHaveURL(/\/create/);
  await expect(page.getByText("demo.mp4 — 0.0 MB")).toBeVisible();
});

test("homepage states the no-downloader rule", async ({ page }) => {
  await page.goto("/");
  // Scoped to <main>: the footer repeats the same rule, and an
  // unscoped match would hit both.
  await expect(
    page.locator("main").getByText("never downloads videos from any platform"),
  ).toBeVisible();
});
