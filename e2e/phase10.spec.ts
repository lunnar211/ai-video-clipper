import { expect, test } from "@playwright/test";

/**
 * Phase 10 — "no demo, real only" specs.
 * The homepage must contain no illustration demo section, and the
 * "See it work" upload entry must be the real tool entry (a file
 * picked there opens in the clipper, exactly like the hero box).
 * No accounts, no AI calls, no uploads to any server.
 */

test("homepage has no illustration demo section", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("See what captioned clips look like"),
  ).toHaveCount(0);
  await expect(page.getByText("Illustrated previews")).toHaveCount(0);
  await expect(page.getByText("replace these drawings")).toHaveCount(0);
});

test("see-it-work section is the real tool entry", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "See it work" }),
  ).toBeVisible();
  await expect(
    page.getByText("No preview video, no staged result."),
  ).toBeVisible();
  await expect(page.locator("#see-it-work-upload")).toHaveCount(1);
  // The hero box keeps its own distinct input id — two boxes on one
  // page must never share an id.
  await expect(page.locator("#hero-upload")).toHaveCount(1);
});

test("see-it-work upload hands a file to the tool", async ({ page }) => {
  await page.goto("/");
  // Minimal MP4 header ("ftyp" at offset 4) so the tool's magic-byte
  // sniff accepts it as video; no real frames are needed for the
  // handoff assertion (the file name appears once the tool takes it).
  const header = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from("ftypisom"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
  ]);
  await page.setInputFiles("#see-it-work-upload", {
    name: "real.mp4",
    mimeType: "video/mp4",
    buffer: header,
  });
  await expect(page).toHaveURL(/\/create/);
  await expect(page.getByText("real.mp4 — 0.0 MB")).toBeVisible();
});
