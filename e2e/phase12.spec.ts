import { expect, test } from "@playwright/test";

/**
 * ClipForge Phase 12: professional identity checks.
 * No accounts, no AI calls, no uploads to any server.
 * Pins: no generic gradient washes on the homepage hero, the
 * record-dot wordmark renders, the renamed professional headings
 * are present (and the old generic ones are gone), and the tool
 * page still loads with the paste panel (Phase 11 intact).
 */

test("homepage has no generic gradient washes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[class*="bg-gradient"]')).toHaveCount(0);
});

test("wordmark shows the record dot", async ({ page }) => {
  await page.goto("/");
  const brand = page.getByRole("link", { name: "AI Video Clipper" }).first();
  await expect(brand).toBeVisible();
  // The dot is the accent-colored circle inside the brand link.
  await expect(brand.locator("span.bg-accent.rounded-full")).toHaveCount(1);
});

test("professional headings replace the generic ones", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "See it work", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What the clipper does" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Common questions" }),
  ).toBeVisible();
  await expect(page.getByText("See it work — for real")).toHaveCount(0);
  await expect(
    page.getByText("Everything the clipper does, in one place"),
  ).toHaveCount(0);
  await expect(page.getByText("Questions, answered honestly")).toHaveCount(0);
});

test("tool page still loads with the paste panel", async ({ page }) => {
  await page.goto("/create");
  await expect(
    page.getByRole("heading", { name: "Create clips" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Paste a video link" }),
  ).toBeVisible();
});
