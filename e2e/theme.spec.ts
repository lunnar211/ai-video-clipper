import { expect, test } from "@playwright/test";

/**
 * Dark-mode specs (ClipForge Phase 7).
 * Each test gets an isolated browser context, so localStorage does not
 * leak between the toggle states asserted here.
 */

test("theme toggle flips dark mode and persists across reload", async ({
  page,
}) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(html).toHaveClass(/dark/);
  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(html).not.toHaveClass(/dark/);
});
