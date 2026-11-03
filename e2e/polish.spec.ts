import { expect, test } from "@playwright/test";

/**
 * Phase 9 polish specs (ui-ux-pro-max).
 *
 * Mobile-first + touch-target checks at the smallest supported width
 * (375px): no page-level horizontal scroll on the two pages Phase 9
 * touched, hero CTAs at least 44px tall, and the theme toggle free of
 * emoji icons. Specs cover only honest, signed-out states.
 */

test("homepage has no horizontal scroll at 375px and a 44px hero CTA", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const cta = page.getByRole("link", { name: "Open the clipper" }).first();
  await expect(cta).toBeVisible();
  const box = await cta.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test("create page has no horizontal scroll at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/create");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("theme toggle shows text, not emoji icons", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /Switch to (dark|light) mode/ });
  await expect(toggle).toBeVisible();
  const text = (await toggle.textContent())?.trim();
  expect(text).toMatch(/^(Dark|Light)$/);
});
