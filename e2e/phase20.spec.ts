import { expect, test } from "@playwright/test";

/**
 * ClipForge Phase 20 — professional redesign + device-friendly pass.
 *
 * These specs prove the site is genuinely usable on a phone, not just
 * non-broken: no horizontal scroll anywhere, the nav stays reachable
 * on a narrow viewport, the generate flow opens on a phone, form
 * controls meet the 44px touch rule, and no audited page logs a
 * console error. They run signed-out only — no test accounts, no
 * secrets, no real AI calls.
 */

const ROUTES = [
  "/",
  "/create",
  "/generate",
  "/accounts",
  "/publish",
  "/pricing",
  "/faq",
  "/how-it-works",
  "/signin",
  "/report",
  "/cookies",
  "/acceptable-use",
  "/terms",
  "/privacy",
  "/contact",
  "/copyright",
  "/analytics",
  "/billing",
];

const NAV_LINKS = [
  "/create",
  "/generate",
  "/how-it-works",
  "/faq",
  "/pricing",
  "/publish",
  "/accounts",
  "/analytics",
];

test.describe("Phase 20 viewports", () => {
  for (const [width, height] of [
    [375, 667],
    [768, 1024],
  ] as const) {
    test.describe(`${width}px viewport`, () => {
      test.use({ viewport: { width, height } });

      for (const route of ROUTES) {
        test(`no horizontal scroll on ${route}`, async ({ page }) => {
          await page.goto(route);
          await page.waitForLoadState("domcontentloaded");
          const overflow = await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          );
          expect(overflow).toBe(0);
        });
      }

      test("no console errors on audited pages", async ({ page }) => {
        const errors: string[] = [];
        page.on("console", (msg) => {
          if (msg.type() === "error") errors.push(msg.text());
        });
        page.on("pageerror", (err) => errors.push(String(err)));
        for (const route of ROUTES) {
          await page.goto(route);
          await page.waitForLoadState("domcontentloaded");
        }
        // The React dev-mode eval warning is a dev-server artifact
        // (the site's CSP blocks eval; production React never uses
        // it). A 429 resource failure is the site's own per-IP rate
        // limiter doing its job — the pages degrade to honest
        // notices, not crashes. Filter both; fail on anything else.
        const real = errors.filter(
          (e) =>
            !e.includes("eval() is not supported") &&
            !e.includes("status of 429"),
        );
        expect(real).toEqual([]);
      });
    });
  }

  test.describe("375px phone", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("every nav link is reachable on a phone", async ({ page }) => {
      await page.goto("/");
      for (const href of NAV_LINKS) {
        const link = page.locator(`header nav a[href="${href}"]`).first();
        await expect(link).toHaveCount(1);
        // Scrollable nav bar: the link must be bringable into view,
        // not stranded in a wrapped row the user cannot reach.
        await link.scrollIntoViewIfNeeded();
        await expect(link).toBeVisible();
      }
    });

    test("nav links navigate on a phone", async ({ page }) => {
      await page.goto("/");
      const create = page.locator('header nav a[href="/create"]').first();
      await create.scrollIntoViewIfNeeded();
      await create.click();
      await expect(page).toHaveURL(/\/create/);
      const generate = page
        .locator('header nav a[href="/generate"]')
        .first();
      await generate.scrollIntoViewIfNeeded();
      await generate.click();
      await expect(page).toHaveURL(/\/generate/);
    });

    test("generate flow opens on a phone viewport", async ({ page }) => {
      await page.goto("/generate");
      await expect(
        page.getByRole("heading", { name: "AI Generate Short" }),
      ).toBeVisible();
      await expect(page.getByLabel("Topic")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Generate script" }),
      ).toBeVisible();
    });

    test("form controls meet the 44px touch rule", async ({ page }) => {
      // /report and /generate render with no server setup, so these
      // specs stay green whether or not Supabase is configured
      // (the /signin form only renders when it is).
      await page.goto("/report");
      const name = page.getByLabel("Your name").first();
      const nameBox = await name.boundingBox();
      expect(nameBox?.height).toBeGreaterThanOrEqual(44);
      const file = page.getByRole("button", {
        name: "File takedown notice",
      });
      const fileBox = await file.boundingBox();
      expect(fileBox?.height).toBeGreaterThanOrEqual(44);
      await page.goto("/generate");
      const topic = page.getByLabel("Topic");
      const topicBox = await topic.boundingBox();
      expect(topicBox?.height).toBeGreaterThanOrEqual(44);
    });

    test("phone form text does not trigger iOS auto-zoom", async ({
      page,
    }) => {
      // iOS Safari zooms any focused input below 16px. The phone
      // stylesheet keeps form text at 16px, so no zoom is needed.
      await page.goto("/report");
      const size = await page
        .getByLabel("Your name")
        .first()
        .evaluate((el) => {
          const style = window.getComputedStyle(el);
          return Number.parseFloat(style.fontSize);
        });
      expect(size).toBeGreaterThanOrEqual(16);
    });
  });

  test("footer links resolve (no dead links)", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page.evaluate(() => {
      const seen = new Set<string>();
      for (const a of document.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href") ?? "";
        if (href.startsWith("/")) seen.add(href);
      }
      return [...seen];
    });
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const res = await page.request.get(href);
      expect(
        res.status(),
        `${href} should resolve, got ${res.status()}`,
      ).toBeLessThan(400);
    }
  });

  test("logged-out /admin still redirects to /signin", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/signin/);
  });
});
