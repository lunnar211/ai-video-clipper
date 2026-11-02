import { expect, test } from "@playwright/test";

/**
 * Admin hard-gate + sign-in specs (ClipForge Phase 7).
 * Signed-out states only — no test accounts, no secrets.
 */

test("logged-out visitors are sent to sign-in with no admin UI", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/signin/);
  await expect(
    page.getByRole("heading", { name: "Sign in" }),
  ).toBeVisible();
  // No Admin entry point anywhere on the signed-out page.
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
});

test("sign-in page offers email and Google, and no public sign-up", async ({
  page,
}) => {
  await page.goto("/signin");
  await expect(
    page.getByRole("heading", { name: "Sign in" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with email" }),
  ).toBeVisible();
  await expect(
    // Scoped to the page's own <main> (nested inside the layout's
    // <main>): the header has its own Google button with the same name.
    page
      .locator("main main")
      .getByRole("button", { name: "Sign in with Google" }),
  ).toBeVisible();
  await expect(page.getByText("there is no public sign-up here")).toBeVisible();
});
